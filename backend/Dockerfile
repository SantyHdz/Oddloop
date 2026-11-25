# Stage 1: install everything and compile TypeScript to JavaScript.
FROM node:24-alpine AS build
RUN npm install -g pnpm@12.23.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
# Keep only the dependencies needed at runtime.
RUN pnpm prune --prod

# Stage 2: small final image, no compiler or dev tools, non-root user.
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/package.json ./
# Folder for task attachments: it is a volume, and the non-root user must own it.
RUN mkdir -p /data/attachments && chown node:node /data/attachments
USER node
EXPOSE 3001
CMD ["node", "dist/server.js"]
