# Build stage: full devDependencies so tsc can compile.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: production deps only, compiled output only.
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# docker-compose's healthcheck runs `curl -f http://localhost:3000/health`
# inside this container — alpine's base image doesn't ship curl.
# ffmpeg (for ffprobe) is how eventMedia.ts verifies an uploaded video's
# real duration server-side, rather than trusting whatever the browser
# claims — without it, every video upload would fail outright in
# production, since the command simply wouldn't exist.
RUN apk add --no-cache curl ffmpeg

COPY package.json package-lock.json ./
# Then remove the package managers: the running API only needs `node`
# (the app and `node dist/db/migrate.js`), and npm/yarn/corepack bundle
# their own dependencies, which the image scan (security.yml) flags as
# vulnerable even though the app never loads them.
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /root/.npm
COPY --from=build /app/dist ./dist

# Don't run as root in production.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
# The default local upload directory (UPLOAD_DIR unset, no S3) must be
# writable by the non-root user — /app itself is root-owned, so creating
# it at runtime failed with EACCES and every logo/photo upload 500'd.
RUN mkdir -p /app/uploads && chown nodejs:nodejs /app/uploads
USER nodejs

EXPOSE 3000
CMD ["node", "dist/index.js"]
