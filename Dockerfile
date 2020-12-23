# ./Dockerfile

FROM node:12.18.1

LABEL authors="Lukas Mateffy (@Capevace)"

ENV NODE_ENV=production

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

COPY . .

CMD [ "node", "scripts/start.js" ]
