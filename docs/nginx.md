# Desplegar la web compilada con Nginx

El servidor necesita únicamente Nginx y los archivos del paquete. No necesita Node.js, npm, Docker, Git ni una base de datos. La edición se ejecuta en el navegador y los documentos no se envían al servidor.

## Obtener el paquete

Descarga `mermaid-bp-web.zip` de la release elegida. Incluye `site/`, la configuración en `nginx/` y esta guía como `LEEME.md`. La misma descarga sirve para Nginx en Linux o Windows.

Para prepararlo desde el código fuente, en el equipo de desarrollo o de compilación ejecuta lo siguiente.

```sh
npm ci
npm run package:web
```

El ZIP y su suma SHA-256 quedan en `artifacts/releases/`. También puedes ejecutar manualmente el flujo "Paquete web para Nginx" desde Actions en GitHub; descarga su artefacto y extrae el ZIP que contiene. Estos pasos requieren Node.js solo en el equipo que compila. El flujo no crea una release ni despliega al servidor; puedes adjuntar el ZIP y su checksum cuando publiques una release.

## Instalar en un servidor existente

1. Extrae el paquete fuera del directorio público y sube su carpeta `site/`, por ejemplo a `/var/www/mermaid-bp/site`. Conserva los permisos de lectura de los archivos para Nginx. Solo `site/` debe quedar expuesta al navegador.
2. Copia `nginx/mermaid-bp-static.conf` a `/etc/nginx/snippets/mermaid-bp-static.conf`.
3. Si ya tienes el subdominio y HTTPS configurados, cambia su `root` a `/var/www/mermaid-bp/site` y añade la línea `include /etc/nginx/snippets/mermaid-bp-static.conf;` dentro de ese bloque `server`. Sustituye las reglas `location` anteriores del sitio por las del include; no dupliques `location /`. Conserva los certificados y la redirección HTTPS que ya utilizas.
4. Como referencia de un sitio nuevo, tienes `nginx/mermaid-bp.conf`. Cambia `diagramas.example.org` y la ruta. En Debian y Ubuntu puedes guardarlo en `sites-available` y habilitarlo desde `sites-enabled`; otras instalaciones cargan `conf.d`. Integra ese bloque en el mecanismo que ya utilice tu servidor.
5. Comprueba la configuración y recarga Nginx.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

En Nginx para Windows adapta las rutas y utiliza `nginx.exe -t` y `nginx.exe -s reload`. Utiliza HTTPS en el acceso remoto para disponer del portapapeles del navegador.

## Plugins y comprobación

La carpeta pública `site/` incluye `LICENSE`, `NOTICE.md` y `THIRD_PARTY_NOTICES.md`; mantenlos accesibles al publicar el paquete. Si ofreces una versión modificada con interacción por red, informa a sus usuarios de cómo obtener gratuitamente el código fuente correspondiente de esa versión conforme a la sección 13 de AGPL-3.0. Un enlace a la fuente original no sustituye la fuente de tus modificaciones.

Abre la URL del sitio y comprueba que el ejemplo se renderiza y aparece "BS preview". Abre un `.mmd`, edítalo y descarga la copia con "Guardar .mmd". Recargar descarta el documento.

La ruta `/plugins/` debe responder con JSON, no con una página HTML ni con `index.html`. Nginx enumera únicamente ese directorio para que el editor descubra las extensiones. El resto de directorios no habilita listado. Añade plugins listos para navegador a `site/plugins/<id>/` y recarga la página; no hace falta recompilar ni reiniciar Nginx.

Puedes comprobarlo desde el servidor.

```sh
curl -I https://diagramas.example.org/
curl https://diagramas.example.org/plugins/
```

Si incrustas el editor en otra web, añade su origen HTTPS a `frame-ancestors` en el snippet, por ejemplo `frame-ancestors 'self' https://www.example.org;`. Usa un subdominio dedicado para el editor. Estas cabeceras pertenecen a ese sitio; no incluyas el snippet en todos los sitios del servidor.

## Actualizar

Extrae la nueva versión y prepara su carpeta `site/` completa antes de sustituir la anterior. Conserva por separado las carpetas de plugins que hayas instalado y añádelas a la nueva versión. No mezcles los archivos `assets/` de dos versiones ni mantengas complementos que hayas retirado deliberadamente.

Si utilizas un enlace simbólico al directorio de la versión activa, puedes cambiar ese enlace cuando la nueva versión esté completa y mantener el anterior para volver atrás. La configuración de Nginx se instala una vez; solo hay que recargarla cuando cambie. El ZIP no contiene certificados ni configuración privada del servidor.

La compilación es estática; no abras `index.html` mediante `file://` ni arranques el servidor de desarrollo en producción. Se conserva también la alternativa con Docker en [la guía de Docker](https://github.com/cayetanobp/mermaid-bp/blob/main/docs/production.md).
