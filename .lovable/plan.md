

# Piano: Ristrutturazione Dettaglio Azienda stile GoHighLevel

## Panoramica

Trasformare la pagina dettaglio azienda (`/admin/aziende/:id`) in un hub completo con navigazione a tab, ispirato a GoHighLevel. Rimuovere la pagina "Abbonamenti" standalone dalla sidebar e integrare tutto nel dettaglio azienda. Aggiornare anche la lista aziende per mostrare stato abbonamento e piano.

---

## Cosa cambia

### 1. Rimuovere "Abbonamenti" dalla sidebar

- Eliminare la voce "Abbonamenti" da `AdminLayout.tsx`
- Rimuovere la route `/admin/abbonamenti` da `App.tsx`
- Il file `Subscriptions.tsx` puo essere eliminato (le sue funzionalita vengono assorbite dal dettaglio azienda e dalla lista aziende)

### 2. Lista Aziende migliorata (`CompaniesList.tsx`)

Trasformare da griglia di card a **tabella** piu informativa (come la lista account di GHL):

| Colonna | Descrizione |
|---------|-------------|
| Azienda | Logo + nome + email |
| Settore | Badge settore |
| Piano | Nome piano attivo |
| Stato | Badge colorato (trial/active/suspended/expired) |
| Scadenza Trial | Data se in trial |
| Creata il | Data creazione |
| Azioni | Bottone "Apri" + dropdown con "Accedi come Admin" |

Aggiungere filtri:
- Ricerca testuale (gia presente)
- Filtro per stato abbonamento (select)

Il click sulla riga o il bottone "Apri" porta al dettaglio azienda.

### 3. Dettaglio Azienda con Tab (`CompanyDetail.tsx`)

Ristrutturare completamente con una **navigazione a tab orizzontale** in alto (come nello screenshot GHL):

```text
[Dettagli di base] [SaaS] [Abbonamento] [Attivita]
```

**Tab "Dettagli di base"** (default):
- Sezione "Account": nome, email, settore, logo (editabili inline)
- Sezione "Informazioni generali": indirizzo, telefono, ecc.
- Form di modifica diretta (senza dover andare su `/modifica`)

**Tab "SaaS"**:
- Piano attuale con dettagli (nome, prezzo, limiti)
- Moduli inclusi nel piano (lista con icone)
- Statistiche utilizzo: ordini usati/totali, utenti usati/totali
- Barre di progresso per i limiti

**Tab "Abbonamento"**:
- Stato attuale con badge colorato
- Azioni: Cambia piano, Sospendi/Riattiva, Estendi trial
- Storico abbonamento (timeline da `subscription_logs`)

**Tab "Attivita"**:
- Statistiche operative (ordini, clienti, ticket)
- Azioni rapide (accedi come admin, visualizza ordini, gestisci ticket)

### 4. Header del dettaglio azienda

- Freccia indietro + Logo + Nome azienda + Badge stato
- Bottoni: "Accedi come Admin" (primario)
- Layout pulito stile GHL

---

## File da Modificare/Eliminare

| File | Azione | Descrizione |
|------|--------|-------------|
| `src/pages/admin/CompanyDetail.tsx` | Riscrivere | Hub a tab completo |
| `src/pages/admin/CompaniesList.tsx` | Riscrivere | Da card grid a tabella con filtri stato |
| `src/components/layouts/AdminLayout.tsx` | Modifica | Rimuovere voce "Abbonamenti" dalla sidebar |
| `src/App.tsx` | Modifica | Rimuovere route `/admin/abbonamenti` |
| `src/pages/admin/Subscriptions.tsx` | Eliminare | Funzionalita assorbita nel dettaglio azienda |
| `src/pages/admin/EditCompany.tsx` | Potenziale rimozione | L'editing sara inline nel tab "Dettagli di base" |

---

## Dettagli Tecnici

### Struttura Tab (usando Radix Tabs)

```text
<Tabs defaultValue="dettagli">
  <TabsList>
    <TabsTrigger value="dettagli">Dettagli di base</TabsTrigger>
    <TabsTrigger value="saas">SaaS</TabsTrigger>
    <TabsTrigger value="abbonamento">Abbonamento</TabsTrigger>
    <TabsTrigger value="attivita">Attivita</TabsTrigger>
  </TabsList>
  <TabsContent value="dettagli">...</TabsContent>
  <TabsContent value="saas">...</TabsContent>
  <TabsContent value="abbonamento">...</TabsContent>
  <TabsContent value="attivita">...</TabsContent>
</Tabs>
```

### Tab "Dettagli di base"
- Form editabile con i campi azienda (nome, email, settore, logo)
- Salvataggio diretto con mutation su `companies`
- Layout a due colonne: form a sinistra, sidebar attivita/note a destra (come GHL)

### Tab "SaaS"
- Query su `subscription_plans` per il piano corrente
- Count ordini e utenti con query aggregate
- Progress bar: `ordini usati / max_ordini` e `utenti / max_utenti`
- Lista moduli con icone e stato (abilitato/disabilitato basato su `included_modules`)

### Tab "Abbonamento"
- Tutte le funzionalita attuali della card abbonamento + storico log
- Dialog cambio piano
- Bottoni sospendi/riattiva/estendi trial

### Tab "Attivita"
- Le 4 card statistiche gia presenti (ordini, clienti, ticket totali, ticket aperti)
- Azioni rapide (accedi pannello, visualizza ordini, gestisci ticket)

### CompaniesList - Da Card a Tabella
- Usare il componente `Table` gia presente
- Join con `subscription_plans` per mostrare il piano
- Filtro stato con `Select`
- Click sulla riga naviga a `/admin/aziende/:id`

