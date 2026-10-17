//! User-installed desktop plugins live in app data, never in the bundled resources.

use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager};

const MAX_FILES: usize = 256;
const MAX_TOTAL_BYTES: usize = 32 * 1024 * 1024;
static STAGING_ID: AtomicU64 = AtomicU64::new(1);

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.as_bytes()[0].is_ascii_lowercase()
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.ends_with('-')
}

fn relative_file_path(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.contains('\\') || raw.contains('\0') || raw.contains(':') {
        return Err("La ruta del archivo no es relativa y válida.".into());
    }
    let path = Path::new(raw);
    if path.is_absolute() || path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("La ruta debe ser relativa y no puede contener traversal.".into());
    }
    Ok(path.to_path_buf())
}

fn validate_payload(id: &str, paths: &[String], contents: &[Vec<u8>]) -> Result<(Value, String), String> {
    if !valid_id(id) { return Err("El identificador del plugin no es válido.".into()); }
    if paths.len() != contents.len() || paths.is_empty() || paths.len() > MAX_FILES {
        return Err("La lista de archivos del plugin no es válida.".into());
    }
    let total = contents.iter().try_fold(0usize, |n, bytes| n.checked_add(bytes.len()))
        .ok_or_else(|| "El tamaño total del plugin supera el límite.".to_string())?;
    if total > MAX_TOTAL_BYTES { return Err("El plugin supera el límite de 32 MB.".into()); }

    let mut seen = HashSet::new();
    let mut manifest = None;
    for (raw, bytes) in paths.iter().zip(contents) {
        let relative = relative_file_path(raw)?;
        // Case folding avoids aliases on Windows and remains conservative on other platforms.
        let key = relative.to_string_lossy().to_lowercase();
        if !seen.insert(key) { return Err("El paquete contiene rutas duplicadas.".into()); }
        if relative == Path::new("plugin.json") {
            let parsed: Value = serde_json::from_slice(bytes)
                .map_err(|_| "plugin.json no contiene JSON válido.".to_string())?;
            let obj = parsed.as_object().ok_or_else(|| "plugin.json debe ser un objeto JSON.".to_string())?;
            let string = |key: &str| obj.get(key).and_then(Value::as_str).filter(|s| !s.trim().is_empty());
            if string("id") != Some(id) { return Err("El id de plugin.json debe coincidir con el paquete.".into()); }
            for key in ["name", "description", "version"] {
                if string(key).is_none() { return Err(format!("plugin.json requiere el campo {key}.")); }
            }
            if obj.get("apiVersion").and_then(Value::as_u64) != Some(1) {
                return Err("Solo se admite apiVersion 1.".into());
            }
            if obj.get("enabledByDefault").is_some_and(|value| !value.is_boolean()) {
                return Err("El campo enabledByDefault debe ser booleano.".into());
            }
            let entry = string("entry").unwrap_or("index.js");
            if !entry.ends_with(".js") && !entry.ends_with(".mjs") {
                return Err("La entrada del plugin debe ser un archivo JavaScript.".into());
            }
            let entry_path = relative_file_path(entry).map_err(|_| "La entrada del plugin debe ser una ruta relativa válida.".to_string())?;
            manifest = Some((parsed, entry_path));
        }
    }
    let (manifest, entry) = manifest.ok_or_else(|| "Falta plugin.json.".to_string())?;
    let entry_key = entry.to_string_lossy().to_lowercase();
    if !seen.contains(&entry_key) { return Err("La entrada indicada no existe en el paquete.".into()); }
    Ok((manifest, entry.to_string_lossy().into_owned()))
}

fn plugins_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("plugins");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

#[tauri::command]
pub fn plugins_root(app: AppHandle) -> Result<String, String> {
    Ok(plugins_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_plugins(app: AppHandle) -> Result<Vec<Value>, String> {
    let root = plugins_dir(&app)?;
    let mut items = Vec::new();
    for item in fs::read_dir(root).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        if !item.file_type().map_err(|e| e.to_string())?.is_dir() { continue; }
        let manifest_path = item.path().join("plugin.json");
        let Ok(bytes) = fs::read(manifest_path) else { continue };
        let Ok(manifest) = serde_json::from_slice::<Value>(&bytes) else { continue };
        if manifest.get("id").and_then(Value::as_str) == item.file_name().to_str() {
            items.push(manifest);
        }
    }
    Ok(items)
}

#[tauri::command]
pub async fn install_plugin(app: AppHandle, id: String, paths: Vec<String>, contents: Vec<Vec<u8>>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || install_plugin_blocking(&app, &id, &paths, &contents))
        .await.map_err(|e| e.to_string())?
}

fn install_plugin_blocking(app: &AppHandle, id: &str, paths: &[String], contents: &[Vec<u8>]) -> Result<(), String> {
    validate_payload(id, paths, contents)?;
    let root = plugins_dir(app)?;
    let dest = root.join(id);
    let nonce = STAGING_ID.fetch_add(1, Ordering::Relaxed);
    let stage = root.join(format!(".{id}.staging-{nonce}"));
    let backup = root.join(format!(".{id}.backup-{nonce}"));
    fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let write_result = (|| {
        for (raw, bytes) in paths.iter().zip(contents) {
            let relative = relative_file_path(raw)?;
            let target = stage.join(relative);
            if let Some(parent) = target.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            fs::write(target, bytes).map_err(|e| e.to_string())?;
        }
        Ok::<(), String>(())
    })();
    if let Err(error) = write_result { let _ = fs::remove_dir_all(&stage); return Err(error); }

    let had_old = dest.exists();
    if had_old { fs::rename(&dest, &backup).map_err(|e| { let _ = fs::remove_dir_all(&stage); e.to_string() })?; }
    if let Err(error) = fs::rename(&stage, &dest) {
        if had_old { let _ = fs::rename(&backup, &dest); }
        let _ = fs::remove_dir_all(&stage);
        return Err(error.to_string());
    }
    if had_old { let _ = fs::remove_dir_all(backup); }
    Ok(())
}

#[tauri::command]
pub async fn remove_plugin(app: AppHandle, id: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !valid_id(&id) { return Err("El identificador del plugin no es válido.".into()); }
        let root = plugins_dir(&app)?;
        let target = root.join(id);
        if !target.exists() { return Ok(false); }
        if !target.is_dir() { return Err("La ruta del plugin no es un directorio.".into()); }
        fs::remove_dir_all(target).map_err(|e| e.to_string())?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(entry: &str) -> (Vec<String>, Vec<Vec<u8>>) {
        let manifest = format!(r#"{{"id":"demo-plugin","name":"Demo","description":"Demo plugin","version":"1.0.0","apiVersion":1,"entry":"{entry}"}}"#);
        (vec!["plugin.json".into(), "index.js".into()], vec![manifest.into_bytes(), b"".to_vec()])
    }

    #[test]
    fn accepts_valid_package_and_rejects_bad_manifest_entry() {
        let (paths, contents) = payload("index.js");
        assert!(validate_payload("demo-plugin", &paths, &contents).is_ok());
        let (paths, contents) = payload("missing.js");
        assert!(validate_payload("demo-plugin", &paths, &contents).is_err());
    }

    #[test]
    fn rejects_traversal_absolute_and_duplicate_paths() {
        assert!(relative_file_path("../escape").is_err());
        assert!(relative_file_path("C:/escape").is_err());
        let (mut paths, contents) = payload("index.js");
        paths.push("INDEX.JS".into());
        let mut contents = contents;
        contents.push(vec![]);
        assert!(validate_payload("demo-plugin", &paths, &contents).is_err());
    }
}
