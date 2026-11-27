FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY products.json ./
COPY public ./public
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["npm","start"]
