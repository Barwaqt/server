FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm run db:generate
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
