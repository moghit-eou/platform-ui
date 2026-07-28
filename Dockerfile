# Step 1: Build the Angular app
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies with cache mount for npm cache
# Some branches intentionally do not track package-lock.json.
# Copy whichever npm manifest files exist and install accordingly.
COPY package*.json ./
RUN npm config set fetch-retries 10 \
    && npm config set fetch-retry-mintimeout 30000 \
    && npm config set fetch-retry-maxtimeout 300000

RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmjs.org/; \
    else \
      npm install --legacy-peer-deps --no-audit --no-fund --registry=https://registry.npmjs.org/; \
    fi


# Copy source code
COPY . .

# Build the app with cache mount for Angular cache
ARG BUILD_CONFIGURATION=production
ENV NG_BUILD_SKIP_FONT_GENERATION=1
RUN --mount=type=cache,target=/app/.angular/cache \
    npm run build -- --configuration ${BUILD_CONFIGURATION}

# Step 2: Use Nginx to serve the Angular app
FROM nginx:alpine-slim
RUN apk upgrade --no-cache \
    && apk add --no-cache gettext-envsubst
ENV PLATFORM_BACKEND_SERVER=platform-backend-service:8080 \
    PLATFORM_BACKEND_CONTEXT=services \
    NOTEBOOK_ENABLED=0 \
    JUPYTER_SERVER=jupyterhub:8000 \
    JUPYTER_CONTEXT=notebook \
    GUIDE_COVARIATE=Sex \
    GUIDE_VARIABLE=Age
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY nginx-websocket-map.conf /etc/nginx/conf.d/00-websocket-map.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist/fl-platform/browser /usr/share/nginx/html

# TODO: temp fix/patch, run nginx as non-root to satisfy Semgrep
# missing-user-entrypoint finding. Needs verification that
RUN chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid \
    && chown nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 80
CMD ["/docker-entrypoint.sh"]