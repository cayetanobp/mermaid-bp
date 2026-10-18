# Mermaid BP

Editor web local de archivos `.mmd`, con Mermaid **11.17.2**, vista previa y edición visual de flujos básicos. No requiere cuentas ni servicios externos durante el uso.

## Licencia

El código original de Mermaid BP está bajo [GNU AGPL-3.0-only](LICENSE). Copyright (C) 2026 cayetanobp. Consulta [los avisos de alcance y distribución](NOTICE.md); las dependencias y recursos de terceros conservan sus propias licencias. Si distribuyes una versión modificada o la ofreces por red, revisa las obligaciones de entrega del código fuente correspondiente, incluida la sección 13 de AGPL-3.0 para versiones modificadas con interacción remota.

## Desplegar con Nginx sin npm ni Docker

Para un servidor con Nginx, usa el paquete web compilado. Solo hay que subir los archivos estáticos e instalar el snippet del sitio, incluido el descubrimiento de plugins. Consulta [la guía de Nginx](docs/nginx.md). El paquete se genera con `npm run package:web` en el equipo de desarrollo o con el flujo manual "Paquete web para Nginx" en GitHub Actions; el servidor no compila nada.

## Arranque local

Para desarrollar o compilar necesitas Node.js 22.18 o posterior. Los usuarios de la web desplegada no necesitan instalarlo.

```powershell
npm.cmd ci
npm.cmd run dev
```

Abre la dirección local que muestra Vite. También puedes hacer doble clic en `scripts/iniciar.cmd`, que abre el navegador y mantiene el servidor en su ventana. Cierra esa ventana para detenerlo. La instalación inicial requiere internet; después, la aplicación sirve sus recursos localmente.

No abras `index.html` directamente mediante `file://`. La aplicación utiliza módulos y necesita un servidor HTTP local.

## Organización del repositorio

- `src/`, código y estilos de la aplicación.
- `plugins/`, carpeta opcional para extensiones instalables.
- `config/`, configuración de Vite y Playwright. Los comandos de npm ya usan estas rutas.
- `deploy/nginx/`, configuración para servir el ZIP estático; `deploy/docker/`, alternativa con contenedor.
- `scripts/`, compilación, empaquetado y utilidades de desarrollo y despliegue.
- `tests/`, pruebas y archivos de ejemplo para verificarlas.
- `docs/`, guías y próximas mejoras; `style.md` conserva la dirección visual en la raíz.
- `artifacts/`, paquetes y registros locales, excluidos de Git. `dist/` contiene la compilación y también está excluida.

`package.json`, su lockfile, `index.html` y `tsconfig.json` permanecen en la raíz para que npm, el editor y las herramientas detecten el proyecto directamente.

## Uso

- Usa el botón pequeño de la esquina superior derecha del diagrama para ampliar el lienzo dentro de la aplicación, sin activar la pantalla completa del navegador. Los menús siguen disponibles y las acciones de "Diagrama" aparecen directamente sobre el lienzo para editar nodos y conexiones. Sal con Esc o "Salir de pantalla completa"; al volver se restaura el encuadre anterior.
- Una sola barra agrupa las acciones en "Archivo", "Edición", "Ver", "Diagrama", "Configuración" y "Ayuda". Los menús admiten ratón, flechas, Inicio/Fin y Esc. Ctrl S guarda desde cualquier vista.
- Edita el código a la izquierda y consulta el diagrama a la derecha. La vista se actualiza tras una pausa de 350 ms.
- Abre un `.mmd` con "Archivo > Abrir .mmd" o soltándolo en la ventana. El límite de apertura es de 200 kB.
- Usa "Conectar nodos" para elegir origen y destino en el lienzo y completar la relación. Escape cancela la elección. Usa los botones de nodos y conexiones, el doble clic en un nodo para editarlo y el panel de selección para eliminar. Los cambios visuales se pueden deshacer.
- Arrastra el fondo para seleccionar varios elementos. Mayús añade o quita elementos; arrastrar un nodo seleccionado mueve el conjunto. Para desplazar el lienzo, mantén espacio mientras arrastras o usa el botón central. La rueda cambia el zoom alrededor del puntero. El separador admite arrastre y las flechas del teclado.
- Guarda con "Archivo > Guardar .mmd" o Ctrl S. Guardar descarga una copia; el navegador no sobrescribe automáticamente el archivo original.
- El documento y su historial solo existen durante la sesión. Recargar o cerrar descarta el trabajo; "Guardar .mmd" descarga la copia que puedes volver a abrir.
- SVG y PNG exportan el último diagrama válido. El PNG tiene fondo blanco y hasta doble resolución, con límites de 8192 píxeles por lado y 32 millones de píxeles.

