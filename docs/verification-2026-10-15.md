# Verificación de cascada, navegación y extensiones

> **Registro histórico.** Esta verificación describe el estado anterior a la extracción de BookStack del núcleo. La compilación y las pruebas del plugin se mantienen hoy en el repositorio de plugins; las referencias a BookStack que siguen corresponden a las comprobaciones realizadas entonces.

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


## Paquete para Nginx y organización del proyecto

El paquete `artifacts/releases/mermaid-bp-web.zip` contiene únicamente `site/`, los ejemplos de configuración de Nginx y la guía de instalación. Se genera también su checksum SHA-256. El servidor solo necesita Nginx; la compilación se realiza en el equipo de desarrollo o mediante el flujo manual de GitHub Actions. Ese flujo no publica releases ni despliega automáticamente.

La raíz queda en nueve archivos. Vite y Playwright están en `config/`; `tsconfig.json` se conserva en la raíz para la detección de los editores. La alternativa Docker queda en `deploy/docker/`, las utilidades en `scripts/`, la página fuente de BookStack dentro de su plugin y las próximas mejoras en `docs/roadmap.md`. Los registros y paquetes generados están en `artifacts/`, fuera de Git. `style.md` permanece en la raíz.

Se han actualizado los comandos de npm, los contextos de compilación de Docker, Compose, el lanzador de Windows y los enlaces de la documentación. El empaquetado de plugins copia primero los recursos y compila después, evitando que una página fuente sustituya al HTML compilado. El servidor de preview utiliza la salida compilada de las entradas que declara el autor; los mods listos para navegador siguen pudiéndose añadir por carpeta.

Validaciones realizadas.

- 43 pruebas unitarias, incluida la estructura y el checksum del ZIP, y 12 pruebas de seguridad aprobadas.
- `nginx -t` y ocho pruebas de navegador sobre los archivos extraídos del paquete aprobadas. Se comprueban edición, historial, exportación, aislamiento, ausencia de persistencia y comunicación con BookStack.
- Añadir y retirar un plugin en el directorio publicado funciona sin recompilar ni reiniciar Nginx.
- Arranque local y vista previa de BookStack comprobados tanto en desarrollo como en preview, con las nuevas configuraciones de Playwright.
- Pruebas de header, ajuste de subgrupos, tiradores y reapertura aprobadas tras los movimientos de archivos.
- Compose y el script de despliegue pasan sus comprobaciones de sintaxis; la imagen Docker se construye y arranca con el editor y el listado de plugins accesibles.
