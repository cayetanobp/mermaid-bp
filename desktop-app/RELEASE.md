Mermaid BP para Windows x64 y Ubuntu 24.04 amd64, empaquetado con Tauri 2.

- Editor y recursos incluidos: funciona sin servidor, npm ni Docker.
- Guardado de MMD y exportaciones SVG/PNG mediante el diálogo nativo.
- Gestión de extensiones opcionales desde la aplicación.
- Instalador por usuario; instala WebView2 si falta (requiere internet en ese caso).

Descarga y ejecuta el archivo `Mermaid.BP_*_x64-setup.exe`. El instalador no tiene firma de código; Windows puede mostrar una advertencia de SmartScreen.

En Ubuntu 24.04 instala `Mermaid.BP_1.0.0-beta.1_amd64.deb` con `sudo apt install ./Mermaid.BP_1.0.0-beta.1_amd64.deb`. El paquete declara las dependencias GTK y WebKitGTK que necesita la aplicación. Para compilar en Windows con Docker Desktop y motor Linux, ejecuta `./scripts/build-linux-deb-docker.ps1` desde PowerShell; el `.deb` aparece en `desktop-app/src-tauri/target/linux-bundle/deb/`.

El flujo `Aplicación de escritorio Linux` crea el paquete en Ubuntu 24.04, lo instala en el runner y ejecuta la aplicación instalada bajo Xvfb. WebDriver edita el diagrama y `xdotool` completa los diálogos GTK para guardar `.mmd` y exportar SVG. Los logs y la captura de pantalla se adjuntan al job.

## Extensiones compatibles

Esta beta del núcleo es compatible con BookStack 1.0.0 mediante la API pública v1. Descarga el [ZIP instalable de BookStack](https://github.com/cayetanobp/mermaid-bp-plugins/releases/tag/bookstack-v1.0.0) y su archivo `.sha256` desde la release del plugin; comprueba el hash, extrae el ZIP y en Mermaid BP abre `Configuración > Extensiones > Seleccionar carpeta`. Elige la carpeta `bookstack/`, que contiene `plugin.json`, revisa el nombre y la versión y confirma la instalación. Consulta las [instrucciones de extensiones](https://github.com/cayetanobp/mermaid-bp-plugins#readme) y la [release de BookStack](https://github.com/cayetanobp/mermaid-bp-plugins/releases/tag/bookstack-v1.0.0).
