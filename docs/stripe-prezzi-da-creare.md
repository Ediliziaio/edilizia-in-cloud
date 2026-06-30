# Stripe — Prodotti e Prezzi da creare (guida copia-incolla)

> Obiettivo: collegare i piani a Stripe così il bottone "Genera Link Pagamento"
> funziona e i rinnovi partono in automatico. Crea questi prodotti/prezzi nella
> **dashboard Stripe in modalità LIVE**, poi incolla i price-ID al team tecnico.

## 0) Prima di iniziare
- In alto a destra nella dashboard Stripe: assicurati di essere in **modalità Live** (non "Modalità test").
- Valuta: **EUR**. Tutti i prezzi sono **ricorrenti**.
- I prezzi sotto sono l'importo che vuoi **addebitare**. (IVA: se vuoi gestirla separata si attiva Stripe Tax dopo — per ora teniamo semplice.)

---

## 1) Prodotto: Edilizia in Cloud — Scopri (demo)
**Nome prodotto:**
```
Edilizia in Cloud — Scopri
```
**Descrizione:**
```
Inizia gratis, senza scadenza. Fino a 3 cantieri attivi, 1 preventivo con firma online del cliente, app operai con timbratura GPS e rapportino. Oggi non paghi nulla: la carta serve solo per attivare l'upgrade quando sei pronto.
```
**Prezzi da aggiungere:**
- Mensile · **€0,00** · ricorrente · ogni **1 mese**

---

## 2) Prodotto: Edilizia in Cloud — Starter
**Nome prodotto:**
```
Edilizia in Cloud — Starter
```
**Descrizione:**
```
Gestionale base per artigiani e piccole imprese edili. Commesse illimitate con SAL, Fatturazione Elettronica SDI (FatturaPA), DDT, Note di Credito, Proforma e acconti, Prima Nota e Registro Incassi, previsionale cassa 60 giorni, app operai mobile (timbratura GPS + rapportino), self-service ferie/cedolini. Utenti illimitati, 10 GB.
```
**Prezzi da aggiungere:**
- Mensile · **€127,00** · ricorrente · ogni **1 mese**
- Annuale · **€1.188,00** · ricorrente · ogni **12 mesi** (≈ €99/mese)

---

## 3) Prodotto: Edilizia in Cloud — Pro
**Nome prodotto:**
```
Edilizia in Cloud — Pro
```
**Descrizione:**
```
Per imprese strutturate. Tutto Starter + Giornale dei Lavori, ODA fornitori con Verifica OdA AI, Sicurezza Cantiere 81/08, Subappalti e Gantt multi-cantiere, ritenute di garanzia, preventivi e fatture personalizzabili, Scadenzario e Tesoreria, Banca PSD2, previsionale 90 giorni, CRM completo con pipeline, email marketing 5.000/mese, automazioni Flow Builder, Computo Metrico AI, HR e cedolini, magazzino con barcode. 30 GB. 1 call/mese consulente.
```
**Prezzi da aggiungere:**
- Mensile · **€247,00** · ricorrente · ogni **1 mese**
- Annuale · **€2.364,00** · ricorrente · ogni **12 mesi** (≈ €197/mese)

---

## 4) Prodotto: Edilizia in Cloud — Enterprise
**Nome prodotto:**
```
Edilizia in Cloud — Enterprise
```
**Descrizione:**
```
Imprese complesse, multi-sede, AI-first. Tutto Pro + gestione multi-sede, Banca PSD2 (3 conti), previsionale 365 giorni, export XBRL per il commercialista, email marketing 20.000/mese, portale cliente white label, Agenti AI sulla knowledge base aziendale, Agente Vocale AI, WhatsApp Bot AI H24, Render AI, Verifica OdA AI, API REST + Webhook, dominio personalizzato, SLA uptime 99.9%, onboarding premium e telefono dedicato. 100 GB.
```
**Prezzi da aggiungere:**
- Mensile · **€547,00** · ricorrente · ogni **1 mese**
- Annuale · **€5.244,00** · ricorrente · ogni **12 mesi** (≈ €437/mese)

---

## Come si crea (passo-passo nella dashboard)
1. Menù **Catalogo prodotti** → **+ Crea prodotto** (o "Aggiungi prodotto").
2. Incolla **Nome** e **Descrizione**.
3. In "Prezzo": **Ricorrente** → importo → valuta **EUR** → Periodo **Mensile** → Salva.
4. Apri il prodotto appena creato → **+ Aggiungi un altro prezzo** → **Ricorrente** → importo annuale → Periodo **Annuale** → Salva. (Solo per Starter/Pro/Enterprise; Scopri ha solo il mensile a €0.)
5. Su ogni prezzo, clicca i **⋯ → Copia ID del prezzo** (inizia con `price_...`).

## Da consegnare al team tecnico (compila e invia)
| Piano | price ID MENSILE | price ID ANNUALE |
|---|---|---|
| Scopri | `price_________________` | — |
| Starter | `price_________________` | `price_________________` |
| Pro | `price_________________` | `price_________________` |
| Enterprise | `price_________________` | `price_________________` |

(Opzionale ma utile: anche i 4 `prod_...` ID prodotto.)

## Dopo (lo fa il team tecnico)
1. Scrivere questi ID in `subscription_plans` (stripe_price_monthly_id / _yearly_id).
2. Confermare la **chiave Stripe Live** + endpoint **webhook** attivo (eventi: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.*`).
3. Deploy delle 2 edge function aggiornate (`create-checkout-session`, `stripe-webhook`).
4. **Test reale**: parti dal piano Scopri (€0) → il cliente inserisce la carta ma non paga → verifica che l'azienda risulti collegata. Poi un test su un piano economico con importo basso.
