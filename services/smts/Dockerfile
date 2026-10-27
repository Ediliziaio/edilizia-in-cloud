FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 smts && useradd -u 10001 -g smts -M smts \
    && mkdir /data && chown smts:smts /data
WORKDIR /app
COPY services/smts/package.json services/smts/server.ts services/smts/callbacks.ts services/smts/signature.ts services/smts/smts.ts ./services/smts/
COPY supabase/functions/_shared/billingMassive.ts supabase/functions/_shared/xmlMinimo.ts ./supabase/functions/_shared/
USER 10001:10001
ENV HOST=0.0.0.0 PORT=3098 SMTS_DATA_DIR=/data SMTS_CALLBACK_HOST=0.0.0.0 SMTS_CALLBACK_PORT=3100
WORKDIR /app/services/smts
EXPOSE 3098 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3098/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--experimental-transform-types", "server.ts"]
