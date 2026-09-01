# WhatsApp locale — mettere in piedi il gateway

Il canale "WhatsApp locale" di EiC parla con un gateway **OpenWA** che devi
ospitare tu. Il codice della piattaforma è già pronto: appena il gateway
risponde, dal pannello super-admin si collegano i numeri e si inizia.

Serve un server sempre acceso perché le sessioni WhatsApp sono connessioni
aperte: se la macchina si spegne o cambia rete, i numeri si scollegano e
vanno riabbinati col QR.

## 1. Il server

Un VPS piccolo basta. Con il motore `baileys` ogni numero occupa 30–80 MB:

| Numeri da collegare | Taglia consigliata |
|---|---|
| fino a 10 | 2 vCPU · 4 GB RAM · 40 GB disco |
| fino a 30 | 4 vCPU · 8 GB RAM |

Va bene qualunque provider (Hetzner, Contabo, OVH…). Prendi **Ubuntu 24.04**.

## 2. Il dominio

Fai puntare un sottodominio all'IP del VPS, per esempio
`wa.ediliziaincloud.com` → record **A** con l'IP. Serve per l'HTTPS: sia il
pannello sia i webhook di Supabase chiamano il gateway da internet.

## 3. Installazione

Collegati al VPS e incolla:

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# I file di questa cartella (docker-compose.yml, Caddyfile, .env.example)
mkdir -p /opt/whatsapp-gateway && cd /opt/whatsapp-gateway
# …copiali qui, poi:

cp .env.example .env
openssl rand -hex 32          # copia il risultato dentro .env, in OPENWA_API_KEY
nano .env

nano Caddyfile                # metti il TUO sottodominio al posto di wa.ediliziaincloud.com

docker compose up -d
docker compose logs -f openwa # controlla che parta senza errori
```

Verifica che risponda (dal tuo computer):

```bash
curl -H "X-API-Key: LA_TUA_CHIAVE" https://wa.ediliziaincloud.com/api/sessions
```

Deve tornare una lista (all'inizio vuota). Se risponde `401` la chiave è
sbagliata; se non risponde affatto, controlla DNS e firewall (porte 80 e 443).

## 4. Collegare EiC

Nel pannello **super-admin → impostazioni → WhatsApp locale**:

- **URL gateway**: `https://wa.ediliziaincloud.com`
- **API key**: quella generata al punto 3
- **Webhook secret**: genera un altro `openssl rand -hex 32` — serve a firmare
  i messaggi in arrivo: senza, il webhook li rifiuta

Premi **Verifica connessione**: se il pallino diventa verde il gateway è
raggiungibile.

## 5. Collegare i numeri

Sempre dal pannello, per ogni numero: **Nuovo numero** → dai un nome
riconoscibile (es. "Marketing Lombardia") → inquadra il QR con
_WhatsApp → Dispositivi collegati_ sul telefono di quel numero.

Per ciascuno puoi impostare tag, tetto giornaliero e settimanale, e pausa
minima fra un messaggio e l'altro. **Non alzarli subito**: un numero nuovo che
manda cento messaggi il primo giorno viene bloccato. Il sistema ha già un
riscaldamento progressivo, lascialo lavorare.

## Manutenzione

```bash
docker compose logs -f openwa     # cosa sta succedendo
docker compose restart openwa     # riavvio senza perdere le sessioni
docker compose pull && docker compose up -d   # aggiornamento
```

Il volume `openwa-data` contiene gli abbinamenti dei numeri: se lo cancelli
devi rifare tutti i QR. Vale la pena includerlo nei backup del VPS.
