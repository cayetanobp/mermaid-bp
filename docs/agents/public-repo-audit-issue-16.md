# Auditoría previa a publicar los repositorios

Revisión de `cayetanobp/mermaid-bp` y `cayetanobp/mermaid-bp-plugins` antes de hacerlos públicos.

## Alcance y resultado

- Core: `codex/beta-integration` en `82eefdc7aeefb408ebc7934cb41cbf551fdcf1b0`.
- Plugins: `codex/beta-integration` en `e1b48362d2bc8dfa10cb28a8b12a8043f749388e`.
- Ambos proyectos incluyen `LICENSE` AGPL-3.0-only, avisos de alcance y copyright, y documentación de las obligaciones de distribución y código fuente por red.
- Ambos incluyen instrucciones de contribución con fork, rama, pruebas y pull request; el repositorio de plugins explica la compatibilidad de API y los avisos del paquete.
- El núcleo conserva `THIRD_PARTY_RUST_NOTICES.md` y su inventario JS/Rust. Los avisos del plugin BookStack se incluyen con el paquete.
- La búsqueda en nombres de archivos versionados e historial localizó únicamente `.env.example` y `deploy/docker/.env.example`, ambos plantillas. Las comprobaciones por patrones comunes de claves privadas y tokens no hallaron coincidencias en el historial alcanzable ni en los archivos versionados actuales.

La búsqueda de secretos fue una comprobación acotada por patrones conocidos, no un análisis exhaustivo equivalente a Gitleaks. No se encontró un bloqueo concreto en el contenido versionado revisado.

Los repositorios estaban privados, tenían `main` como rama predeterminada y permitían forks. No tenían rulesets ni protección de rama efectivos. El estado y contenido del checkout principal del núcleo contenían cambios locales sin commit durante la auditoría; esta revisión cubrió las confirmaciones indicadas, no esos cambios locales.

## Contextos comprobados de CI

Los nombres siguientes son los contextos exactos devueltos por la API de check-runs de GitHub para ejecuciones exitosas:

- Core, run `39034551727`: `web`, `rust-notices`, `windows`, `core-browser`.
- Core Linux, run `39034551769`: `deb-installed-smoke`.
- Plugins, run `39031076707`: `Plugin package`, `Clean core compatibility`.

Los checks de GitHub Actions usan la integración `15368`. Los payloads del ruleset están en `../scripts/github-rulesets/` y la consulta de reglas efectivas se realiza con `GET /repos/{owner}/{repo}/rules/branches/main`.
