Mermaid BP para Windows x64 y Ubuntu 24.04 amd64, empaquetado con Tauri 2.

- Editor y recursos incluidos: funciona sin servidor, npm ni Docker.
- Guardado de MMD y exportaciones SVG/PNG mediante el diálogo nativo.
- Gestión de extensiones opcionales desde la aplicación.
- Instalador por usuario; instala WebView2 si falta (requiere internet en ese caso).

Descarga y ejecuta el archivo `Mermaid.BP_*_x64-setup.exe`. El instalador no tiene firma de código; Windows puede mostrar una advertencia de SmartScreen.

En Ubuntu 24.04 instala `mermaid-bp_1.0.0-beta.1_amd64.deb` con `sudo apt install ./mermaid-bp_1.0.0-beta.1_amd64.deb`. El paquete declara las dependencias GTK y WebKitGTK que necesita la aplicación. Para compilar en Windows con Docker Desktop y motor Linux, ejecuta `./scripts/build-linux-deb-docker.ps1` desde PowerShell; el `.deb` aparece en `desktop-app/src-tauri/target/linux-bundle/deb/`.

El flujo `Aplicación de escritorio Linux` crea el paquete en Ubuntu 24.04, lo instala en el runner y ejecuta la aplicación instalada bajo Xvfb. WebDriver edita el diagrama y `xdotool` completa los diálogos GTK para guardar `.mmd` y exportar SVG. Los logs y la captura de pantalla se adjuntan al job.
