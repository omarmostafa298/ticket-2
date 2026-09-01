FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json ./
RUN npm install --production

# Copy application code
COPY server.js ./

EXPOSE 4000

CMD ["npm", "start"]
