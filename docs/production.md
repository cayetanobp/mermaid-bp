# Desplegar este repositorio

El mismo repositorio contiene el editor local y su despliegue público. Para un servidor con Nginx sin Docker ni npm, utiliza el [paquete web estático](nginx.md). Esta guía conserva la alternativa con Docker y actualización desde Git.

## Primera instalación

El servidor necesita Git, Docker y Docker Compose. Clona tu repositorio y crea la configuración local.

```sh
git clone <url-del-repositorio> mermaid-bp
cd mermaid-bp
cp deploy/docker/.env.example .env
```

Edita `.env`, con el puerto local para tu proxy y el origen HTTPS de tu web si vas a incrustar la herramienta.

```dotenv
APP_PORT=8088
EMBED_ORIGIN=https://www.example.org
```

`EMBED_ORIGIN` no lleva ruta ni barra final. Puedes dejarlo vacío si abrirás la herramienta directamente. `.env` está excluido de Git y se conserva al actualizar.

Inicia el despliegue.

```sh
sh scripts/deploy.sh
```

El script construye el código de ese checkout y levanta el contenedor. La herramienta escucha en `http://127.0.0.1:8088`; ese puerto no se publica en las interfaces externas. Configura tu proxy HTTPS para dirigir el subdominio elegido a esa dirección. Por ejemplo, en Caddy basta este bloque, con tu dominio real y DNS configurado.

```caddyfile
diagramas.example.org {
    reverse_proxy 127.0.0.1:8088
}
```

Con Nginx u otro proxy existente, añade el equivalente conservando las cabeceras de seguridad del contenedor y tus certificados. No publiques el servidor de desarrollo de Vite ni sirvas la raíz del repositorio.

## Actualizar

Desde ese mismo directorio del servidor, ejecuta lo siguiente.

```sh
git pull --ff-only
sh scripts/deploy.sh
```

Docker construye la nueva versión y sustituye el contenedor. El código que cambies, confirmes y envíes a tu remoto seguirá este mismo flujo. No necesitas volver a copiar archivos o reinstalar la aplicación. El `.env` queda fuera del seguimiento de Git.

Para renovar también la imagen base y sus paquetes, puedes ejecutar periódicamente lo siguiente.

```sh
docker compose --env-file .env -f deploy/docker/compose.yaml build --pull --no-cache
docker compose --env-file .env -f deploy/docker/compose.yaml up -d
```

## Integrarlo en tu web

Usa un origen dedicado, por ejemplo `diagramas.example.org`, para separar la herramienta de las cookies y del almacenamiento de tu web principal. Servirla bajo una ruta del mismo origen no proporciona esa separación.

```html
<iframe
  src="https://diagramas.example.org/"
  title="Editor de diagramas Mermaid"
  sandbox="allow-scripts allow-same-origin allow-downloads allow-popups"
  referrerpolicy="no-referrer"
  style="width:100%; height:85vh; border:0"
></iframe>
```

Establece el origen de la web principal en `EMBED_ORIGIN`. Si tu web usa CSP, permite el subdominio de la herramienta en `frame-src`. No añadas permisos para navegar la ventana principal. No compartas cookies, credenciales ni almacenamiento del servidor con la herramienta.

## Datos y seguridad

En producción, el documento y su nombre permanecen en memoria del navegador. No se escriben en localStorage, sessionStorage, un backend ni el servidor. Recargar pierde los cambios no descargados. Guardar y exportar descargan archivos solo a petición del usuario.

El documento permanece únicamente en memoria; recargar lo descarta. Las extensiones pueden usar sus propios canales para recibir datos, según sus políticas y documentación.

Solo se admiten `.mmd` UTF-8, de hasta 200 kB, con comprobación de sintaxis. Se bloquean contenido activo, callbacks y recursos externos; el SVG se sanitiza antes de mostrarlo o exportarlo. La configuración de etiquetas HTML se desactiva sin modificar el archivo original.

El contenedor sirve solo archivos estáticos, acepta GET y HEAD, se ejecuta sin root y con raíz de solo lectura. El directorio temporal es para la configuración y funcionamiento de Nginx; no recibe documentos. Los límites y resultados de la revisión están en [security.md](security.md).

La ruta `/plugins/` enumera únicamente las extensiones instaladas para permitir su descubrimiento. Son código instalado por el administrador, no por los visitantes. No instales plugins sin revisar. Los plugins del repositorio se incluyen al construir la imagen; no se necesitan cambios en el núcleo.

## Comprobar el despliegue

```sh
docker compose --env-file .env -f deploy/docker/compose.yaml ps
docker compose --env-file .env -f deploy/docker/compose.yaml logs --tail=50
```

Para ejecutar las comprobaciones desde un equipo con Node.js y Chromium instalado, utiliza lo siguiente.

```sh
npm ci --include=dev
npm test
npm run test:security
npm run test:local
SECURITY_TEST_URL=http://127.0.0.1:8088 npm run test:public
```

No se ha configurado un remoto Git, DNS, HTTPS ni acceso a tu servidor automáticamente. El repositorio queda preparado para ese flujo; utiliza la URL de tu remoto al clonar.
