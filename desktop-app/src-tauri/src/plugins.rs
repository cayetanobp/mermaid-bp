//! User-installed desktop plugins live in app data, never in the bundled resources.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cap_std::{ambient_authority, fs::Dir};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, Manager};

const MAX_FILES: usize = 256;
const MAX_TOTAL_BYTES: usize = 32 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES: usize = 1024;
const MAX_DIRECTORY_DEPTH: usize = 16;
static STAGING_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub async fn choose_plugin_folder() -> Result<Option<Value>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let Some(folder) = rfd::FileDialog::new()
            .set_title("Elegir carpeta de plugin")
            .pick_folder()
        else {
            return Ok(None);
        };
        read_plugin_folder(&folder).map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn read_plugin_folder(folder: &Path) -> Result<Value, String> {
    let folder_metadata = fs::symlink_metadata(folder).map_err(|error| error.to_string())?;
    if is_reparse_point(&folder_metadata) || !folder_metadata.is_dir() {
        return Err("La carpeta seleccionada no es un directorio válido.".into());
    }
    let canonical_root = fs::canonicalize(folder).map_err(|error| error.to_string())?;
    let root = Dir::open_ambient_dir(&canonical_root, ambient_authority())
        .map_err(|error| error.to_string())?;
    let folder_name = folder
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "No se pudo leer el nombre de la carpeta seleccionada.".to_string())?;

    let mut paths = Vec::new();
    let mut contents: Vec<String> = Vec::new();
    let mut total_bytes = 0usize;
    let mut entry_count = 0usize;
    collect_plugin_files(
        &root,
        Path::new(""),
        0,
        &mut entry_count,
        &mut total_bytes,
        &mut paths,
        &mut contents,
    )?;

    Ok(serde_json::json!({
        "folderName": folder_name,
        "paths": paths,
        "contents": contents,
    }))
}

fn collect_plugin_files(
    current: &Dir,
    relative_dir: &Path,
    depth: usize,
    entry_count: &mut usize,
    total_bytes: &mut usize,
    paths: &mut Vec<String>,
    contents: &mut Vec<String>,
) -> Result<(), String> {
    if depth > MAX_DIRECTORY_DEPTH {
        return Err("La carpeta del plugin supera la profundidad permitida.".into());
    }
    for entry in current.entries().map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        *entry_count += 1;
        if *entry_count > MAX_DIRECTORY_ENTRIES {
            return Err("La carpeta del plugin contiene demasiadas entradas.".into());
        }
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or_else(|| "La carpeta contiene un nombre de archivo no compatible.".to_string())?;
        let metadata = current.symlink_metadata(name).map_err(|error| error.to_string())?;
        let file_type = metadata.file_type();
        if file_type.is_symlink() {
            return Err("La carpeta del plugin no puede contener enlaces simbólicos.".into());
        }
        let relative_path = relative_dir.join(name);
        // Windows junctions and other reparse points are not always reported
        // as symbolic links by portable file-type APIs. Check metadata fetched
        // relative to the current capability handle, not an ambient path.
        if is_cap_reparse_point(&metadata) {
            return Err("La carpeta del plugin no puede contener enlaces simbólicos o puntos de reanálisis.".into());
        }
        if file_type.is_dir() {
            let child = current.open_dir(name).map_err(|error| error.to_string())?;
            let child_metadata = child.dir_metadata().map_err(|error| error.to_string())?;
            if is_cap_reparse_point(&child_metadata) || !child_metadata.is_dir() {
                return Err("La carpeta del plugin contiene un tipo de archivo no admitido.".into());
            }
            collect_plugin_files(
                &child,
                &relative_path,
                depth + 1,
                entry_count,
                total_bytes,
                paths,
                contents,
            )?;
            continue;
        }
        if !file_type.is_file() {
            return Err("La carpeta del plugin contiene un tipo de archivo no admitido.".into());
        }
        if paths.len() >= MAX_FILES {
            return Err("La carpeta supera el límite de 256 archivos.".into());
        }

        let mut parts = Vec::new();
        for component in relative_path.components() {
            match component {
                Component::Normal(part) => parts.push(
                    part.to_str()
                        .ok_or_else(|| "La carpeta contiene un nombre de archivo no compatible.".to_string())?,
                ),
                _ => return Err("La carpeta contiene una ruta de archivo no válida.".into()),
            }
        }
        let relative_path = parts.join("/");
        relative_file_path(&relative_path)?;

        let mut file = current.open(name).map_err(|error| error.to_string())?;
        let file_metadata = file.metadata().map_err(|error| error.to_string())?;
        if is_cap_reparse_point(&file_metadata) || !file_metadata.is_file() {
            return Err("La carpeta del plugin contiene un archivo no regular.".into());
        }
        let remaining = MAX_TOTAL_BYTES.saturating_sub(*total_bytes);
        let file_size = usize::try_from(file_metadata.len())
            .map_err(|_| "El plugin supera el límite de 32 MB.".to_string())?;
        if file_size > remaining {
            return Err("El plugin supera el límite de 32 MB.".into());
        }
        let mut bytes = Vec::with_capacity(file_size);
        file.by_ref()
            .take(remaining as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        if bytes.len() > remaining {
            return Err("El plugin supera el límite de 32 MB.".into());
        }
        *total_bytes += bytes.len();
        paths.push(relative_path);
        contents.push(BASE64.encode(bytes));
    }
    Ok(())
}

fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn is_cap_reparse_point(metadata: &cap_std::fs::Metadata) -> bool {
    if metadata.is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        false
    }
}

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
pub async fn install_plugin(app: AppHandle, id: String, paths: Vec<String>, contents: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let contents = decode_contents(&contents)?;
        install_plugin_blocking(&app, &id, &paths, &contents)
    })
        .await.map_err(|e| e.to_string())?
}

fn decode_contents(encoded: &[String]) -> Result<Vec<Vec<u8>>, String> {
    if encoded.len() > MAX_FILES {
        return Err("La carpeta supera el límite de 256 archivos.".into());
    }
    let max_encoded_total = MAX_TOTAL_BYTES
        .checked_add(2)
        .and_then(|size| size.checked_div(3))
        .and_then(|groups| groups.checked_mul(4))
        .ok_or_else(|| "El plugin supera el límite de 32 MB.".to_string())?;
    let encoded_total = encoded.iter().try_fold(0usize, |total, content| total.checked_add(content.len()))
        .ok_or_else(|| "El plugin supera el límite de 32 MB.".to_string())?;
    if encoded_total > max_encoded_total {
        return Err("El plugin supera el límite de 32 MB.".into());
    }
    let mut total = 0usize;
    let mut decoded = Vec::with_capacity(encoded.len());
    for content in encoded {
        let max_encoded = MAX_TOTAL_BYTES
            .checked_add(2)
            .and_then(|size| size.checked_div(3))
            .and_then(|groups| groups.checked_mul(4))
            .ok_or_else(|| "El plugin supera el límite de 32 MB.".to_string())?;
        if content.len() > max_encoded {
            return Err("El plugin supera el límite de 32 MB.".into());
        }
        let bytes = BASE64
            .decode(content)
            .map_err(|_| "El paquete contiene datos de archivo no válidos.".to_string())?;
        total = total
            .checked_add(bytes.len())
            .ok_or_else(|| "El plugin supera el límite de 32 MB.".to_string())?;
        if total > MAX_TOTAL_BYTES {
            return Err("El plugin supera el límite de 32 MB.".into());
        }
        decoded.push(bytes);
    }
    Ok(decoded)
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

    #[test]
    fn decodes_bounded_base64_install_payloads() {
        assert_eq!(decode_contents(&[BASE64.encode(b"plugin")]).unwrap(), vec![b"plugin".to_vec()]);
        assert!(decode_contents(&["%%%".into()]).is_err());
        let too_large = BASE64.encode(vec![0; MAX_TOTAL_BYTES + 1]);
        assert!(decode_contents(&[too_large]).is_err());
    }
}
