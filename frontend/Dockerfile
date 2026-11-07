FROM node:22-alpine
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/tsconfig.json frontend/next.config.mjs frontend/next-env.d.ts ./
COPY frontend/app ./app
COPY frontend/src ./src
COPY frontend/public ./public
COPY vendor /app/vendor
RUN npm run build
ENV API_SERVER_URL=http://cvat_server:8080
EXPOSE 3000
CMD ["npm", "run", "start"]
