# Mermaid BP para escritorio

Aplicación Tauri 2 para Windows x64 y Debian amd64. Incluye la web compilada y sus extensiones, sin levantar un servidor local.

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

El guardado abre un diálogo nativo y permite elegir dónde escribir cada archivo. El documento conserva el comportamiento del editor: hay que guardarlo antes de cerrar. Las extensiones se incluyen al compilar; cambiar sus archivos requiere volver a generar el instalador.

En Windows, abre `Configuración > General > Actualizaciones > Buscar actualizaciones` para consultar el canal beta. La aplicación muestra la versión y las notas antes de descargarla; verifica la firma del paquete NSIS, lo instala y se reinicia. Los documentos guardados, las preferencias y los datos locales de extensiones se mantienen fuera del instalador.

En Ubuntu, el mismo flujo está disponible para instalaciones del paquete Debian: muestra versión y notas, verifica la firma del `.deb`, solicita autorización del sistema para instalarlo y reinicia la aplicación. Los documentos, las preferencias y los plugins locales se conservan.

## Publicación

El workflow `Aplicación de escritorio Linux` construye el paquete Debian firmado y comprueba una actualización instalada en Ubuntu 24.04. `Publicar beta` exige ejecuciones satisfactorias de Windows y Linux sobre el HEAD actual de `main`; adjunta ambos paquetes, sus firmas y SHA256 a la release versionada y publica los dos destinos en `latest.json`.

Los workflows requieren el secreto de GitHub Actions `TAURI_SIGNING_PRIVATE_KEY`, que contiene la clave privada generada por `tauri signer generate`; su contraseña está vacía. Conserva una copia protegida de esa clave: perderla impediría firmar futuras actualizaciones para las instalaciones existentes. Tauri 2 firma el instalador NSIS `.exe` y el paquete Debian `.deb`. `Publicar beta` adjunta ambos paquetes, sus firmas, sus checksums SHA256 y `latest.json` a la release prerelease `beta`, el canal consultado por la aplicación.

El instalador Windows no tiene certificado de firma de código; su firma Minisign protege las actualizaciones de la aplicación, pero Windows puede mostrar SmartScreen. La primera instalación puede necesitar internet para instalar WebView2 si el equipo no dispone de él. El editor y su renderizado usan recursos locales.
