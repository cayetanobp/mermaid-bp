# Protección de ramas y publicación

`apply-main-protection.ps1 -Mode Plan` muestra los payloads sin mutaciones. `-Mode Apply` exige repositorios públicos y crea únicamente las reglas acordadas que falten; no sobrescribe reglas existentes. `-Mode Verify` comprueba las reglas efectivas de `main`, los patrones guardados, el bypass exclusivo del rol administrador, los checks de Actions y el archivo CODEOWNERS. No compila ni inicia Actions.

Los nombres `core-main.json` y `plugins-main.json` se conservan por compatibilidad. Ahora incluyen la rama predeterminada y las ramas de integración/versiones. Las ramas de trabajo quedan fuera. Las nuevas ramas de integración o versiones deben coincidir con un patrón del payload o incorporarse al ruleset antes de recibir PR.

Se exige PR, una aprobación del propietario del código, invalidación de aprobaciones anteriores, conversaciones resueltas y CI actualizado con el destino. `.github/CODEOWNERS` asigna todo a `@cayetanobp`; debe existir en cada rama de destino. El administrador conserva bypass completo. Los checks están vinculados a Actions (integración `15368`): core `web`, `rust-notices`, `windows`, `core-browser`, `deb-installed-smoke`; plugins `Plugin package` y `Clean core compatibility`.

Reglas ya guardadas el 19 de octubre: core `25360446`, plugins `25360452`. `Verify` fallará mientras CODEOWNERS no esté incorporado. No presentar ese estado como aprobación exclusiva operativa.

Tras la apertura pública que realizará el propietario, ejecutar `activate-public-gates.ps1` para exigir autorización de todo CI externo y configurar el entorno `release-signing` con aprobación de `cayetanobp` y una única rama permitida: `main`. Permite aprobar la ejecución propia para que el único mantenedor pueda publicar. El script nunca cambia visibilidad, mueve secretos o inicia workflows.

Después de incorporar los workflows corregidos y verificar ese entorno, transferir la clave existente al secreto de entorno homónimo directamente por stdin, comprobar su presencia por nombre y retirar el secreto de repositorio. La clave solo pertenece al core. CI usa claves efímeras por ejecución; firma real y publicación usan trabajos manuales de `main` y el entorno protegido. No trasladar la clave mientras el entorno no tenga revisor y restricción de rama comprobados.

Las etiquetas de versiones existentes tienen reglas independientes que bloquean actualización y borrado salvo administrador. La creación de etiquetas nuevas sigue permitida a quien tenga escritura; no se concedió bypass general a Actions. El alias móvil `beta` queda separado y conserva las comprobaciones de pertenencia del workflow.

GitHub rechaza la política de CI externo mientras los repositorios sean privados y el plan actual no permite revisores obligatorios en entornos privados. Esos pendientes se activan y verifican al abrir. No se garantiza preparación completa hasta incorporar los archivos, proteger el entorno, migrar la clave y verificar el flujo.
