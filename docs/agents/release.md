# Compilación y publicación

## Antes de integrar cambios

El flujo `Comprobaciones` se ejecuta en cada PR y en `main`. Comprueba web, seguridad, escritorio y contenido legal del instalador NSIS. Las compilaciones Rust pasan `--locked`. Una actualización de `Cargo.lock` debe incluir las features de producción `tauri/custom-protocol` y `tauri/protocol-asset` y actualizar `THIRD_PARTY_RUST_NOTICES.md`; el artefacto del flujo `Generar avisos Rust para revisión` incluye ambos archivos resueltos para `x86_64-pc-windows-msvc`. `node scripts/check-rust-third-party-notices.mjs` verifica el resultado en Linux. La comprobación corre en Ubuntu porque el inventario incluye dependencias de compilación que Cargo resuelve según el sistema anfitrión; el trabajo Windows comprueba los archivos realmente empaquetados.

## Auditoría local de Windows con Docker

En Windows, con Docker Desktop y Node instalados, ejecuta `./scripts/audit-windows-docker.ps1` desde PowerShell. El script compila el frontend, prepara una imagen con Rust, cargo-xwin, Tauri CLI y NSIS, comprueba los avisos Rust, genera el ejecutable y el instalador Windows, extrae el NSIS y compara sus cuatro archivos legales con las fuentes. El resultado queda en `desktop-app/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. La compilación cruzada no sustituye una prueba interactiva de instalación en Windows.

## Publicación beta

La ejecución manual de `Aplicación de escritorio Windows` construye y verifica el instalador; Tauri 2 produce el updater como el instalador NSIS `*-setup.exe` y su firma `*-setup.exe.sig`. El flujo solo sube esos archivos a un artefacto privado. Revisa ese artefacto antes de publicar. Cuando la versión sea beta y no queden issues abiertas, ejecuta manualmente `Publicar beta` desde `main`, con el ID de la ejecución verificada y la confirmación exacta `PUBLICAR`. El segundo flujo exige que el artefacto proceda del HEAD actual de `main`, vuelve a comprobar las issues y publica una sola release con su SHA256, la firma y el manifiesto. Un tag o una compilación normal no publican la beta.
