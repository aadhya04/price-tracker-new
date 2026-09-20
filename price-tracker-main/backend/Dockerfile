FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV HEADLESS=true
CMD ["node","server.js"]
