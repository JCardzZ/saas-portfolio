# syntax=docker/dockerfile:1
#
# Imagen del frontend. El contexto de build es esta carpeta:
#
#   docker build -t portfolio-frontend portfolio-frontend
#
# La URL de la API se fija al compilar (src/environments/environment.prod.ts); para
# apuntar a otro backend hay que cambiar ese archivo y reconstruir la imagen.

# ---------- Etapa 1: compilar ----------
FROM node:22-alpine AS build
WORKDIR /app

# Las dependencias en su propia capa: solo se reinstalan si cambia el lockfile.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Etapa 2: servir ----------
# Variante de nginx que no se ejecuta como root; escucha en el 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/portfolio-frontend/browser /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:8080/ || exit 1
