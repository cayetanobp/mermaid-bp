# Protección de `main` en GitHub

`apply-main-protection.ps1` prepara, aplica y verifica un ruleset activo para `main` en ambos repositorios. Requiere GitHub CLI autenticado con permisos de administración.

Primero inspecciona el plan:

```powershell
./scripts/github-rulesets/apply-main-protection.ps1 -Mode Plan
```

Después de completar la revisión final y publicar ambos repositorios, aplica y verifica los ajustes:

```powershell
./scripts/github-rulesets/apply-main-protection.ps1 -Mode Apply
./scripts/github-rulesets/apply-main-protection.ps1 -Mode Verify
```

`Apply` exige que cada repositorio ya sea público. Crea el ruleset específico `Issue 16 public main protection: mermaid-bp` si no existe. Nunca actualiza ni elimina rulesets preexistentes; se detiene ante nombres duplicados o si uno con ese nombre no aplica a `main`. `Verify` consulta tanto la configuración guardada como las reglas efectivas de `main`; informa error si la PR, los checks, cero aprobaciones obligatorias, la ausencia de bypasses, el bloqueo de borrado o el bloqueo de force-push no se cumplen.

Las condiciones de PR permiten al propietario fusionar una PR propia después de que pasen los checks. Las aprobaciones son opcionales, así que otros colaboradores pueden revisar y aprobar las PR externas sin que se exija una aprobación ajena. No se añaden actores de bypass. Los checks están fijados a GitHub Actions (integración `15368`) y sus contextos se comprobaron en ejecuciones exitosas: núcleo `web`, `rust-notices`, `windows`, `core-browser`, `deb-installed-smoke`; plugins `Plugin package`, `Clean core compatibility`.

Referencias: [GitHub REST API para rulesets](https://docs.github.com/en/rest/repos/rules), especialmente las secciones de crear/actualizar rulesets y consultar las reglas efectivas de una rama.
