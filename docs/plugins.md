# Crear e instalar plugins

## Instalación

1. Descomprime el plugin y copia su carpeta dentro de `plugins/`.
2. Recarga la web con F5. Aparecerá en "Extensiones".

Para quitarlo, retira la carpeta y recarga. No hay que editar configuración, reiniciar el servidor ni recompilar. Puedes desactivarlo sin borrarlo desde "Extensiones".

Con `iniciar.cmd`, `npm.cmd run dev` o `npm.cmd run preview`, utiliza la carpeta `plugins/` del proyecto. Si publicas directamente la web compilada, utiliza `plugins/` dentro de la carpeta publicada, por ejemplo `dist/plugins/`.

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

## Otras funciones

La API v1, descrita en `src/plugin-api.ts`, permite leer el documento, suscribirse a sus cambios, añadir acciones y añadir pasos a la guía. `setup` puede devolver una función para limpiar recursos propios al desactivar el plugin. El editor retira automáticamente sus acciones, suscripciones y pasos.

Para un recurso propio, usa `new URL('./mi-pagina.html', import.meta.url).href`. Puedes distribuir otros módulos JavaScript, hojas de estilo e imágenes dentro de la misma carpeta. El paquete entregado al usuario debe contener JavaScript listo para el navegador; si como autor utilizas TypeScript o dependencias npm, prepara esos archivos antes de distribuirlo.

Los errores de manifiesto o activación se muestran sin detener el editor. Una versión de API incompatible no se activa. Los plugins ejecutan código con los permisos de la aplicación; la API organiza sus aportaciones, pero no es un aislamiento de seguridad.

## BookStack

Está incluido en `plugins/bookstack/`. La compilación genera su paquete completo en `dist/plugins/bookstack/`, con su página, visor, encabezado y recursos. Esa carpeta se puede copiar a otra distribución ya compilada, sin reconstruirla. Se mantienen los enlaces antiguos de BookStack por compatibilidad.

## Publicación y desarrollo del núcleo

El navegador consulta las carpetas disponibles en `/plugins/`. Los servidores locales del proyecto lo hacen automáticamente y el nginx incluido utiliza un listado JSON únicamente para esa carpeta. Si usas otro servidor estático, debe ofrecer ese mismo listado. No se requiere un registro de plugins.

`npm.cmd run build` empaqueta automáticamente las carpetas presentes. `MERMAID_BP_PLUGINS=none` permite construir una distribución inicial vacía y una lista de identificadores separados por comas permite limitar el empaquetado. Son opciones de desarrollo; no se necesitan para instalar plugins.

Los plugins incluidos que necesitan preparar recursos pueden definir `build.script` en su manifiesto fuente. El paquete distribuido elimina esos metadatos y funciona sin herramientas de desarrollo.

## Pruebas

`tests/runtime-plugins.spec.ts` verifica la instalación y retirada de carpetas con el servidor ya abierto, la persistencia al desactivar, los manifiestos inválidos y la instalación de BookStack en una distribución independiente sin recompilar. `tests/plugin-host.spec.ts` comprueba errores y limpieza durante cargas pendientes.
