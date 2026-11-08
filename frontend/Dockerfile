FROM node:22-alpine
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/tsconfig.json frontend/next.config.mjs frontend/next-env.d.ts ./
COPY frontend/app ./app
COPY frontend/src ./src
COPY frontend/public ./public
COPY vendor /app/vendor
ENV API_SERVER_URL=http://cvat_server:8080
ENV MODEL_SERVER_URL=http://octate-model-gateway:8090
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
