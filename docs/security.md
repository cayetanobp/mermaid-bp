# Revisión de seguridad para publicación

Revisión del 15 de octubre de 2026. Alcance de esta entrega, código del editor y del visor incluido, validación de entradas, dependencias npm, políticas del navegador y contenedor estático. No es una auditoría externa de penetración ni cubre la configuración real de tu servidor.

## Hallazgos corregidos

- La apertura aceptaba archivos de otras extensiones y no validaba Mermaid antes de sustituir el documento.
- Mermaid 11.7.0 tenía avisos conocidos de XSS, inyección CSS y bloqueos de renderizado. Se actualizó a 11.17.2 y se resolvió el aviso restante de KaTeX con 0.18.2.
- El modo de producción guardaba el documento y su nombre en localStorage. Ahora solo persiste preferencias.
- Se confiaba únicamente en la sanitización de Mermaid. Ahora hay restricciones de entrada, configuración estricta protegida y una segunda sanitización del SVG.
- El servidor carecía de CSP y restricciones explícitas de métodos. Ahora sirve contenido estático con políticas de navegador y bloqueo de escritura.
- El contenedor se ejecutaba con la configuración predeterminada del servidor. Ahora usa un usuario sin privilegios y Compose limita escritura, procesos y memoria.

Se conservan los identificadores protegidos de Mermaid reciente y se adapta el editor a ellos, sin eliminar su prefijo de aislamiento. La actualización se valida con el archivo real de 27 nodos.

## Límites y condiciones del despliegue

El aislamiento de la web principal requiere un origen dedicado; compartir origen conserva los permisos que el navegador concede a todo su JavaScript. El archivo `.mmd` no se usa como script ni como plugin. Las extensiones instaladas por el administrador siguen siendo código de confianza.

No se evalúa JavaScript del usuario ni se le entrega acceso a Node.js, shell, rutas del servidor o APIs de selección de directorios. El selector solo entrega el archivo elegido y el arrastre procesa el primer archivo recibido. El guardado y la exportación son descargas expresas del usuario.

El cierre o la recarga pierden los documentos en todos los modos, incluido desarrollo local. Al arrancar, la aplicación elimina el borrador antiguo de versiones anteriores sin leer su contenido. Las preferencias de interfaz y extensiones se conservan. Usa el subdominio dedicado recomendado para evitar heredar datos o service workers de otra aplicación.

Las cabeceras no sustituyen la actualización del navegador, el servidor y las dependencias. Los límites reducen la exposición al consumo de recursos del navegador, sin garantizar un tiempo máximo para cualquier diagrama válido.

## Referencias comprobadas

- [Política de seguridad de Mermaid](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html).
- [Opciones protegidas de configuración](https://mermaid.js.org/config/schema-docs/config-properties-secure.html).
- [Aviso de inyección CSS en configuración](https://github.com/mermaid-js/mermaid/security/advisories/GHSA-87f9-hvmw-gh4p).
- [Avisos oficiales del proyecto](https://github.com/mermaid-js/mermaid/security/advisories).

El resultado de las pruebas del perfil de producción se registra junto a la entrega. `npm audit` no detecta avisos conocidos en el momento de la revisión; eso no permite descartar vulnerabilidades aún no publicadas.


## Resultado de las comprobaciones

- 40 pruebas unitarias del editor aprobadas.
- 12 pruebas de la política de entrada aprobadas.
- 8 pruebas de navegador contra el contenedor endurecido aprobadas.
- Una prueba de arranque local sin persistencia del documento, con historial y edición.
- TypeScript y compilación de producción aprobados.
- `npm audit`, cero vulnerabilidades conocidas. Informe en `dependency-audit-2026-10-15.json`.
- Docker Scout, cero paquetes vulnerables detectados en la imagen final, con 38 paquetes indexados. Informe SARIF en `container-audit-2026-10-15.sarif`.
- Configuración Nginx validada, proceso con UID 101, raíz de solo lectura, sin capacidades y con prohibición de elevar privilegios.
- Se comprobó que el origen HTTPS de incrustación se incorpora a la CSP y que se rechazan valores con rutas.

La primera imagen tenía dos avisos altos de libexpat, una dependencia de los módulos de procesamiento de imágenes que no utiliza este servidor estático. Se retiraron esos módulos y sus dependencias, se actualizaron los paquetes de la imagen base y se repitieron el análisis y las pruebas sobre la imagen final. No se ocultaron esos avisos mediante filtros o excepciones.

Las pruebas de navegador verifican selección, arrastre, deshacer y rehacer, creación y edición de nodos, archivo real de 27 nodos y exportación sanitizada. Los casos de ataque se mantuvieron como datos de prueba locales.

## Despliegue integrado en Git

La configuración está integrada en el repositorio principal. Se comprobó la construcción de la imagen a partir de un clon nuevo del commit de despliegue, sin depender de archivos sin confirmar del equipo de desarrollo. La imagen de ese clon supera las ocho pruebas públicas y el análisis de paquetes. Las instrucciones de instalación y actualización están en [production.md](production.md). Los archivos `.env` reales también se excluyen del contexto de construcción de Docker.
