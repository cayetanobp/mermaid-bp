# Mermaid BP para escritorio

Aplicación Tauri 2 para Windows x64. Incluye la web compilada y sus extensiones, sin levantar un servidor local.

El código original de Mermaid BP se distribuye bajo GNU AGPL-3.0-only. El texto completo y los avisos están en la raíz del proyecto y se incluyen en la distribución.

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

El guardado abre un diálogo nativo y permite elegir dónde escribir cada archivo. El documento conserva el comportamiento del editor: hay que guardarlo antes de cerrar. Los plugins incluidos con una compilación forman parte del instalador; los plugins adicionales se pueden instalar desde la aplicación.

## Instalar plugins

Los plugins se mantienen en el [repositorio separado de plugins](https://github.com/cayetanobp/mermaid-bp-plugins). Consigue y descomprime la carpeta del plugin que quieras instalar. En Mermaid BP abre `Configuración > Extensiones`, pulsa `Seleccionar carpeta`, elige la carpeta que contiene `plugin.json` y revisa el nombre y la versión. Confirma la advertencia de confianza y pulsa `Instalar plugin`.

La aplicación guarda la copia en su almacenamiento privado. No tienes que buscar una carpeta del sistema ni compilar la aplicación. Para quitar un plugin, pulsa `Retirar` en su fila. Los plugins ejecutan código con los permisos de la aplicación; instala solo código en el que confíes.

En Windows, abre `Configuración > General > Actualizaciones > Buscar actualizaciones` para consultar el canal beta. La aplicación muestra la versión y las notas antes de descargarla; verifica la firma del paquete NSIS, lo instala y se reinicia. Los documentos guardados, las preferencias y los datos locales de extensiones se mantienen fuera del instalador.

## Publicación

El workflow `Aplicación de escritorio Windows` se ejecuta manualmente desde `main` y sube el instalador, el archivo NSIS del updater y su firma como artefacto privado de Actions. La versión publicada debe coincidir con `package.json`, `Cargo.toml` y `tauri.conf.json` de esta carpeta. `Publicar beta` usa el ID de una compilación revisada y adjunta el instalador y su SHA256, el archivo updater y su firma a la release versionada.

El workflow requiere el secreto de GitHub Actions `TAURI_SIGNING_PRIVATE_KEY`, que contiene la clave privada generada por `tauri signer generate`; su contraseña está vacía. Conserva una copia protegida de esa clave: perderla impediría firmar futuras actualizaciones para las instalaciones existentes. Tauri 2 firma el instalador NSIS `.exe` y `Publicar beta` adjunta ese instalador, su firma `.exe.sig`, el checksum SHA256 y `latest.json` a la release prerelease `beta`, el canal consultado por la aplicación.

Los instaladores no están firmados. La primera instalación puede necesitar internet para instalar WebView2 si el equipo no dispone de él. El editor y su renderizado usan recursos locales.
