FROM node:22-alpine AS ui
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM python:3.13-alpine
WORKDIR /app
COPY --from=ui /build/dist ./dist
COPY app-server ./app-server
ENV PORT=8080
EXPOSE 8080
CMD ["python", "app-server/server.py"]
