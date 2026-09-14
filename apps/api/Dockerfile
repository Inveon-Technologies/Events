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
RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Don't run as root in production.
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

EXPOSE 3000
CMD ["node", "dist/index.js"]
