FROM node:22-alpine AS frontend-build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/app ./app
COPY frontend/components ./components
COPY frontend/lib ./lib
COPY frontend/public ./public
COPY frontend/next.config.ts frontend/postcss.config.mjs frontend/tsconfig.json frontend/next-env.d.ts ./

ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_DEMO=false
RUN npm run build:production

FROM nginx:alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/out /usr/share/nginx/html