# Compilación y publicación

## Antes de integrar cambios

El flujo `Comprobaciones` se ejecuta en cada PR y en `main`. Comprueba web, seguridad, escritorio y contenido legal del instalador NSIS. Una actualización de `Cargo.lock` debe actualizar también `THIRD_PARTY_RUST_NOTICES.md`; `node scripts/check-rust-third-party-notices.mjs` detecta diferencias en Linux. La comprobación corre en Ubuntu porque el inventario incluye dependencias de compilación que Cargo resuelve según el sistema anfitrión; el trabajo Windows comprueba los archivos realmente empaquetados.

## Auditoría local de Windows con Docker

En Windows, con Docker Desktop y Node instalados, ejecuta `./scripts/audit-windows-docker.ps1` desde PowerShell. El script compila el frontend, prepara una imagen con Rust, cargo-xwin, Tauri CLI y NSIS, comprueba los avisos Rust, genera el ejecutable y el instalador Windows, extrae el NSIS y compara sus cuatro archivos legales con las fuentes. El resultado queda en `desktop-app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. La compilación cruzada no sustituye una prueba interactiva de instalación en Windows.

## Publicación beta

La ejecución manual de `Aplicación de escritorio Windows` construye y verifica el instalador; solo sube un artefacto privado del flujo. Revisa ese artefacto antes de publicar. Cuando la versión sea beta y no queden issues abiertas, ejecuta manualmente `Publicar beta` desde `main`, con el ID de la ejecución verificada y la confirmación exacta `PUBLICAR`. El segundo flujo exige que el artefacto proceda del HEAD actual de `main`, vuelve a comprobar las issues y publica una sola release con su SHA256. Un tag o una compilación normal no publican la beta.
