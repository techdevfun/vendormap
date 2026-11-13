FROM 123456789012.dkr.ecr.us-east-1.amazonaws.com/acme-base:1.0
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "dist/server.js"]
