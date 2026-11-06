FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json next.config.mjs next-env.d.ts ./
COPY app ./app
COPY src ./src
COPY public ./public
RUN npm run build
ENV API_SERVER_URL=http://app-server:8080
EXPOSE 3000
CMD ["npm", "run", "start"]
