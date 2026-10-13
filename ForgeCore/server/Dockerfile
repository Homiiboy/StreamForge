FROM node:22-alpine
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
ENV NODE_ENV=production FORGECORE_DB_PATH=/data/forgecore.sqlite FORGECORE_MEDIA_ROOT=/media FORGECORE_HOST=0.0.0.0 FORGECORE_PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.mjs"]
