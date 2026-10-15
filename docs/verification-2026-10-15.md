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
