# Revisione app Meta — permessi sulle pagine (21/10/2026)

Perché: `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` e
`business_management` sono in «Pronta per il test» (solo chi ha un ruolo
nell'app li riceve) e `ads_read` è stato rifiutato. Un cliente che collega il
suo Facebook (Dimora Torino, Gigi Borgato) riceve solo `ads_management` e
`leads_retrieval`: niente pagine, niente Business Manager.

## Cosa fare, in ordine

### 0. Prima di iniziare (una volta)
- **Utente di prova per Meta.** I revisori entrano nell'app: crea un'azienda di
  prova (o usa Demo 2) con un utente amministratore apposta, email e password
  che darai nelle «Istruzioni per i revisori». L'utente deve vedere
  Impostazioni → Integrazioni → Facebook e Instagram.
- **Una pagina Facebook e un account pubblicitario di prova** collegati al tuo
  Business Manager, con almeno un modulo lead (anche di prova, dallo strumento
  «Lead Ads Testing» di Meta) e una campagna, anche in pausa.
- **Verifica dell'azienda** in Business Manager: deve essere «Verificata».
  Senza, l'accesso avanzato non si ottiene.
- **Informativa privacy e termini** raggiungibili dall'app (Impostazioni app →
  Di base): URL pubblico, nessun login richiesto.

### 1. Registra UN video (va bene per tutti e 5 i permessi)
Schermo intero, in inglese o con sottotitoli inglesi, 3-5 minuti. Si vede:
1. Login in Edilizia in Cloud con l'utente di prova.
2. Impostazioni → Integrazioni → **Facebook e Instagram** → **Collega**.
3. Finestra di Facebook: si vedono i permessi chiesti, si lasciano tutti
   selezionati, **Continua**.
4. Di nuovo nell'app: elenco dei **Business Manager** dell'utente → se ne
   sceglie uno (business_management).
5. Elenco delle **pagine** → se ne sceglie una (pages_show_list).
6. Elenco degli **account pubblicitari** → se ne sceglie uno.
7. Elenco dei **moduli lead** della pagina → se ne attiva uno; si vede che la
   pagina viene iscritta agli aggiornamenti in tempo reale (pages_manage_metadata).
8. Si invia un lead di prova con «Lead Ads Testing» → dopo pochi secondi il
   contatto compare in Marketing → Contatti CRM (leads_retrieval + webhook).
9. Marketing → **Social**: si vedono i post recenti della pagina con mi piace,
   commenti e condivisioni (pages_read_engagement).
10. Marketing → **Pubblicità**: si vedono campagne, spesa, risultati e costo per
    lead dell'account (ads_read).

### 2. Su developers.facebook.com
App «Edilizia in Cloud» → **Casi d'uso** → caso d'uso → **Personalizza** →
per ognuno dei 5 permessi: **Azioni → Aggiungi all'analisi dell'app**.
Poi in alto **Revisione app → Richieste** → compila per ogni permesso il testo
qui sotto (incolla l'inglese) e carica il video → **Invia per la revisione**.

Nelle **Istruzioni per i revisori** (una volta per la richiesta) incolla il
testo «Reviewer instructions» in fondo, con email e password dell'utente di prova.

---

## pages_show_list

**How will your app use this permission?**
Edilizia in Cloud is a management software (CRM + project management) for
Italian construction and renovation companies. Each company connects its own
Facebook account so that leads from its Lead Ads arrive in its CRM. After
login, we call `GET /me/accounts` and `GET /{business-id}/owned_pages` to show
the user the list of Pages they manage, so they can choose which Page to
connect to their company account. Without this permission the user cannot see
or select any Page, and the integration cannot be set up.

**Where in the app:** Settings → Integrations → Facebook and Instagram →
Connect → step «Choose your Page».

## business_management

**How will your app use this permission?**
Most of our customers manage their Pages and ad accounts through a Business
Manager, often shared with their marketing agency. We call `GET /me/businesses`
and then `GET /{business-id}/owned_pages` and
`GET /{business-id}/owned_ad_accounts` so the user can choose the Business
Manager that owns the company's Page and ad account. We only read the list of
businesses and their assets; we do not create or modify anything in Business
Manager.

**Where in the app:** Settings → Integrations → Facebook and Instagram →
Connect → step «Choose your Business Manager».

## pages_manage_metadata

**How will your app use this permission?**
We subscribe the Page the user selected to our app's `leadgen` webhook with
`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`. When someone fills
in a Lead Ad form, Meta notifies us in real time and the lead is created
immediately in the company's CRM, so the sales team can call back within
minutes. Without this permission the subscription is not effective and leads
arrive with a long delay. We do not change any other Page setting.

**Where in the app:** Settings → Integrations → Facebook and Instagram →
step «Lead forms» → Activate. The new lead then appears in Marketing →
CRM Contacts.

## pages_read_engagement

**How will your app use this permission?**
We read the Page's basic information (name, picture, Instagram business
account) needed to show the connected Page, and the list of the Page's lead
forms. In the Social section we read the Page's recent posts with likes,
comments and shares (`GET /{page-id}/posts` with engagement fields), so the
company owner can see how their content performs next to the leads it
generates. Data is shown only to users of the same company and is not shared
with third parties.

**Where in the app:** Marketing → Social (recent posts and engagement);
Settings → Integrations → Facebook and Instagram (connected Page and its
lead forms).

## ads_read  (era stato rifiutato: video e testo devono mostrare l'uso VERO)

**How will your app use this permission?**
We read campaign performance for the company's own ad account selected during
setup: `GET /{ad-account-id}/insights` with spend, impressions, clicks, leads
and cost per lead, by campaign and by day. In Marketing → Advertising the
owner sees how much each campaign spent and how many leads and signed
contracts it brought, because we match Meta leads with the deals closed in
our CRM. This lets a small construction company decide which campaigns to
keep. We only read insights of ad accounts the user explicitly selected; we
never read other accounts.

**Where in the app:** Marketing → Advertising (campaign list with spend,
results, cost per lead) and Marketing → Reports.

**Nota per il video di ads_read:** si devono vedere i numeri presi da Meta
(spesa, impression, lead) sullo schermo dell'app, non solo la lista delle
campagne. Il rifiuto di solito arriva quando il video non mostra dove si
vedono i dati letti.

---

## Reviewer instructions

1. Open https://ediliziaincloud.it and log in with
   Email: `<email utente di prova>` — Password: `<password>`.
2. Go to Settings → Integrations → Facebook and Instagram → Connect, and log in
   with your Facebook test user. Keep all permissions selected.
3. Choose the Business Manager, the Page and the ad account, then activate a
   lead form in the «Lead forms» step.
4. Send a test lead with the Lead Ads Testing tool
   (https://developers.facebook.com/tools/lead-ads-testing): it appears in
   Marketing → CRM Contacts within a few seconds.
5. Marketing → Social shows the Page's recent posts and engagement;
   Marketing → Advertising shows the ad account's campaign insights.
The screencast attached to each permission shows the same steps.
