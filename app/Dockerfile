FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_RANCH_API_URL=/api
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_DROPBOX_APP_KEY
ENV VITE_RANCH_API_URL=$VITE_RANCH_API_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_DROPBOX_APP_KEY=$VITE_DROPBOX_APP_KEY
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/record-book.conf
COPY 40-api-key.sh /docker-entrypoint.d/40-api-key.sh
RUN chmod +x /docker-entrypoint.d/40-api-key.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1/ || exit 1
