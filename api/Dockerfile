FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY sql ./sql
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && apk add --no-cache wget
RUN addgroup -S ranch && adduser -S ranch -G ranch
USER ranch
EXPOSE 8080
ENV HOST=0.0.0.0
ENV PORT=8080
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
