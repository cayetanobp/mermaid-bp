# Revisión de componentes de terceros

Esta revisión corresponde a la compilación alfa actual. La licencia AGPL-3.0-only cubre el código original del proyecto; cada componente ajeno conserva sus términos.

## Web y recursos estáticos de escritorio

El `package-lock.json` identifica 126 paquetes JavaScript de producción, directos y transitivos. Incluyen código bajo MIT (80), ISC (33), BSD-3-Clause (6), OFL-1.1 (3), Apache-2.0 (1), Unlicense (1) y una elección MPL-2.0 o Apache-2.0 (1). `khroma` no declara licencia en los metadatos del lockfile, pero su paquete instalado incluye el texto MIT. Los tres paquetes Fontsource aportan las tipografías que aparecen en la compilación.

La compilación genera `THIRD_PARTY_NOTICES.md` con la versión, licencia declarada y textos de licencia de estos 126 paquetes. Para `fastdom` y `strictdom`, que no incluyen un archivo de licencia separado, se usa el texto MIT de sus README. El archivo acompaña el ZIP web y los recursos estáticos de escritorio. Esta lista conservadora puede incluir paquetes de producción que el optimizador no incorporó al resultado final.

El encabezado BookStack hace que el navegador descargue Mermaid 11.17.2 desde jsDelivr. Esa carga remota no está incrustada en el encabezado distribuido; Mermaid también figura entre las dependencias del editor y en los avisos generados.

## Pendiente antes de la beta

- Compilar el instalador NSIS y revisar su contenido real. En este entorno falta `cargo`, por lo que todavía no se ha obtenido el árbol de dependencias Rust ni comprobado los avisos de los componentes nativos de Tauri.
- Comprobar en ese instalador el texto AGPL, los avisos JavaScript y los avisos exigidos por las dependencias Rust.
- Verificar la procedencia de imágenes e iconos de la aplicación que no proceden de los paquetes JavaScript inventariados.

No se considera completa la revisión de licencias del instalador hasta resolver esos puntos.
