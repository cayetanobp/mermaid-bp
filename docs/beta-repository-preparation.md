# Estado de los repositorios antes de separar los plugins

Fecha de comprobación: 16 de octubre de 2026. Referencia: issue #2.

## Núcleo (`mermaid-bp`)

- Rama local: `main`, en `1225b62`, alineada con `origin/main` al iniciar este ticket.
- Remoto: `https://github.com/cayetanobp/mermaid-bp.git`.
- Cambios locales preexistentes, sin tocar ni incluir en el commit de preparación:
  - Modificados: `.gitignore`, `src/plugin-state.ts`.
  - Sin seguimiento: `AGENTS.md`, `docs/agents/`, `docs/licencias.md`, `docs/spec-1.0.0-beta.1.md`, `tests/desktop-preview.spec.ts`.
- `toDo.md` es local y está excluido de Git.
- No se ha movido ni eliminado código del núcleo en este ticket. La migración de BookStack corresponde a los tickets posteriores.

## Repositorio de plugins (`mermaid-bp-plugins`)

- Remoto: `https://github.com/cayetanobp/mermaid-bp-plugins.git`, privado al iniciar este ticket.
- El remoto estaba vacío: sin ramas ni archivos. Se verificó antes de escribir.
- Se creó un checkout separado en `C:\Users\cayetano\Desktop\mermaid-bp-plugins`.
- Se creó `main` con un commit inicial vacío (`c690103`) y se publicó sin forzar el envío. `main` sigue `origin/main`.
- El repositorio no contiene todavía plugins ni licencia. Los tickets de licencia y migración añadirán esos contenidos después de revisar derechos y dependencias.

## Revisión preliminar antes de hacerlos públicos

- Se buscó el nombre privado indicado por el propietario, sin distinguir mayúsculas, en el árbol local, archivos ignorados de compilación, nombres de objetos del historial y cambios registrados en todas las ramas locales. No hubo coincidencias. Esta comprobación no sustituye una revisión de cada recurso binario ni una auditoría completa de secretos.
- La búsqueda de nombres de archivo potencialmente sensibles en el historial encontró solo la plantilla `deploy/docker/.env.example`; las configuraciones `.env` reales están excluidas de Git. `toDo.md` también está excluido.
- La corrección local de descubrimiento de plugins en ventanas de escritorio sigue sin comprometerse en `src/plugin-state.ts`, junto con su prueba local. La prueba de vista previa de escritorio pasó sobre la compilación local. No se incorporaron esos cambios a este ticket.
- La revisión de derechos, licencias de terceros y otros recursos distribuidos sigue siendo una condición del ticket de licencia antes de hacer públicos los repositorios.

## Pautas para los siguientes tickets

- Comprobar `git status` y el remoto de ambos repositorios antes de copiar o eliminar archivos.
- Mantener separados los commits de cada repositorio. No incluir los cambios locales preexistentes del núcleo sin revisarlos con su propietario.
- Copiar y verificar el paquete de BookStack en el repositorio de plugins antes de retirar su versión del núcleo.
- Evitar envíos forzados y comprobar que la rama remota no avanzó antes de publicar cambios nuevos.
