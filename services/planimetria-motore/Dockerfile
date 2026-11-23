# Motore planimetrie online: Blender (render Cycles su CPU) + LibreDWG + ezdxf.
# Costruito dalla radice del repository:
#   docker build -f services/planimetria-motore/Dockerfile -t planimetria-motore .
# Nessun segreto nell'immagine: arrivano dalle variabili del container.

# --- LibreDWG 0.14, come services/cad (checksum verificato) -------------------
FROM debian:bookworm-slim AS libredwg
RUN apt-get update && apt-get install -y --no-install-recommends build-essential autoconf automake libtool pkg-config texinfo curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN curl --fail --location --proto '=https' --tlsv1.2 https://ftp.gnu.org/gnu/libredwg/libredwg-0.14.tar.gz -o source.tar.gz \
    && echo 'cb6ee0b078c6d9e0f09d66f1feac33ba6342df88ae544e9f9335fab475218351  source.tar.gz' | sha256sum --check \
    && tar -xzf source.tar.gz \
    && cd libredwg-0.14 && ./configure --prefix=/opt/cad --disable-shared --disable-bindings && make -j4 && make install

# --- Blender 4.5.3 LTS ufficiale, verificato col file sha256 della release ----
FROM debian:bookworm-slim AS blender
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /dl
RUN curl --fail --location --proto '=https' --tlsv1.2 -O https://download.blender.org/release/Blender4.5/blender-4.5.3-linux-x64.tar.xz \
    && curl --fail --location --proto '=https' --tlsv1.2 -O https://download.blender.org/release/Blender4.5/blender-4.5.3.sha256 \
    && grep ' blender-4.5.3-linux-x64.tar.xz$' blender-4.5.3.sha256 | sha256sum --check \
    && mkdir /opt/blender && tar -xJf blender-4.5.3-linux-x64.tar.xz -C /opt/blender --strip-components=1 \
    && rm -rf /opt/blender/4.5/scripts/addons_core/io_import_dxf

# --- Esecuzione ----------------------------------------------------------------
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 python3-venv \
      libx11-6 libxrender1 libxi6 libxxf86vm1 libxfixes3 libxkbcommon0 libsm6 libgl1 libegl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 motore && useradd -u 10001 -g motore -M -d /tmp motore
COPY --from=libredwg /opt/cad /opt/cad
COPY --from=libredwg /build/libredwg-0.14/COPYING /usr/share/licenses/libredwg/COPYING
COPY --from=blender /opt/blender /opt/blender
COPY dev/planimetria-editor/requirements-dwg.txt /tmp/requirements-dwg.txt
RUN python3 -m venv /opt/dwg && /opt/dwg/bin/pip install --no-cache-dir -r /tmp/requirements-dwg.txt && rm /tmp/requirements-dwg.txt
WORKDIR /app
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund sharp@0.35.5 && rm -rf /root/.npm
# Solo i file che il motore usa davvero.
COPY services/planimetria-motore/server.mts services/planimetria-motore/server.mts
COPY shared/planimetrie/bigliettoMotore.ts shared/planimetrie/renderLocale.ts shared/planimetrie/
COPY dev/planimetria-editor/renderParametri.mts dev/planimetria-editor/cadPreviewPlugin.mts \
     dev/planimetria-editor/renderFotorealistico.py dev/planimetria-editor/ambiente-cortile.exr \
     dev/planimetria-editor/anteprimaDxf.py dev/planimetria-editor/ricostruisciDxf.py dev/planimetria-editor/
COPY dev/preventivatore-ai/planOcrPlugin.mts dev/preventivatore-ai/
COPY src/lib/preventivi/quoteCad.ts src/lib/preventivi/
COPY src/lib/planimetrie/coordinateDwg.ts src/lib/planimetrie/
ENV PATH="/opt/cad/bin:/opt/blender:$PATH" \
    BLENDER_BIN=/opt/blender/blender \
    PLANIMETRIE_DWG_BIN=/opt/cad/bin/dwg2dxf \
    PLANIMETRIE_DWG_PYTHON=/opt/dwg/bin/python3 \
    PORT=8080 \
    NODE_ENV=production
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "services/planimetria-motore/server.mts"]