## Distribución de los menús

| Menú | Acciones |
| --- | --- |
| Archivo | Nuevo, abrir, guardar, copiar Mermaid y exportar SVG o PNG. |
| Edición | Deshacer y rehacer. |
| Ver | Código, cascada, encajar y acciones de los plugins. |
| Diagrama | Crear nodos y conexiones, conectar nodos, gestionar subgrupos, recolocar y cambiar la dirección. |
| Configuración | Abrir preferencias o gestionar extensiones en el panel de ajustes. |
| Ayuda | Abrir la guía de uso. |

Las pestañas del documento y el inspector siguen junto al editor. Los menús también están disponibles en pantalla completa, con un acceso directo para salir. Abrir y cerrar un menú no modifica el archivo, el zoom ni las posiciones.

## Configuración

Abre "Configuración > Preferencias". El panel contiene un lateral con cuatro secciones.

- General, para elegir la vista al abrir, mostrar u ocultar la ayuda y reducir animaciones.
- Editor, para ajustar tamaño del texto, líneas largas, números de línea y resaltado de la línea actual.
- Diagrama, para mostrar la cuadrícula y elegir la sensibilidad del zoom.
- Extensiones, para activar o desactivar plugins. "Configuración > Extensiones" abre esta sección directamente.

Los cambios se aplican al momento y se guardan en este navegador. No se escriben en los archivos `.mmd` ni modifican sus estilos o posiciones. "Restablecer sección" recupera sus valores predeterminados y conserva las otras secciones, los documentos y las extensiones. Si el navegador no permite guardar preferencias, los ajustes funcionan durante la sesión y el panel lo indica.

## Arrastre y compatibilidad de posiciones

El botón de copia produce un bloque Markdown delimitado con `mermaid`. Las posiciones manuales forman parte del archivo `.mmd` y se aplican cuando otra herramienta admite el contrato de comentarios de Mermaid BP.

El arrastre fija posiciones libres. El nodo sigue al puntero mediante requestAnimationFrame y solo se actualizan sus conexiones incidentes. No se invoca Mermaid durante el movimiento ni al soltar. Se conserva el zoom; Escape cancela y deshacer/rehacer recuperan la colocación.

Al mover un nodo se añade la etiqueta superior `%% mermaid-bp:manual-layout`. Solo Mermaid BP, y solo en los diagramas con esa etiqueta, aplica posiciones manuales. Las coordenadas se guardan en comentarios `%% graph:positions`, `%% graph:connections` y `%% graph:groups` dentro del archivo `.mmd`. Son comentarios Mermaid normales: un renderizador Mermaid genérico puede ignorarlos y mostrar el diagrama con su distribución automática. Los agentes deben conservar los identificadores de los nodos y estos comentarios al editar el archivo. "Recolocar todo" recupera la distribución automática y permite deshacer.

Se conservan las formas y los estilos generados por Mermaid. Las conexiones se redondean, pero no esquivan automáticamente los obstáculos y los nodos pueden solaparse al colocarlos manualmente. Al seleccionar una relación puedes arrastrar los puntos de origen y destino alrededor de sus nodos o restaurarlos. Los dos círculos azules son manejadores Bézier independientes. "Restablecer conexión" restaura los anclajes y la curva automática. Los ángulos y los vectores se guardan en `%% graph:connections`, con claves por conexión y número entre conexiones paralelas.

Los bloques antiguos entre `%% mbp-layout:start` y `%% mbp-layout:end` siguen siendo aceptados. El arrastre ya no añade enlaces invisibles ni cambia el orden de las declaraciones.

