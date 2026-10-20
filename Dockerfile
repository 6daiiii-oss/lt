FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node . .
RUN node scripts/fonts.js && mkdir -p /app/.runtime/uploads && chown -R node:node /app/.runtime
USER node
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/app/.runtime/uploads
EXPOSE 3000
CMD ["npm", "start"]
