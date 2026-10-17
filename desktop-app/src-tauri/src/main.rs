#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{ WebviewUrl, WebviewWindowBuilder};
mod plugins;

const BRIDGE: &str = include_str!("bridge.js");
static PREVIEW_ID: AtomicUsize = AtomicUsize::new(1);

#[cfg(all(windows, feature = "updater-e2e-cdp"))]
fn updater_e2e_browser_args() -> String {
    let requested = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")
        .unwrap_or_else(|_| "--remote-debugging-port=9222".into());
    // Wry's explicit browser args replace its defaults, so retain those defaults here.
    format!("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection {requested}")
}

#[tauri::command]
async fn save_document(filename: String, bytes: Vec<u8>) -> Result<bool, String> {
    if bytes.len() > 128 * 1024 * 1024 {
        return Err("El archivo supera el límite de 128 MB.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let name = filename.rsplit(['/', '\\']).next().unwrap_or("diagrama.mmd");
        let Some(path) = rfd::FileDialog::new().set_file_name(name).save_file() else {
            return Ok(false);
        };
        std::fs::write(path, bytes).map_err(|error| error.to_string())?;
        Ok(true)
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn open_preview(app: tauri::AppHandle, window: tauri::WebviewWindow, url: String) -> Result<(), String> {
    let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
    let current = window.url().map_err(|error| error.to_string())?;
    if target.origin() != current.origin() || !target.path().starts_with("/plugins/") || !target.path().ends_with(".html") {
        return Err("Solo se permiten vistas previas locales de extensiones.".into());
    }
    let label = format!("preview-{}", PREVIEW_ID.fetch_add(1, Ordering::Relaxed));
    let builder = WebviewWindowBuilder::new(&app, label, WebviewUrl::External(target))
        .title("Mermaid BP · vista previa")
        .inner_size(1100.0, 800.0)
        .disable_drag_drop_handler()
        .initialization_script(BRIDGE)
        .on_navigation(move |url| url.origin() == current.origin());
    #[cfg(all(windows, feature = "updater-e2e-cdp"))]
    let builder = builder.additional_browser_args(&updater_e2e_browser_args());
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![save_document, open_preview, plugins::plugins_root, plugins::list_plugins, plugins::choose_plugin_folder, plugins::install_plugin, plugins::remove_plugin])
        .setup(|app| {
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Mermaid BP")
                .inner_size(1440.0, 900.0)
                .min_inner_size(800.0, 600.0)
                .disable_drag_drop_handler()
                .initialization_script(BRIDGE)
                .on_navigation(|url| url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost") || (cfg!(debug_assertions) && url.host_str() == Some("127.0.0.1")));
            #[cfg(all(windows, feature = "updater-e2e-cdp"))]
            let builder = builder.additional_browser_args(&updater_e2e_browser_args());
            builder.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Mermaid BP");
}
