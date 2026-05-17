# Meta App Review — Lead Ads Integration

> **Status**: 🟡 PREPARAZIONE (NON ancora submittato)
> **Owner**: Florin (decision + submit manual)
> **Generato**: 2026-05-17 da MP-MKT-001 Fase 5

## Cos'è e perché serve

L'integrazione **Meta Lead Ads** di EdiliziaInCloud permette alle aziende clienti
di ricevere automaticamente in piattaforma i lead generati da campagne Facebook /
Instagram. Per ricevere webhook in **produzione reale** (non solo per
admin/developer/tester), serve passare la **App Review** di Meta:

- App attuale è in **Development Mode** → webhook arrivano solo agli account con
  ruolo `Admin`/`Developer`/`Tester` nell'app Meta
- Dopo App Review approvata → webhook arrivano a TUTTI gli utenti che connettono
  la propria pagina Facebook a EiC

## Checklist pre-submit (da verificare prima di submittare)

### 1. URL legali configurati nel Meta Developer Dashboard

| Campo | Valore atteso |
|---|---|
| Privacy Policy URL | `https://ediliziaincloud.it/privacy` |
| Terms of Service URL | `https://ediliziaincloud.it/termini` |
| Data Deletion Instructions URL | `https://ediliziaincloud.it/privacy/cancellazione-dati` |
| App Domain | `ediliziaincloud.it` |
| Privacy Policy URL (Privacy Center) | come sopra |

Verifica che ognuna di queste URL **risponda 200** in produzione prima del submit.

### 2. Test users

Aggiungere in Meta Developer Dashboard → Roles → Test Users:
- Almeno **3 account di test** con profilo realistico (foto, post, pagina business)
- Ognuno deve avere **almeno una pagina Facebook business** associata
- Documentare username/password in 1Password (vault EiC), non in repo

### 3. Permessi richiesti

Da inserire nel form App Review:

| Permission | Use case |
|---|---|
| `leads_retrieval` | Recuperare i lead form submission dalla pagina del cliente quando un utente compila un form. Senza questo permesso, EiC non può ricevere i lead in tempo reale. |
| `pages_manage_metadata` | Sottoscrivere/desottoscrivere la pagina del cliente al webhook EiC. Sottoscrizione automatica quando il cliente connette la pagina; rimozione al disconnect. |
| `pages_show_list` | Mostrare al cliente la lista delle pagine Facebook che amministra, così può scegliere quale connettere a EiC. |
| `pages_read_engagement` | Leggere i form lead che esistono già sulla pagina (per popolare il selettore "Quale lead form vuoi sincronizzare?"). |

⚠️ **Importante**: ogni use case nel form di App Review deve essere **specifico**
al business EiC, NON boilerplate generico. Reviewer Meta rifiuta descrizioni
copy-paste.

### 4. Screencast obbligatorio

Video 1-3 minuti che dimostra:

1. **00:00–00:30** — Utente loggato in EiC va su Impostazioni → Integrazioni → Meta
2. **00:30–01:00** — Click "Connetti pagina Facebook" → popup OAuth Meta → autorizza pagina test
3. **01:00–01:30** — Mostra elenco pagine connesse, seleziona lead form da sync
4. **01:30–02:30** — Su Facebook (account di test, browser separato): simula
   compilazione lead form → torna a EiC → mostra che il lead è arrivato in
   `/azienda/marketing/contatti`

**Script narrazione** (da preparare):
- Pronuncia chiara, italiano (o inglese se reviewer non IT)
- Mostra esplicitamente l'URL `ediliziaincloud.it` quando appare
- Niente musica forte di sottofondo (reviewer ascolta)

### 5. Pagina demo per reviewer

Pubblicare in produzione (o staging accessibile):
- `https://ediliziaincloud.it/demo-fb-lead` — pagina pubblica che spiega
  l'integrazione, con video embed dello screencast + screenshot dei flow
- Stessa URL inserita nel form App Review come "Demo URL"

### 6. Edge function `meta-lead-webhook` operativa

Verifica pre-submit:
- Endpoint pubblico: `https://<supabase>.functions.supabase.co/meta-lead-webhook`
- `verify_jwt = false` (webhook Meta deve essere pubblico)
- Verifica firma `x-hub-signature-256` con `META_APP_SECRET`
- Risponde 200 al GET di verifica con hub.challenge
- Log: nessun errore 5xx negli ultimi 7 giorni

## Cosa NON è in scope di questa preparazione

- ❌ **Submit form**: lo esegue Florin dal Meta Developer Console
- ❌ **Modifica configurazione Meta App ID/Secret**: in `platform_settings`,
  non in questo doc
- ❌ **Aggiornamento Privacy/Terms text**: separate review legale
- ❌ **Test E2E della pipeline lead → DB**: copertura in `MP-AI-001` o sprint
  dedicato

## Cosa fa Claude Code in questa fase

- ✅ Audit di compliance pre-submit (questa pagina)
- ✅ Verifica integrazione codice (edge fn presente, sidebar attiva, route OK)
- ❌ Non submitta nulla né modifica config Meta

## Riferimenti

- Meta App Review docs: https://developers.facebook.com/docs/app-review
- Lead Ads Webhooks: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- Privacy Policy template (per EiC): `docs/legal/privacy-policy-template.md`
  (se non esiste, è da creare separatamente)
