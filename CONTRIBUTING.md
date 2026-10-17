# Contribuir a Mermaid BP

Gracias por proponer una corrección o mejora. Antes de abrir una PR, busca una issue existente o crea una para acordar el alcance.

## Elegir dónde va el cambio

- Propón un cambio al núcleo si afecta a la edición, al renderizado, a los archivos Mermaid, a la accesibilidad, a la seguridad o a una función general que deba estar disponible sin configurar extensiones.
- Propón un plugin si la función es opcional, integra un servicio externo o resuelve un flujo de trabajo especializado. Los plugins se desarrollan en el [repositorio separado](https://github.com/cayetanobp/mermaid-bp-plugins); consulta allí sus instrucciones para proponer cambios.

Si no está claro dónde encaja, abre una issue con el caso de uso y pregunta antes de preparar un cambio grande.

## Preparar una PR para el núcleo

1. Haz un fork de `cayetanobp/mermaid-bp` desde GitHub. El fork te permite escribir en tu propia copia; no concede permisos de escritura al repositorio original.
2. Clona tu fork y configura el repositorio original como `upstream`:

   ```powershell
   git clone https://github.com/TU-USUARIO/mermaid-bp.git
   cd mermaid-bp
   git remote add upstream https://github.com/cayetanobp/mermaid-bp.git
   ```

3. Crea una rama en tu fork para el cambio:

   ```powershell
   git switch -c fix/descripcion-breve
   ```

4. Haz el cambio y ejecuta las comprobaciones que correspondan:

   ```powershell
   npm.cmd ci
   npm.cmd test
   npm.cmd run test:security
   npm.cmd run build
   ```

   Para cambios de interfaz, ejecuta también `npm.cmd run test:browser` después de instalar Chromium con `npm.cmd exec playwright install chromium`. Para cambios de escritorio, sigue los requisitos y comandos de [desktop-app/README.md](desktop-app/README.md). En la PR indica qué comprobaciones ejecutaste y cuáles no aplicaban.

5. Guarda y sube la rama a tu fork:

   ```powershell
   git add .
   git commit -m "Describe el cambio"
   git push -u origin fix/descripcion-breve
   ```

6. Abre una pull request desde tu rama `TU-USUARIO:fix/descripcion-breve` hacia `cayetanobp/mermaid-bp:main`. Resume el problema y la solución, enlaza la issue y añade capturas si ayudan a revisar el cambio.

Las PR deben limitarse a un propósito claro. Actualiza las guías o los ejemplos cuando cambie el comportamiento que explican. Conserva avisos de licencia y de terceros en cualquier artefacto que los distribuya.

## Qué incluir en una issue

Describe el resultado que esperabas, el que observaste y los pasos para reproducirlo. Para errores visuales, indica la versión, el navegador o sistema y adjunta un `.mmd` mínimo que se pueda compartir. Para propuestas, explica quién necesita la función y si podría ser un plugin.
