# Mermaid BP para escritorio

Aplicación Tauri 2 para Windows x64. Incluye la web compilada y sus extensiones, sin levantar un servidor local.

## Desarrollo

Requisitos para compilar: Node.js >=22.18, Rust estable con el target MSVC, Visual Studio Build Tools con desarrollo de escritorio C++ y WebView2.

Desde la raíz:

```powershell
npm ci
npm ci --prefix desktop-app
npm run desktop:dev
npm run desktop:build
```

El instalador se genera en `desktop-app/src-tauri/target/release/bundle/nsis/`. El usuario final no necesita Node, Rust ni herramientas de desarrollo.

El guardado abre un diálogo nativo y permite elegir dónde escribir cada archivo. El documento conserva el comportamiento del editor: hay que guardarlo antes de cerrar. Las extensiones se incluyen al compilar; cambiar sus archivos requiere volver a generar el instalador.

## Publicación

El workflow `Aplicación de escritorio Windows` compila y prueba al subir un tag `*-alpha.*`. La versión del tag debe coincidir con `package.json`, `Cargo.toml` y `tauri.conf.json` de esta carpeta. Adjunta el instalador y su SHA256 a la release del mismo nombre. También puede ejecutarse manualmente.

Los instaladores no están firmados. La primera instalación puede necesitar internet para instalar WebView2 si el equipo no dispone de él. El editor y su renderizado usan recursos locales.
