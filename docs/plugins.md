# Crear e instalar plugins

## Instalación

1. Descomprime el plugin y copia su carpeta dentro de `plugins/`.
2. Recarga la web con F5. Aparecerá en "Extensiones".

Para quitarlo, retira la carpeta y recarga. No hay que editar configuración, reiniciar el servidor ni recompilar. Puedes desactivarlo sin borrarlo desde "Extensiones".

Con `scripts/iniciar.cmd`, `npm.cmd run dev` o `npm.cmd run preview`, utiliza la carpeta `plugins/` del proyecto. Si publicas directamente la web compilada, utiliza `plugins/` dentro de la carpeta publicada, por ejemplo `dist/plugins/`.

## Crear uno sencillo

Crea esta estructura. El nombre de la carpeta debe coincidir con el identificador del manifiesto.

```text
plugins/
  contador/
    plugin.json
    index.js
```

Contenido de `plugin.json`.

```json
{
  "id": "contador",
  "name": "Contador de líneas",
  "description": "Cuenta las líneas del documento actual.",
  "version": "1.0.0",
  "apiVersion": 1
}
```

Contenido de `index.js`.

```javascript
export default {
  setup(editor) {
    editor.ui.addAction({
      id: 'contar',
      label: 'Contar líneas',
      run() {
        const total = editor.document.read().source.split('\n').length;
        editor.ui.notify(`${total} líneas`);
      }
    });
  }
};
```

Guarda los archivos y recarga. El botón "Contar líneas" estará disponible. Este ejemplo no necesita herramientas de compilación ni dependencias.

## Contrato público v1

El manifiesto `plugin.json` contiene los campos `id`, `name`, `description`, `version` y `apiVersion`. El identificador debe coincidir con el nombre de la carpeta y usar letras minúsculas, números y guiones. `name`, `description` y `version` deben ser textos no vacíos; `apiVersion` debe ser un entero. `enabledByDefault` es opcional y, si se omite, el plugin queda activado por defecto. La versión 1 del editor activa plugins que declaran `apiVersion: 1`; las demás versiones se muestran como incompatibles y no se ejecutan. `entry` es opcional y señala el módulo de entrada relativo a la carpeta; por defecto es `index.js`. Se admiten archivos `.js` y `.mjs` que permanecen dentro de la carpeta del plugin.

El módulo de entrada exporta por defecto un objeto con `setup(context)`. `setup` puede devolver una función de limpieza y puede ser asíncrona. La versión actual del contexto expone:

- `context.apiVersion`, la versión del contrato disponible.
- `context.document.read()`, que devuelve una instantánea inmutable con el código fuente y el nombre del documento.
- `context.document.subscribe(listener)`, que llama al listener cuando cambia el documento y devuelve una función para retirar esa suscripción.
- `context.ui.addAction(action)`, que registra un botón o enlace y devuelve una función para retirarlo. La acción requiere `id` y `label`; `title` es opcional. Define `run` para un botón o `href` con una URL HTTP(S) para abrir un enlace.
- `context.ui.addGuideStep(step)`, que incorpora un paso a la guía y devuelve una función para retirarlo. El paso declara `id`, `title`, `description` y `target`; `pane` es opcional.
- `context.ui.notify(message)`, que muestra un aviso en el editor.

El ejemplo completo y autónomo de la API v1 está en `examples/plugin-contract/`. Comprueba el documento, registra una acción, una suscripción y un paso de guía, y sirve como fixture para cargar el plugin desde una distribución compilada.

Al desactivar un plugin, el editor retira sus acciones, suscripciones y pasos de guía, además de ejecutar las funciones de limpieza. Si falla una limpieza, el editor continúa con las demás. Si el manifiesto, la entrada o la activación fallan, el editor identifica el plugin en Extensiones y permanece disponible junto con los demás plugins. Las extensiones ejecutan código con los permisos de la aplicación: esta API organiza sus aportaciones, pero no es un aislamiento de seguridad.

Para un recurso propio, usa `new URL('./mi-pagina.html', import.meta.url).href`. Puedes distribuir otros módulos JavaScript, hojas de estilo e imágenes dentro de la misma carpeta. El paquete entregado al usuario debe contener JavaScript listo para el navegador; si como autor utilizas TypeScript o dependencias npm, prepara esos archivos antes de distribuirlo.


## BookStack

Está incluido en `plugins/bookstack/`. La compilación genera su paquete completo en `dist/plugins/bookstack/`, con su página, visor, encabezado y recursos. Esa carpeta se puede copiar a otra distribución ya compilada, sin reconstruirla. Se mantienen los enlaces antiguos de BookStack por compatibilidad.

## Publicación y desarrollo del núcleo

El navegador consulta las carpetas disponibles en `/plugins/`. Los servidores locales del proyecto lo hacen automáticamente y el nginx incluido utiliza un listado JSON únicamente para esa carpeta. Si usas otro servidor estático, debe ofrecer ese mismo listado. No se requiere un registro de plugins.

`npm.cmd run build` empaqueta automáticamente las carpetas presentes. `MERMAID_BP_PLUGINS=none` permite construir una distribución inicial vacía y una lista de identificadores separados por comas permite limitar el empaquetado. Son opciones de desarrollo; no se necesitan para instalar plugins.

Los plugins incluidos que necesitan preparar recursos pueden definir `build.script` en su manifiesto fuente. El paquete distribuido elimina esos metadatos y funciona sin herramientas de desarrollo.

## Pruebas

`tests/runtime-plugins.spec.ts` verifica la instalación y retirada de carpetas con el servidor ya abierto, la persistencia al desactivar, los manifiestos inválidos, el plugin de ejemplo del contrato público en una distribución independiente y la instalación de BookStack sin recompilar. `tests/plugin-host.spec.ts` comprueba errores y limpieza durante cargas pendientes.
