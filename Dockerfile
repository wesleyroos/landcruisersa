FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Copy built app and production node_modules (includes native better-sqlite3)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Migration script (plain ESM, no build step needed)
COPY scripts/migrate.mjs ./scripts/migrate.mjs

# Volume for SQLite persistence will be mounted at /data
RUN mkdir -p /data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_PATH=/data/db.sqlite

EXPOSE 8080
# Run migration (CREATE TABLE IF NOT EXISTS) then start server
CMD ["sh", "-c", "node scripts/migrate.mjs && node ./dist/server/entry.mjs"]
