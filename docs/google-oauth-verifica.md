# Verifica dell'app OAuth Google — Edilizia in Cloud

Obiettivo: far sparire la schermata «Google non ha verificato questa app» quando un cliente collega
Google Calendar, Google Ads o Google Business Profile.

Progetto Google Cloud principale: **edilizia-in-cloud** (numero 232959366283). Al 15/09/2026 ci
stanno tutti e quattro i collegamenti: Gmail, Calendar, Google Ads, Business Profile. Controllato
leggendo i link di consenso reali generati dall'app.

## Decisione presa: Gmail in un progetto separato

Google verifica il **progetto**, non il singolo collegamento. Gli scope Gmail (`gmail.readonly`,
`gmail.modify`, `gmail.send`) sono **restricted**: con quelli dentro servirebbe anche la valutazione di
sicurezza CASA di un laboratorio esterno, a pagamento e da rinnovare ogni anno. Calendar, Ads e
Business Profile sono solo **sensitive**: verifica gratuita.

Quindi Gmail esce dal progetto principale e va in uno suo, che **non** si manda in verifica. Chi
collega Gmail continua a vedere l'avviso, fino a 100 utenti. Oggi le caselle Gmail collegate stanno
tutte su Demo Azienda: una attiva, `f.andriciuc@overthemol.com`, e due scadute. Nessun cliente vero
usa Gmail via Google; chi vuole Gmail senza avviso può collegarlo come casella IMAP con una password
per le app.

## Cosa è già pronto nel codice

1. **Privacy policy**, sezione 15 «Dati degli account Google»: dati letti per ogni collegamento, uso
   dell'AI senza addestramento, cosa non si fa, revoca, dichiarazione Limited Use in inglese.
   https://www.ediliziaincloud.com/privacy-policy/#dati-account-google
2. **Ritorno da Google sul nostro dominio.** Calendar, Ads e Business Profile tornavano su
   `rsbrguhkodgnqfomrevo.supabase.co`, un dominio che non possiamo verificare. Ora possono tornare su
   `app.ediliziaincloud.com/oauth/...`. Il cambio è **spento** finché non si fa il passo 7.
3. **Credenziali proprie per Gmail**: `GOOGLE_GMAIL_CLIENT_ID` e `GOOGLE_GMAIL_CLIENT_SECRET`.
   Finché mancano, Gmail usa quelle di sempre.

## Procedura, in ordine

### A. Spostare Gmail

1. **Crea un nuovo progetto** su Google Cloud, per esempio «edilizia-in-cloud-gmail».
2. **Abilita la Gmail API** nel progetto nuovo.
3. **Schermata di consenso** del progetto nuovo: tipo Esterno, nome «Edilizia in Cloud», stesso logo,
   stessa privacy e termini. Pubblicala **in produzione**, non lasciarla in test: in test i
   collegamenti scadono dopo 7 giorni. **Non inviarla per la verifica.**
4. **Scope** del progetto nuovo: `gmail.readonly`, `gmail.send`, `userinfo.email`. `gmail.modify` non
   serve alla posta: lo usa solo il riscaldamento delle caselle outreach collegate via Google, e oggi
   non ce n'è nessuna.
5. **Crea un client OAuth** di tipo «Applicazione web» con questi indirizzi di reindirizzamento:
   - `https://admin.ediliziaincloud.com/admin/impostazioni/integrazioni/email-callback`
   - `https://app.ediliziaincloud.com/admin/impostazioni/integrazioni/email-callback`
   - `https://app.ediliziaincloud.com/azienda/impostazioni/integrazioni/email-callback`
6. **Su Supabase**, nei segreti delle Edge Functions, aggiungi `GOOGLE_GMAIL_CLIENT_ID` e
   `GOOGLE_GMAIL_CLIENT_SECRET` con i valori del client appena creato. **Non toccare**
   `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET`: le usa anche Google Ads.
7. **Ricollega** la casella `f.andriciuc@overthemol.com` dalla posta dell'app: il vecchio collegamento
   non si può rinnovare con il client nuovo.
8. **Nel progetto principale**, scheda «Accesso ai dati»: togli `gmail.readonly`, `gmail.modify` e
   `gmail.send`.

### B. Ritorno sul nostro dominio

1. **Search Console:** verifica la proprietà del dominio `ediliziaincloud.com` con lo stesso account
   Google proprietario del progetto principale.
2. **Client OAuth** di Calendar, Ads e Business Profile: **aggiungi** questi indirizzi di
   reindirizzamento, senza togliere i vecchi:
   - `https://app.ediliziaincloud.com/oauth/google-calendar-auth?action=callback`
   - `https://app.ediliziaincloud.com/oauth/google-ads-oauth?action=callback`
   - `https://app.ediliziaincloud.com/oauth/gbp-oauth?action=callback`
3. **Accendi il cambio**: in `platform_settings` la chiave `google_oauth_callback_base` con valore
   `https://app.ediliziaincloud.com/oauth`.
4. **Prova** un collegamento di Calendar, Ads e Business Profile dall'app.
5. **Togli** dai client i vecchi indirizzi su `supabase.co`.

I collegamenti già attivi non si interrompono: l'indirizzo di ritorno serve solo a chi collega un
account nuovo.

### C. Invio della richiesta

Schermata di consenso del progetto principale, poi «Invia per la verifica». Dati e testi qui sotto.

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

## Tempi indicativi

La verifica del marchio, cioè nome, logo e dominio, richiede di solito pochi giorni lavorativi. Quella
degli scope sensitive qualche settimana. Google può scrivere all'email di assistenza per chiedere
chiarimenti o un video nuovo: conviene tenerla d'occhio.
