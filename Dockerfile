FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache git

COPY package*.json ./

RUN npm install

RUN git clone https://github.com/OnuGame/onu2-client.git

WORKDIR /app/onu2-client

RUN npm install

WORKDIR /app

COPY . .

RUN npm run build

WORKDIR /app/onu2-client

RUN npm run build

WORKDIR /app

RUN cp -r onu2-client/dist/ public/

COPY config.example.json config.json

EXPOSE 3000

CMD ["npm", "start"]