# Production image for biskett.com.
# server.js serves the pre-built biskett-site/ (run `pnpm build` first; it is baked in)
# and stores form submissions in SQLite. One runtime dependency: nodemailer (email).
FROM node:26-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
# Only runtime dependencies; fonts/figma tooling are build-time and stay out of the image.
RUN npm install -g pnpm@12.10.1 && pnpm install --prod --frozen-lockfile --ignore-scripts

COPY server.js ./
COPY lib/ ./lib/
COPY biskett.config.json ./
COPY biskett-site/ ./biskett-site/

# The submission database is the only writable path, so it is also the only volume.
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV PORT=8080 HOST=0.0.0.0 BISKETT_SITE_DIR=/app/biskett-site BISKETT_DATA_DIR=/app/data
USER node
EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
