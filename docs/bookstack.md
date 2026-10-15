# Visor Mermaid con posiciones en BookStack

La página local `bookstack.html` y el módulo `bookstack-viewer.js` utilizan la misma función de renderizado que el editor, con Mermaid 11.17.2 y comentarios `%% graph:positions`.

## Instalación en BookStack

1. Abre "BS preview" y pulsa "Descargar código del encabezado". También está en `dist/bookstack-header.html` después de ejecutar `npm.cmd run build`.
2. En ajustes de BookStack, personalización, contenido HTML del encabezado, sustituye el script Mermaid anterior por TODO el contenido de ese archivo. Conserva las otras personalizaciones que tengas.
3. Pega el bloque Mermaid que copia el editor, incluidos sus comentarios de posiciones, en una página y guárdala.

El encabezado incluye el módulo de posiciones y carga Mermaid 11.17.2 desde jsDelivr, con la versión fijada. No necesitas publicar archivos del editor ni configurar un servidor adicional. Se genera automáticamente durante la compilación.

Como alternativa sin CDN, puedes publicar toda la carpeta `dist` en tu servidor y usar este encabezado, adaptando la ruta.

```html
<script type="module">
  import { installBookStackViewer } from '/mermaid-bp/bookstack-viewer.js';
  installBookStackViewer();
</script>
```

Esta alternativa importa módulos relativos de `assets`, por lo que debes copiar la carpeta completa. Es preferible servirlos desde el mismo origen; otro origen necesita permitir CORS. Un BookStack HTTPS necesita recursos HTTPS.

El visor reserva todos los bloques Mermaid de forma síncrona antes de esperar al renderizado. Esto evita que el resaltador CodeMirror de BookStack los sustituya mientras se calcula el SVG. Se ha comprobado sobre la respuesta HTML pública real, manteniendo su CSP y sus scripts, mediante una sustitución local de la respuesta sin modificar el servidor.

El visor sustituye los bloques `.language-mermaid` por diagramas, conserva el texto si una sintaxis falla y continúa con los otros bloques. No carga el editor ni CodeMirror y no necesita un backend. No mantengas activo el script anterior con `mermaid.run()`, porque ambos intentarían sustituir los mismos bloques.

Solo se activa la extensión cuando la primera línea no vacía es `%% mermaid-bp:manual-layout`. El editor añade esta etiqueta al mover un nodo. Los archivos anteriores necesitan añadir esa línea arriba o volver a mover un nodo antes de copiar.

Sin esa etiqueta se usa directamente `mermaid.run()` en el lugar final, sin imponer anchura, altura, escalado ni posiciones. Esto incluye líneas de tiempo, Gantt, secuencias y también flujos sin etiqueta, aunque contengan comentarios antiguos de coordenadas. Una etiqueta sobre un tipo no editable también recurre a Mermaid estándar.

 Los grupos, colores, formas y etiquetas usan el renderizado de Mermaid; la extensión adapta las coordenadas y las conexiones. Las fuentes y el CSS del BookStack real pueden afectar al aspecto. Las exportaciones de BookStack necesitan una comprobación adicional según su motor PDF/HTML.

## Comprobación local

Abre `bookstack.html` desde "BS preview". La página carga el borrador al abrirse. Si la tenías abierta antes de mover nodos, pulsa "Cargar último borrador". Puedes modificar el texto de comprobación y pulsar "Renderizar como BookStack".

Esta entrega prepara los archivos y la simulación local. No cambia la configuración ni publica archivos en una instancia real de BookStack.

Los anclajes de origen y destino se guardan en comentarios `%% graph:connections` dentro del mismo Mermaid etiquetado. Tras actualizar las curvas o los anclajes en el editor, sustituye el encabezado de BookStack por la nueva compilación para que ambos usen el mismo módulo.

Los campos `bendFrom` y `bendTo` de `%% graph:connections` guardan los dos vectores Bézier relativos a los extremos. Se desplazan con sus nodos y se interpretan con el mismo cálculo en el editor y en BookStack. Las conexiones siguen uniendo el mismo par de nodos al ajustar extremos o curvatura.

El perfil público fuerza etiquetas SVG de texto y valida y sanitiza los diagramas. La vista previa usa un canal temporal en memoria; no guarda el documento en producción. El encabezado actualizado carga Mermaid desde `https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.esm.min.mjs`. Revisa la CSP de tu BookStack o utiliza la alternativa alojada por ti.
