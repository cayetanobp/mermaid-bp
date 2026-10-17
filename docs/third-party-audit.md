# Revisión de componentes de terceros

Esta revisión corresponde a la compilación alfa actual. La licencia AGPL-3.0-only cubre el código original del proyecto; cada componente ajeno conserva sus términos.

## Web y recursos estáticos de escritorio

El `package-lock.json` identifica 126 paquetes JavaScript de producción, directos y transitivos. Incluyen código bajo MIT (80), ISC (33), BSD-3-Clause (6), OFL-1.1 (3), Apache-2.0 (1), Unlicense (1) y una elección MPL-2.0 o Apache-2.0 (1). `khroma` no declara licencia en los metadatos del lockfile, pero su paquete instalado incluye el texto MIT. Los tres paquetes Fontsource aportan las tipografías que aparecen en la compilación.

La compilación genera `THIRD_PARTY_NOTICES.md` con la versión, licencia declarada y textos de licencia de estos 126 paquetes. Para `fastdom` y `strictdom`, que no incluyen un archivo de licencia separado, se usa el texto MIT de sus README. El archivo acompaña el ZIP web y los recursos estáticos de escritorio. Esta lista conservadora puede incluir paquetes de producción que el optimizador no incorporó al resultado final.

## Instalador Windows

Cargo resolvió 248 crates de terceros para `x86_64-pc-windows-msvc` con el lockfile del proyecto; todos declaran licencia. `THIRD_PARTY_RUST_NOTICES.md` recoge nombre, versión, origen, licencia declarada y textos originales. Cinco crates publicados omiten un archivo de licencia separado: `alloc-stdlib`, `selectors`, `webview2-com`, `webview2-com-macros` y `webview2-com-sys`. Para ellos se añadió el texto de licencia de sus repositorios originales o, en el caso de MPL-2.0, de Mozilla. El inventario es conservador: también puede contener crates de compilación que no forman parte del ejecutable final.

El ejecutable Windows se compiló en Docker con `cargo-xwin` y el instalador NSIS se generó con Tauri CLI. Al extraer el instalador se comprobó que contiene `LICENSE`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md` y `THIRD_PARTY_RUST_NOTICES.md`, y que los cuatro coinciden byte por byte con los archivos fuente correspondientes. La compilación cruzada es experimental según Tauri; esta comprobación cubre el contenido del instalador, no una instalación interactiva en Windows. El instalador de auditoría no está firmado.

La persona titular del proyecto indicó que el código y los recursos propios, incluidos los iconos, son suyos y que todavía no hay contribuciones externas. Las bibliotecas, tipografías y crates identificados arriba se documentan por separado.
