FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG BUILD_DATE="27 Sep 2026"
ENV BUILD_DATE=${BUILD_DATE}

RUN npm test && npm run build

FROM nginx:alpine AS runtime

ARG VERSION=1.0.0
ARG BUILD_DATE="27 Sep 2026"
ARG OCI_CREATED="2026-09-27T00:00:00Z"

ENV APP_VERSION=${VERSION} \
    BUILD_DATE=${BUILD_DATE}

LABEL org.opencontainers.image.title="Sinking Sim" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${OCI_CREATED}" \
      org.opencontainers.image.source="https://github.com/rgstephens/sinking-sim"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY --chmod=755 docker/10-release-info.sh /docker-entrypoint.d/10-release-info.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=1s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
