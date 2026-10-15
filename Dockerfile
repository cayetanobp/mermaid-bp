FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
RUN apk del nginx-module-acme nginx-module-geoip nginx-module-image-filter nginx-module-njs nginx-module-xslt \
    && apk upgrade --no-cache
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --chmod=0555 deploy/entrypoint.sh /usr/local/bin/mermaid-start
USER nginx
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/mermaid-start"]
