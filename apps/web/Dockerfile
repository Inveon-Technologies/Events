FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# This image's only job is to hold the built static files. docker-compose
# mounts a shared volume and copies dist/ into it on start, so nginx can
# serve them directly — see docker/docker-compose.yml (the `web` service).
FROM alpine:3.20 AS runtime
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["sh", "-c", "cp -r /app/dist/* /usr/share/nginx/html/ 2>/dev/null || true; sleep 1"]
