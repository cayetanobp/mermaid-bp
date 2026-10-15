# Verificación de cascada, navegación y extensiones

Comprobación del 15 de octubre de 2026 en Windows, con Node.js 24.15 y Chromium. Se probaron las compilaciones de producción, además de comprobar el arranque del servidor local.

- `npm.cmd test`, 40 pruebas unitarias aprobadas.
- `npm.cmd run build`, TypeScript y compilación aprobados.
- Batería de navegador con BookStack incluido, 58 pruebas aprobadas. La prueba exclusiva del núcleo se omite en esta modalidad.
- Compilación independiente con `MERMAID_BP_PLUGINS=none`, aprobada; sin página, visor ni encabezado BookStack en la salida.
- Prueba de navegador de esa compilación sin extensiones, una prueba aprobada.

## Comportamientos comprobados

- Cascada, búsqueda, selección de nodos y grupos, relaciones navegables y edición con deshacer.
- Archivo real de 27 nodos, estilos y subgrupos; uso en escritorio y ventana estrecha.
- Redimensionado del inspector mediante arrastre y teclado, sin modificar documento ni cámara.
- Centrado del nodo con el zoom actual y señal de localización; variante estática al solicitar movimiento reducido.
- Exportación SVG y PNG, guardado, recuperación y conservación de posiciones manuales.
- Guía con y sin BookStack, navegación entre pasos y recuperación de la pestaña anterior al cerrar.
- Desactivación, persistencia y reactivación de BookStack; la vista previa desactivada no renderiza.
- Aislamiento de errores de activación y limpieza de contribuciones, incluidas cargas pendientes canceladas.
- Equivalencia geométrica del editor y BookStack con posiciones, curvas y grupos, y renderizado estándar para diagramas sin etiqueta manual.
- Selección alineada con los fondos de subgrupos desde el primer clic.
- Pantalla completa, plegado de herramientas y conservación del encuadre.

Se revisaron capturas de la interfaz institucional y de la cascada con el archivo real. Las pruebas de BookStack utilizan la simulación local y el encabezado generado; no se ha modificado ninguna instancia externa.

Para repetir las pruebas, consulta `README.md` y `docs/plugins.md`. Las capturas y trazas se guardan en `test-results`, excluido de Git.


## Instalación de plugins por carpeta

La revisión posterior sustituye el registro de compilación por descubrimiento en tiempo de ejecución. Compilación y comprobación de TypeScript aprobadas, junto con 12 pruebas de navegador de plugins, guía y BookStack.

Se ha copiado un plugin nuevo a `plugins/` con el servidor de producción ya iniciado, recargado la web y ejecutado su acción sin recompilar ni reiniciar. También se verificaron desactivación persistente, reactivación, retirada de carpeta y un manifiesto inválido.

Una prueba adicional sirve una copia independiente del núcleo estático, sin BookStack, y añade después el paquete `dist/plugins/bookstack/`. La acción, la página de comprobación y la descarga del encabezado funcionan sin reconstruir el núcleo. Retirar la carpeta vuelve a dejarlo sin plugins.


## Revisión del diagrama y eliminación de borradores

- El encabezado de BookStack reserva únicamente flujos cuya primera línea no vacía sea `%% mermaid-bp:manual-layout`. Los demás bloques conservan su DOM y la configuración del visor habitual. Se han probado timelines, Gantt, secuencias y flujos junto a bloques etiquetados, también con CSP `strict-dynamic`.
- Curvas, anclajes y tiradores comparten la misma referencia durante la vida del SVG. Las conversiones de coordenadas usan matrices de pantalla, incluidas las de subgrupos. Los arrastres se prueban repetidamente con el archivo real, zoom y ampliación del lienzo.
- "Ajustar al contenido" usa los márgenes y las medidas originales de Mermaid. Se prueban títulos largos, subgrupos anidados, redimensionado, deshacer, rehacer y guardado/reapertura.
- Los documentos y su historial permanecen únicamente en memoria en desarrollo y producción. El arranque elimina el borrador antiguo, sin leerlo. Se mantienen las preferencias de interfaz. Guardar descarga el `.mmd`; recargar descarta el trabajo.
- BS preview recibe el documento por un canal temporal, sin almacenamiento local. Las respuestas de renders anteriores no sobrescriben su estado actual.

Comprobaciones realizadas durante la revisión.

- Compilación y comprobación de TypeScript correctas; encabezado de 59 932 bytes, dentro del límite de 60 000 comprobado.
- 42 pruebas unitarias y 12 pruebas de seguridad aprobadas.
- Tanda general de 31 pruebas de navegador aprobada. Tras el último ajuste de títulos largos, otras 19 pruebas de regresión aprobadas sobre la compilación final.
- Arranque en modo de desarrollo, edición, deshacer y descarte del documento al recargar comprobados con `npm run test:local`.

Las pruebas que dependían del borrador ahora descargan el archivo, recargan y vuelven a abrir esa descarga. La comparación con BookStack usa el botón real del plugin y su canal temporal. Los selectores y las comparaciones de SVG admiten los prefijos de identificadores de la versión instalada de Mermaid.
