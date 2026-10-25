FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=pwuser:pwuser src ./src
USER pwuser
ENV NODE_ENV=production FORGECORE_BROWSER_PORT=8790
EXPOSE 8790
CMD ["node","src/agent.mjs"]
