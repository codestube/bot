# Dockerfile
FROM node:22-slim

WORKDIR /usr/src/app

# dependenciessssssssssss
COPY package*.json ./
RUN npm ci --omit=dev

# copy code?
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

# expose port cuz idk
EXPOSE 8080

# Package.json should have: "start": "node bot.js"
CMD ["npm", "start"]
