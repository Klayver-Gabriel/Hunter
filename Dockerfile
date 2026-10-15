FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node index.html manifest.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node css ./css
COPY --chown=node:node assets ./assets
COPY --chown=node:node server ./server
COPY --chown=node:node scripts/migrate.js scripts/migrate-docker.js scripts/cleanup.js ./scripts/
USER node
ENV HOST=0.0.0.0 PORT=4173 NODE_ENV=production
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4173/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/main.js"]
