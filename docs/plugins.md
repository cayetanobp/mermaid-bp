# Extensiones del editor

El núcleo conserva edición, archivos, cámara, cascada y exportación. Una extensión añade acciones y pasos de guía usando la API v1 de `src/plugin-api.ts`. No necesita modificar `main.ts`. BookStack, en `plugins/bookstack`, es la primera implementación.

## Registrar una extensión

1. Crea `plugins/mi-extension/plugin.json` e `index.ts`.
2. Añade `mi-extension` al array `plugins` de `plugins.config.json`.
3. Ejecuta `npm.cmd run build` y las pruebas correspondientes.

```json
{
  "id": "mi-extension",
  "name": "Mi extensión",
  "description": "Describe la función para el usuario.",
  "version": "1.0.0",
  "apiVersion": 1,
  "enabledByDefault": false
}
```

```typescript
import type {EditorPlugin} from '../../src/plugin-api';
const plugin:EditorPlugin={
  setup(context){
    context.ui.addAction({id:'contar',label:'Contar líneas',run(){
      context.ui.notify(`${context.document.read().source.split('\n').length} líneas`);
    }});
    context.ui.addGuideStep({id:'contar',title:'Contar líneas',description:'Consulta el número de líneas del documento.',target:'#plugin-mi-extension-contar'});
    const unsubscribe=context.document.subscribe(snapshot=>{
      // Consultar el documento; no modificar directamente el DOM del editor.
      void snapshot.fileName;
    });
    return unsubscribe;
  }
};
export default plugin;
```

El host retira acciones, suscripciones y pasos al desactivar. Los errores de carga o activación no detienen el editor y las contribuciones parciales se limpian. Las versiones de API incompatibles no se activan. La preferencia se guarda en el navegador; no se escribe en los documentos.

Una extensión se ejecuta como código de la aplicación, con acceso al mismo entorno del navegador. La API organiza las contribuciones y limita las mutaciones ofrecidas; no constituye un aislamiento de seguridad. Instala solo código revisado. No hay descarga ni ejecución de extensiones desde URL introducidas por usuarios.

## Compilación opcional

El registro virtual de Vite solo importa las extensiones configuradas. `MERMAID_BP_PLUGINS=none` genera el núcleo sin sus módulos. Una lista separada por comas permite seleccionar las incluidas. `MERMAID_BP_OUT_DIR` permite elegir otro directorio de salida para verificar una distribución independiente.

Opcionalmente, el manifiesto admite `build.entries` para entradas adicionales, `build.outputs` para nombres públicos estables y `build.script` para una tarea de empaquetado. Las rutas se resuelven desde la extensión y deben permanecer dentro del proyecto. Consulta el manifiesto de BookStack como ejemplo. Los scripts de compilación son código de confianza.

## BookStack

La extensión aporta el botón "BS preview", un paso de guía, la página `bookstack.html`, el módulo público `bookstack-viewer.js` y el encabezado instalable. La colocación manual usa el mismo renderizador del núcleo. Los antiguos archivos `src/bookstack*.ts` se mantienen como entradas de compatibilidad que delegan en la extensión.

Desactivarla oculta la acción y la vista previa informa de que está desactivada. Excluirla de la compilación omite también esos archivos de salida. El ejemplo inicial y el botón "Copiar Mermaid" son independientes de BookStack. La instalación en BookStack se describe en [bookstack.md](bookstack.md).
## Repetir la prueba sin extensiones

```powershell
$env:MERMAID_BP_PLUGINS='none'
npm.cmd run build
npm.cmd exec -- playwright test tests/core-only.spec.ts
Remove-Item Env:MERMAID_BP_PLUGINS
npm.cmd run build
```

La prueba comprueba edición, cascada, navegación al nodo, exportación y guía sin acciones de BookStack. La batería normal comprueba también desactivación, persistencia de la preferencia, reactivación y equivalencia de geometría con la vista previa. `tests/plugin-host.spec.ts` utiliza extensiones de prueba que fallan o terminan de cargar después de desactivarlas para verificar la limpieza y la continuidad del editor.
