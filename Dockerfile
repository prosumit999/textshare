FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321
WORKDIR /app
RUN groupadd --system --gid 10001 textshare && \
    useradd --system --uid 10001 --gid textshare --home-dir /app textshare
COPY --from=build --chown=textshare:textshare /app/dist ./dist
COPY --from=build --chown=textshare:textshare /app/node_modules ./node_modules
COPY --from=build --chown=textshare:textshare /app/package.json ./package.json
USER textshare
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4321/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "./dist/server/entry.mjs"]