La edición visual admite `flowchart` y `graph`, las direcciones habituales, rectángulos, formas redondeadas, terminales, rombos, círculos, conexiones encadenadas y etiquetas. Conserva directivas `init` de una línea en JSON, subgráficos identificados, `classDef`, `class` y `style`. Las acciones visuales modifican las declaraciones afectadas y preservan las demás líneas, los comentarios y los saltos de línea del archivo. Una cadena afectada por una edición de conexión se puede expandir localmente. Arrastrar no cambia la pertenencia a subgráficos.

Los demás tipos de diagramas y las construcciones que no se puedan modificar con seguridad, como `linkStyle` por índice, enlaces a subgráficos o frontmatter, siguen disponibles por código. El editor no realiza una conversión parcial que pueda borrar información.

Los plugins opcionales pueden distribuir herramientas de vista previa propias. Se instalan como carpetas independientes y no forman parte del núcleo.

## Compilación y pruebas

```powershell
npm.cmd test
npm.cmd run build
npm.cmd exec playwright install chromium
npm.cmd run test:browser
```

Las pruebas unitarias usan el ejecutor de Node. Las pruebas de navegador sirven `dist` mediante el servidor de vista previa en el puerto 4177 y comprueban archivos, guardado y reapertura, historial, edición, errores, exportaciones y arrastre.

Si Chromium ya está instalado en otra ruta, puedes indicar el ejecutable con `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Las capturas se escriben en `test-results` y no se guardan en Git.

## Servir en casa

La carpeta `dist` contiene la aplicación estática y se puede servir con cualquier servidor HTTP. No hay configuración de base de datos, credenciales ni almacenamiento en el servidor. Los documentos no se guardan en el navegador.

```powershell
docker build -f deploy/docker/Dockerfile -t mermaid-bp:local .
docker run --rm -p 8080:8080 mermaid-bp:local
```

Abre `http://localhost:8080`. Para Kubernetes, la imagen escucha en el puerto 8080 y basta un Deployment y un Service. No se incluyen manifiestos porque no se ha inspeccionado la configuración de tu clúster. Con HTTP remoto, el navegador puede impedir copiar al portapapeles; el editor ofrece descargar el bloque Markdown como alternativa.

## Decisiones y límites

Se elige una aplicación estática con TypeScript, Vite y CodeMirror por su sencillez operativa. Se descartan un backend con base de datos y una aplicación de escritorio porque no aportan valor al uso individual previsto.

El perfil público utiliza Mermaid 11.17.2, DOMPurify 3.4.17 y KaTeX 0.18.2 por seguridad. Las diferencias respecto al renderizado anterior y las comprobaciones se describen en [docs/security.md](docs/security.md).

La instalación no incluye KaTeX como hoja de estilos global para fórmulas. Los diagramas especialmente grandes o una sintaxis patológica pueden bloquear temporalmente el hilo del navegador. No se incluye aislamiento en un proceso separado.

El repositorio está publicado en GitHub. Docker es una alternativa de despliegue; el paquete estático para Nginx no lo necesita.

## Verificación de esta entrega

Verificado el 15 de octubre de 2026 en Windows con Chromium y Node.js 24.15, y compilado también con Node.js 22 en Docker.

- 12 pruebas unitarias aprobadas.
- 12 pruebas de navegador aprobadas sobre la compilación de producción.
- Imagen `mermaid-bp:local` construida y arrancada; editor accesible con el ejemplo renderizado en el navegador.
- Dos avisos de auditoría pendientes, uno bajo y otro moderado, asociados a la cadena Mermaid y KaTeX fijada por compatibilidad.

El contenedor de comprobación se ha detenido. La imagen queda disponible localmente.


## Fondos y gestión de subgrupos

Pulsa el fondo o el título de un subgraph para seleccionarlo. Arrastra el fondo para desplazarlo o sus cuatro esquinas para cambiar el tamaño. Los nodos y conexiones permanecen en su sitio. Al mover nodos, los fondos conservan sus límites. "Ajustar al contenido" encaja el fondo alrededor de sus nodos.

Los límites se guardan con el comentario `%% graph:groups`.

