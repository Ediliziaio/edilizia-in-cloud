# Immagine ufficiale Playwright: ha già Node + Chromium + tutte le librerie di
# sistema → niente "playwright install --with-deps" che fallisce su distro slim.
FROM mcr.microsoft.com/playwright:v1.48.2-jammy

WORKDIR /app

# Dipendenze (sfrutta la cache: copia solo i manifest prima del codice)
COPY package.json ./
# Il postinstall scarica chromium; nell'immagine playwright è già presente,
# quindi lo saltiamo per build più veloci.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
