FROM node:22-alpine as base

FROM base as deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base as builder
WORKDIR /app
COPY package.json .
COPY src src
COPY --from=deps node_modules ./node_modules
RUN npm run build

FROM base as deps-prod
COPY package.json package-lock.json ./
RUN npm ci --production

FROM base as runner
WORKDIR /app
COPY --from=deps-prod node_modules ./node_modules
COPY --from=builder dist /app
ENTRYPOINT [ "node", "/app/start-standalone.js" ]