"Subgrupos" permite crear, renombrar, anidar y eliminar grupos. La ficha de un nodo permite cambiar su pertenencia. Eliminar un grupo conserva sus nodos y conexiones. Los cambios se pueden deshacer.

## Cascada, información y guía

"Código" y "Cascada" muestran el mismo documento. La cascada permite buscar nodos y subgrupos, consultar miembros y navegar las relaciones desde la ficha. Seleccionar o navegar no modifica el Mermaid ni mueve la cámara.

El separador sobre "Información" cambia la altura del panel y deja el resto para código o cascada. Admite arrastre, flechas arriba/abajo e Inicio/Fin; conserva su proporción en el navegador. Seleccionar un nodo en cascada lo resalta sin mover la cámara. El resaltado se mantiene hasta cambiar o quitar la selección. "Ir a" solo centra el nodo y mantiene el zoom y el resaltado existente. Con movimiento reducido, la señal permanece estática.

"Guía de uso" inicia un recorrido por código, cascada, información, diagrama y extensiones, y recupera la pestaña anterior al terminar o pulsar Esc.

## Extensiones

El núcleo no incluye plugins. Se mantienen en el [repositorio separado de plugins](https://github.com/cayetanobp/mermaid-bp-plugins). Revisa las instrucciones del plugin y consigue su carpeta antes de instalarlo. Los plugins ejecutan código con los permisos de la aplicación; instala solo los que confíes.

En la web local, copia la carpeta que contiene `plugin.json` dentro de `plugins/` en la raíz del proyecto y recarga con F5. En una web publicada, copia la carpeta dentro de `plugins/` de la carpeta publicada (por ejemplo, `dist/plugins/`) y recarga. El servidor debe ofrecer el listado de esa carpeta para que el núcleo detecte las extensiones; los servidores locales y el Nginx incluido ya lo hacen.

En la aplicación de escritorio, abre "Configuración > Extensiones", elige "Seleccionar carpeta", selecciona la carpeta extraída que contiene `plugin.json` y revisa el nombre y la versión. Confirma la advertencia de confianza y pulsa "Instalar plugin". La aplicación copia el plugin a su almacenamiento privado; no hace falta colocar archivos en una carpeta interna del sistema. Para retirarlo, pulsa "Retirar" junto al plugin.

Desde "Extensiones" puedes activar o desactivar plugins instalados; la preferencia es local. Editar, guardar y exportar funcionan sin plugins. La [guía para desarrollar plugins](docs/plugins.md) describe el contrato y el ejemplo de API.

## Núcleo y contribuciones

Propón cambios al núcleo cuando afecten a la edición, el renderizado, los formatos de archivo, la accesibilidad, la seguridad o a funciones que la mayoría necesita. Propón un plugin cuando la función sea opcional, integre un servicio externo o atienda un flujo de trabajo específico. El editor funciona sin plugins.

Consulta [CONTRIBUTING.md](CONTRIBUTING.md) para preparar una contribución, ejecutar las comprobaciones y abrir una PR.

La dirección visual está en [style.md](style.md). Las siguientes mejoras se mantienen en [docs/roadmap.md](docs/roadmap.md).

## Verificación actual de cascada y extensiones

La revisión actual supera 40 pruebas unitarias y 59 comprobaciones de navegador entre la distribución normal y la compilación sin extensiones. El detalle, los escenarios y el alcance están en [docs/verification-2026-10-15.md](docs/verification-2026-10-15.md).


## Despliegue desde Git

El mismo repositorio sirve para desarrollo local y producción. Consulta [docs/production.md](docs/production.md). En el servidor, clona el repositorio, copia `deploy/docker/.env.example` a `.env`, configura el origen de tu web y ejecuta `sh scripts/deploy.sh`. Para actualizar, ejecuta `git pull --ff-only` y `sh scripts/deploy.sh`. Las protecciones y comprobaciones del perfil público están en [docs/security.md](docs/security.md).

La aplicación no persiste documentos en ningún modo. Tanto desarrollo como producción descartan el trabajo al recargar.

## Aplicación de escritorio

La versión de Windows usa Tauri 2. Consulta [desktop-app/README.md](desktop-app/README.md) para compilarla y publicar el instalador.
