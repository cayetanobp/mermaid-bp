# Coordinación de una especificación con varios tickets

Mantén un registro verificable por ticket: dependencia, rama y worktree, SHA integrado, comprobación que demuestra el comportamiento, estado de revisión y estado de GitHub. Distingue `en desarrollo`, `verificado en su rama`, `integrado`, `en main` y `cerrado`. Una issue abierta puede tener código integrado en la rama de trabajo; no la describas como publicada.

Al terminar una tanda de agentes o CI, consulta el registro y asigna el siguiente ticket desbloqueado. Reserva una ranura para un agente de validación o fusión. Reutiliza el implementador del ticket para corregir fallos de su CI. Durante ejecuciones largas de CI, pide al implementador que deje un checkpoint con SHA, run ID y siguiente acción, y libere la ranura.

Antes de concluir la especificación, comprueba cada ticket contra su criterio de aceptación, su SHA en la rama de integración y su cierre en GitHub. Después ejecuta la revisión final, corrige sus hallazgos e integra y publica según la especificación. El estado de los CI pendientes no equivale a una verificación aprobada.

## Pruebas nativas

Antes de lanzar una compilación nativa larga, comprueba espacio libre, ubicación de `target` y caché de Cargo, dependencias del runner y disponibilidad del motor Docker cuando corresponda. En Linux con diálogos de archivos de Tauri, comprueba sesión X11 con gestor de ventanas, DBus, portal de escritorio y directorio `XDG_RUNTIME_DIR` privado. Registra el SHA de la aplicación y el hash del artefacto instalado; reutiliza un instalador solo si los archivos que lo generan no han cambiado.

Captura desde el primer fallo el log del proceso, la ventana nativa completa y la vista web. Para diálogos del sistema, usa una captura del escritorio; una captura WebDriver puede omitirlos. Adjunta al run los archivos de diagnóstico y señala el paso exacto que falló.

Las pruebas del contrato de distribución deben inspeccionar el artefacto producido o ejecutar su comportamiento. Evita aserciones sobre fragmentos literales de scripts cuando no demuestran el resultado. Detén la repetición de pruebas opcionales cuando la evidencia necesaria ya está obtenida.
