# Pinned official Node LTS manifest, verified 2026-10-25. No application secrets.
FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential autoconf automake libtool pkg-config texinfo curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl --fail --location --proto '=https' --tlsv1.2 https://ftp.gnu.org/gnu/libredwg/libredwg-0.14.tar.gz -o source.tar.gz \
    && echo 'cb6ee0b078c6d9e0f09d66f1feac33ba6342df88ae544e9f9335fab475218351  source.tar.gz' | sha256sum --check \
    && tar -xzf source.tar.gz \
    && cd libredwg-0.14 && ./configure --prefix=/opt/cad --disable-shared && make -j2 && make install

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 cad && useradd -u 10001 -g cad -M cad
COPY --from=build /opt/cad /opt/cad
COPY --from=build /build/libredwg-0.14/COPYING /usr/share/licenses/libredwg/COPYING
COPY --from=build /build/source.tar.gz /usr/share/licenses/libredwg/source.tar.gz
ENV PATH="/opt/cad/bin:$PATH"
ENV CAD_LISTEN_HOST="0.0.0.0"
WORKDIR /app
COPY services/cad/package.runtime.json package.json
COPY services/cad/*.mts services/cad/
COPY src/lib/preventivi/quoteCad.ts src/lib/preventivi/quoteCad.ts
COPY supabase/functions/_shared/quoteCadAccess.ts supabase/functions/_shared/quoteCadAccess.ts
USER 10001:10001
EXPOSE 8094
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8094/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--max-old-space-size=256", "services/cad/server.mts"]
