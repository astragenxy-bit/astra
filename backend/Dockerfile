# backend/Dockerfile
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM base AS development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM base AS production
RUN npm prune --omit=dev
COPY src/ ./src/
COPY database/ ./database/
EXPOSE 4000
CMD ["node", "src/app.js"]
