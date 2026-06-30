# Guida Stripe — dove andare per prodotti, abbonamenti, chiavi e webhook

> Guida di navigazione nella dashboard Stripe per chi vende gli abbonamenti EiC.
> NB: Stripe cambia spesso la UI; i nomi delle voci possono variare leggermente.
> Indirizzo dashboard: **https://dashboard.stripe.com**

---

## 1) Accesso e modalità Live / Test
1. Vai su **https://dashboard.stripe.com** e accedi.
2. In **alto a destra** c'è l'interruttore **"Modalità test"**.
   - **Spento = LIVE** (soldi veri). ← questo per vendere davvero.
   - **Acceso = Test** (carte finte, nessun addebito reale). ← per provare il flusso.
3. **Regola d'oro:** i prodotti/prezzi creati in Test NON esistono in Live (e viceversa). Crea quelli definitivi in **LIVE**.

---

## 2) Creare i PRODOTTI e i PREZZI (abbonamenti)
Menù a sinistra: **Catalogo prodotti** → **Prodotti** (in alcune versioni solo "Prodotti").

Per ogni piano:
1. Bottone **"+ Crea prodotto"** (in alto a destra).
2. **Nome** e **Descrizione** (vedi `docs/stripe-prezzi-da-creare.md`).
3. Sezione prezzo:
   - Tipo: **Ricorrente** (NON "Una tantum").
   - **Importo** + valuta **EUR**.
   - **Periodo di fatturazione**: **Mensile** (o Annuale).
4. **Salva prodotto**.
5. Per aggiungere il prezzo annuale allo stesso prodotto: apri il prodotto → riquadro **Prezzi** → **"+ Aggiungi un altro prezzo"** → Ricorrente → importo annuale → periodo **Annuale**.
6. Copia gli **ID prezzo**: su ogni prezzo, menù **⋯ → Copia ID del prezzo** (`price_...`).

> L'abbonamento NON si crea a mano: lo crea Stripe in automatico quando il cliente paga dal link di Checkout. Tu crei solo prodotti + prezzi.

---

## 3) Dove vedere/gestire gli ABBONAMENTI attivi
Menù a sinistra: **Abbonamenti** (a volte sotto "Fatturazione" → "Abbonamenti").
- Qui vedi tutti gli abbonamenti attivi, in prova, scaduti, annullati.
- Cliccando un abbonamento puoi: cambiare piano, annullare, vedere le fatture, vedere la **carta** usata e i prossimi rinnovi.

## 4) Dove vedere i CLIENTI e le loro carte
Menù a sinistra: **Clienti**.
- Ogni cliente (azienda) ha il suo profilo con: abbonamenti, fatture, **metodi di pagamento** (carte) e quale è quella **predefinita** (è quella che Stripe addebita ai rinnovi).

---

## 5) Chiavi API (servono al team tecnico)
1. In alto a destra: **Sviluppatori** (o icona ingranaggio → "Sviluppatori"). In alcune versioni: menù utente → **"Chiavi API"**.
2. Voce **"Chiavi API"**.
3. Servono due valori, in **modalità LIVE**:
   - **Chiave pubblicabile** (`pk_live_...`) — non segreta.
   - **Chiave segreta** (`sk_live_...`) — **segreta!** Si rivela una volta sola; va messa nei secret di Supabase (`STRIPE_SECRET_KEY`).
> ⚠️ La chiave segreta non va incollata in chat né nel codice: la imposta il team tecnico nei secret. Se è stata creata in Test (`sk_test_...`), i pagamenti sono finti.

---

## 6) Webhook (fa sapere all'app quando un cliente paga / rinnova)
1. **Sviluppatori** → **Webhook** → **"+ Aggiungi endpoint"**.
2. **URL endpoint:** l'indirizzo della edge function `stripe-webhook` su Supabase, del tipo:
   `https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/stripe-webhook`
3. **Eventi da ascoltare** (selezionali):
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Salva → Stripe mostra il **"Signing secret"** (`whsec_...`): va messo nei secret Supabase (`STRIPE_WEBHOOK_SECRET`). Anche questo lo fa il team tecnico.

---

## 7) (Opzionale) IVA — Stripe Tax
Se vuoi che l'IVA sia calcolata/aggiunta in automatico:
- Menù **Impostazioni** → **Tax** (Stripe Tax) → attiva e configura il paese (Italia, 22%).
- In alternativa, più semplice all'inizio: lasci i prezzi "IVA inclusa" e la fattura la fai dal gestionale.

---

## 8) Provare prima di andare live (consigliato)
1. Metti la dashboard in **Modalità test**.
2. Crea gli stessi prodotti in Test (o usane uno di prova).
3. Genera il link dal gestionale e paga con una **carta di test** Stripe: `4242 4242 4242 4242`, scadenza futura qualunque, CVC qualunque.
4. Verifica che: l'abbonamento compaia in **Abbonamenti**, il cliente in **Clienti** con la carta predefinita, e nel gestionale l'azienda risulti **attiva**.
5. Quando funziona, ripeti in **LIVE** con i prodotti definitivi.

---

## Riepilogo "dove clicco"
| Cosa | Dove |
|---|---|
| Live/Test | interruttore in alto a destra |
| Creare prodotti/prezzi | **Catalogo prodotti → Prodotti → + Crea prodotto** |
| Vedere abbonamenti | **Abbonamenti** |
| Vedere clienti e carte | **Clienti** |
| Chiavi API | **Sviluppatori → Chiavi API** |
| Webhook | **Sviluppatori → Webhook → + Aggiungi endpoint** |
| IVA | **Impostazioni → Tax** |
