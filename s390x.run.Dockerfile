# ---- Run Stage ----
FROM --platform=linux/s390x node:18-alpine
RUN apk add git
WORKDIR /app
# Copy build artifacts from the build stage
COPY --from=build /app/dist /app/dist
COPY server.js /app/server.js
# Install express
RUN npm i -g pnpm@10.8.0
RUN npm init -yp
RUN pnpm i express github:zardoy/prismarinejs-net-browserify compression cors
EXPOSE 8080
VOLUME /app/public
ENTRYPOINT ["node", "server.js", "--prod"]
