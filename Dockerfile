# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# The frontend reads its API base from Vite's import.meta.env.VITE_API_BASE,
# which is BAKED IN at build time. Override per environment, e.g.:
#   docker build --build-arg VITE_API_BASE=https://api.your-domain/api/v1 ...
# (docker-compose passes this through as a build arg). If unset, it falls back
# to localhost which only works when the backend is published on the same host.
ARG VITE_API_BASE=http://localhost:5050/api/v1
ENV VITE_API_BASE=$VITE_API_BASE

# Build the SvelteKit app (adapter-node -> build/) and drop dev deps
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
WORKDIR /app

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

USER node
CMD ["node", "build"]
