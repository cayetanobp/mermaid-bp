# Mermaid BP

Editor web local de archivos `.mmd`, con Mermaid **11.7.0**, vista previa y edición visual de flujos básicos. No requiere cuentas ni servicios externos durante el uso.

## Arranque local

Requiere Node.js 22.18 o posterior. Las dependencias ya están instaladas en esta copia.

```powershell
cd C:\proyectos\mermaid-bp
npm.cmd install
npm.cmd run dev
```

Abre la dirección local que muestra Vite. También puedes hacer doble clic en `iniciar.cmd`, que abre el navegador y mantiene el servidor en su ventana. Cierra esa ventana para detenerlo. La instalación inicial requiere internet; después, la aplicación sirve sus recursos localmente.

No abras `index.html` directamente mediante `file://`. La aplicación utiliza módulos y necesita un servidor HTTP local.

## Uso

- Edita el código a la izquierda y consulta el diagrama a la derecha. La vista se actualiza tras una pausa de 350 ms.
- Abre un `.mmd` con el botón o soltándolo en la ventana. El límite de apertura es de 2 MB.
- Usa los botones de nodos y conexiones, el doble clic en un nodo para editarlo y el panel de selección para eliminar. Los cambios visuales se pueden deshacer.
- Arrastra el fondo para desplazarte. Usa los botones de zoom o Ctrl y la rueda. El separador admite arrastre y las flechas del teclado.
- Guarda con el botón o Ctrl S. Guardar descarga una copia; el navegador no sobrescribe automáticamente el archivo original.
- El último documento se recupera desde el almacenamiento del navegador. El borrador no sustituye a una copia descargada. En navegación privada o si el almacenamiento está lleno puede no conservarse.
- SVG y PNG exportan el último diagrama válido. El PNG tiene fondo blanco y hasta doble resolución, con límites de 8192 píxeles por lado y 32 millones de píxeles.

## Arrastre y compatibilidad con BookStack

El editor utiliza la versión exacta de tu integración y sus valores predeterminados de renderizado. El botón de copia produce un bloque Markdown delimitado con `mermaid` para el editor Markdown de BookStack.

El arrastre expresa una preferencia de posición. Mermaid vuelve a calcular la distribución; el editor evalúa hasta ocho alternativas que modifican el orden de declaración de nodos, añaden enlaces invisibles o aumentan la longitud mínima de conexiones. No añade nodos ficticios ni cambia los extremos o etiquetas de las conexiones reales.

El evaluador minimiza la distancia al destino, con penalizaciones por movimiento de los demás nodos y crecimiento del dibujo. Compara posiciones relativas para ignorar las traslaciones del SVG. Solo acepta una mejora; si no la encuentra, conserva el documento. Un ajuste aceptado es una sola acción de deshacer.

Las restricciones añadidas se guardan en un bloque entre `%% mbp-layout:start` y `%% mbp-layout:end`. Esos marcadores son comentarios Mermaid; el contenido utiliza enlaces invisibles estándar. No se necesitan extensiones ni cambios en tu script de BookStack. Cambiar la dirección desde la interfaz elimina esos enlaces auxiliares para empezar una distribución nueva.

La edición visual admite `flowchart` y `graph`, las direcciones habituales, rectángulos, formas redondeadas, terminales, rombos, círculos y conexiones sencillas con etiquetas. Las construcciones avanzadas, los estilos personalizados, los subgráficos y los demás tipos de diagramas quedan en edición por código, conservando el texto. No se intenta una conversión parcial que pueda borrar información. Las ediciones visuales normalizan el formato y conservan el contenido de los comentarios, aunque pueden cambiar su ubicación.

`bookstack.html` reproduce localmente tu transformación de `.language-mermaid` a `.mermaid` y llama a `mermaid.run()`. Permite cargar el último borrador y comparar. La distribución se verifica con la misma versión, pero las fuentes, el tema y el ancho de tu BookStack real pueden producir diferencias. No se promete una posición absoluta ni identidad de píxeles.

## Compilación y pruebas

```powershell
npm.cmd test
npm.cmd run build
npm.cmd exec playwright install chromium
npm.cmd run test:browser
```

Las pruebas unitarias usan el ejecutor de Node. Las pruebas de navegador sirven `dist` mediante el servidor de vista previa en el puerto 4177 y comprueban archivos, recuperación, historial, edición, errores, exportaciones, arrastre y equivalencia con la integración de BookStack en tres flujos.

Si Chromium ya está instalado en otra ruta, puedes indicar el ejecutable con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Las capturas se escriben en `test-results` y no se guardan en Git.

## Servir en casa

La carpeta `dist` contiene la aplicación estática y se puede servir con cualquier servidor HTTP. No hay configuración de base de datos, credenciales ni almacenamiento en el servidor. Si cambias de origen o puerto, el navegador utiliza otro espacio de borradores.

```powershell
docker build -t mermaid-bp:local .
docker run --rm -p 8080:80 mermaid-bp:local
```

Abre `http://localhost:8080`. Para Kubernetes, la imagen escucha en el puerto 80 y basta un Deployment y un Service. No se incluyen manifiestos porque no se ha inspeccionado la configuración de tu clúster. Con HTTP remoto, el navegador puede impedir copiar al portapapeles; el editor ofrece descargar el bloque Markdown como alternativa.

## Decisiones y límites

Se elige una aplicación estática con TypeScript, Vite y CodeMirror por su sencillez operativa. Se descartan un backend con base de datos y una aplicación de escritorio porque no aportan valor al uso individual previsto.

Mermaid permanece fijado en 11.7.0 por compatibilidad con BookStack. `npm audit` sigue señalando vulnerabilidades conocidas de esa versión y de su dependencia KaTeX; no se puede obtener una auditoría limpia manteniendo esa versión exacta. Se ha actualizado `lodash-es` mediante una resolución explícita y se utiliza el nivel de seguridad predeterminado de Mermaid. Usa documentos de confianza y evita publicar esta instancia como servicio para terceros. Para eliminar los avisos restantes habrá que actualizar y verificar Mermaid tanto aquí como en BookStack.

La instalación no incluye KaTeX como hoja de estilos global para fórmulas; el objetivo de compatibilidad es el script de BookStack facilitado, que tampoco la añade. Los diagramas especialmente grandes o una sintaxis patológica pueden bloquear temporalmente el hilo del navegador. No se incluye aislamiento en un proceso separado.

El historial Git es exclusivamente local; no hay remoto configurado. El servidor Docker se entrega preparado, pero su arranque requiere Docker instalado.
