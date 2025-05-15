# ---- Build Stage ----
# Build this on x86 and copy the dist folder from the built image
FROM --platform=linux/amd64 node:18-alpine AS build
# Without git installing the npm packages fails
RUN apk add python3 make g++ git libc6-compat
WORKDIR /app
COPY . /app
# install pnpm with corepack
# force bundled libvips and get latest pnpm
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
RUN corepack enable

# Build arguments
ARG DOWNLOAD_SOUNDS=false
ARG DISABLE_SERVICE_WORKER=false
ARG CONFIG_JSON_SOURCE=REMOTE
# TODO need flat --no-root-optional
RUN node ./scripts/dockerPrepare.mjs
RUN pnpm add sharp@latest
RUN pnpm i
RUN pnpm why sharp && pnpm list sharp
# Download sounds if flag is enabled
RUN if [ "$DOWNLOAD_SOUNDS" = "true" ] ; then node scripts/downloadSoundsMap.mjs ; fi

# TODO for development
# EXPOSE 9090
# VOLUME /app/src
# VOLUME /app/renderer
# ENTRYPOINT ["pnpm", "run", "run-all"]
# only for prod
RUN DISABLE_SERVICE_WORKER=$DISABLE_SERVICE_WORKER \
    CONFIG_JSON_SOURCE=$CONFIG_JSON_SOURCE \
    pnpm run build
