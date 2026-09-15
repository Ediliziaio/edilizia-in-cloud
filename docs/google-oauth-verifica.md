# Verifica dell'app OAuth Google — Edilizia in Cloud

Progetto Google Cloud: **edilizia-in-cloud** (numero 232959366283).
Tutti e quattro i collegamenti Google stanno in questo progetto: Gmail, Calendar, Google Ads, Business Profile.
Controllato il 15/09/2026 leggendo i link di consenso reali generati dall'app.

## Decisione da prendere prima di inviare

Google verifica il **progetto**, non il singolo collegamento. Nel progetto ci sono gli scope Gmail
`gmail.readonly`, `gmail.modify`, `gmail.send`, che Google classifica **restricted**: con quelli dentro
serve anche la **valutazione di sicurezza CASA** di un laboratorio esterno, a pagamento e da rinnovare
ogni anno. Calendar, Ads e Business Profile sono solo **sensitive**: verifica gratuita.

Uso reale al 15/09/2026: Gmail collegato 1 casella attiva e 2 scadute; Calendar 5; Ads 1; Business Profile 1.

- **Consigliato:** spostare il client Gmail in un progetto Google Cloud separato, lasciato non
  verificato, e verificare questo progetto solo con Calendar, Ads e Business Profile. Gmail continua a
  funzionare fino a 100 utenti con l'avviso «app non verificata». Chi vuole Gmail senza avviso può
  collegarlo via IMAP con password per le app, già supportato.
- **In alternativa:** tenere Gmail qui e affrontare la valutazione CASA.

Finché gli scope Gmail restano nella scheda «Accesso ai dati» di questo progetto, la richiesta li
include.

## Cosa è già pronto nel codice

1. **Privacy policy**, sezione 15 «Dati degli account Google»: dati letti per ogni scope, uso dell'AI,
   cosa non si fa, revoca, e la dichiarazione Limited Use in inglese.
   Indirizzo: https://www.ediliziaincloud.com/privacy-policy/#dati-account-google
2. **Ritorno da Google sul nostro dominio.** Calendar, Ads e Business Profile tornavano su
   `rsbrguhkodgnqfomrevo.supabase.co`, un dominio che non possiamo verificare: la richiesta verrebbe
   respinta. Ora possono tornare su `app.ediliziaincloud.com/oauth/...`. Il cambio è **spento** finché
   non si segue la procedura qui sotto.

## Procedura, in ordine

1. **Search Console:** verifica la proprietà del dominio `ediliziaincloud.com` con lo stesso account
   Google proprietario del progetto Cloud.
2. **Console Google Cloud → Client OAuth** di Calendar, Ads e Business Profile: **aggiungi** questi
   indirizzi di reindirizzamento autorizzati, senza togliere i vecchi:
   - `https://app.ediliziaincloud.com/oauth/google-calendar-auth?action=callback`
   - `https://app.ediliziaincloud.com/oauth/google-ads-oauth?action=callback`
   - `https://app.ediliziaincloud.com/oauth/gbp-oauth?action=callback`
3. **Accendi il cambio**, dopo il deploy del codice: in `platform_settings` la chiave
   `google_oauth_callback_base` con valore `https://app.ediliziaincloud.com/oauth`.
4. **Prova** un collegamento di Calendar, Ads e Business Profile dall'app.
5. **Togli** dai client i vecchi indirizzi su `supabase.co`.
6. **Schermata di consenso**, i dati da inserire sono qui sotto. Poi «Invia per la verifica».

I collegamenti già attivi non si interrompono: l'indirizzo di ritorno serve solo quando qualcuno
collega un account nuovo.

## Dati per la schermata di consenso

| Campo | Valore |
|---|---|
| Nome app | Edilizia in Cloud |
| Email assistenza | un indirizzo del dominio, per esempio supporto@ediliziaincloud.com |
| Home page | https://www.ediliziaincloud.com/ |
| Privacy policy | https://www.ediliziaincloud.com/privacy-policy/ |
| Termini di servizio | https://www.ediliziaincloud.com/termini-e-condizioni/ |
| Domini autorizzati | ediliziaincloud.com |
| Logo | 120×120 px, lo stesso che si vede sul sito |

La home page collega già privacy e termini: Google lo controlla.

## Giustificazioni degli scope, da incollare in inglese

**calendar.readonly** — Edilizia in Cloud is a management platform for Italian construction
companies. When a user connects Google Calendar, we read their existing events only to show busy
times and avoid booking customer appointments or site visits that overlap with them.

**calendar.events** — Appointments and site visits created in Edilizia in Cloud are written to the
user's Google Calendar as events, and updated or deleted when the appointment changes, so the
user's calendar always matches their schedule in the app. We only create, edit or delete events
that our app created.

**adwords** — Users connect their own Google Ads account to see campaigns, spend and results inside
the CRM, next to the leads those campaigns produced, and to send offline conversions (deals marked
as won in the CRM) back to Google Ads so they can measure return on ad spend.

**business.manage** — Users connect their Google Business Profile to read the reviews of their
business in one place and to publish the replies they write or approve in the app.

**openid, email, profile** — Used only to show which Google account is connected.

Solo se Gmail resta nel progetto:

**gmail.readonly** — Users connect their business mailbox to read customer emails inside the CRM,
linked to the right customer, quote or job. Message content may be processed by AI providers only
to classify messages, summarize them and draft replies that the user reviews; it is never used to
train AI models.

**gmail.modify — da togliere, non giustificabile.** L'app lo chiede ma la posta non lo usa: legge lo
stato letto da `gmail.readonly` e non cambia mai etichette né sposta messaggi. Nel codice lo usa solo il
riscaldamento delle caselle outreach collegate via OAuth (`_shared/outreachWarmupEngage.ts`), e al
15/09/2026 non ce n'è nessuna. Google respinge le richieste con scope in eccesso: se Gmail resta nel
progetto, prima va tolto da `email-oauth-start` e dalla scheda «Accesso ai dati».

**gmail.send** — Users send replies and quotes to their customers from their own mailbox, directly
from the CRM. Emails are sent only when the user writes or approves them.

## Video dimostrativo

Google chiede un video, anche non in elenco su YouTube, in inglese o con sottotitoli. Deve mostrare:

1. la pagina di accesso di Edilizia in Cloud e l'indirizzo nella barra del browser;
2. il clic su «Collega Google Calendar» e la schermata di consenso di Google, con il **nome dell'app**
   e il **client ID** visibili nella barra degli indirizzi;
3. l'autorizzazione e il ritorno nell'app;
4. l'uso di ogni scope: gli impegni occupati che bloccano un orario, e un appuntamento creato in app
   che compare su Google Calendar;
5. lo stesso giro per Google Ads, con campagne e risultati nel CRM, e per Business Profile, con una
   recensione e la risposta pubblicata;
6. lo scollegamento dalle impostazioni.
