

# Email Marketing - Ottimizzazione Completa

## Stato Attuale

Il modulo e funzionalmente stabile dopo i fix precedenti. L'analisi rivela opportunita di ottimizzazione in 4 aree: performance delle query, logica duplicata, UX mancante e robustezza del codice.

---

## Problemi Identificati

### 1. Performance: Query duplicate tra tab

`EmailStatsTab` e `EmailCampaignsTab` eseguono entrambi una query su `email_campaigns` con query key diverse (`email-campaigns-list` vs `email-campaigns`). Quando l'utente passa da una tab all'altra, vengono fatte 2 richieste separate per gli stessi dati.

**Fix**: Unificare le query key. `EmailStatsTab` usa `["email-campaigns-list", company?.id]` e seleziona solo `id, name, type, sent_at, total_recipients`. Cambiare la query key in `["email-campaigns", company?.id]` e usare i dati dalla cache, evitando una seconda richiesta.

### 2. Bug: Campagne tab - manca paginazione

`EmailCampaignsTab` non ha paginazione (mostra tutte le campagne in una tabella senza limite). `EmailTemplatesTab` invece ha una paginazione completa con "Precedente/Successivo" e selettore "per pagina". Con molte campagne la tabella diventa inutilizzabile.

**Fix**: Aggiungere la stessa paginazione presente in `EmailTemplatesTab` anche a `EmailCampaignsTab`.

### 3. UX: Template menu "Nuovo" - tutte le opzioni fanno la stessa cosa

In `EmailTemplatesTab`, il dropdown "Nuovo" ha 4 opzioni (Modello vuoto, Da campagna esistente, Libreria modelli, Importa HTML) ma tutte eseguono la stessa azione: aprono il dialog vuoto. Questo confonde l'utente.

**Fix**: Rimuovere le opzioni non funzionali (Da campagna, Libreria, Importa HTML) e trasformare il dropdown in un semplice `Button` "Nuovo template". Le opzioni avanzate verranno aggiunte quando saranno implementate.

### 4. UX: Campagne - sidebar non responsive su mobile

La sidebar delle categorie (`w-56 border-r`) non collassa su mobile, comprimendo il contenuto principale in uno spazio troppo stretto.

**Fix**: Nascondere la sidebar su mobile e mostrare le categorie come un `Select` dropdown sopra la tabella. Usare `hidden md:block` sulla sidebar e mostrare il Select solo su mobile.

### 5. Bug: EmailPerformanceChart - metrica selezionata non cambia i dati

Il selettore "Tasso di apertura / Tasso di clic / Tasso di consegna" cambia solo il titolo della card ma mostra sempre gli stessi dati (aperture). Il chart `data` prop non viene ricalcolato in base alla metrica selezionata.

**Fix**: Passare la metrica selezionata come prop al componente padre (`EmailStatsTab`) tramite un callback, oppure calcolare tutti e 3 i set di dati in `EmailStatsTab` e passare quello corretto. Approccio piu semplice: spostare il calcolo dei dati dentro `EmailPerformanceChart` passando i `logs` raw, oppure calcolare 3 dataset in `EmailStatsTab` e passarli tutti.

Soluzione scelta: `EmailStatsTab` calcola 3 dataset (`openRateData`, `clickRateData`, `deliveryRateData`) e li passa tutti a `EmailPerformanceChart`, che seleziona quello corretto in base alla metrica.

### 6. Pulizia: `any` type ovunque

Tutti i dati Supabase sono tipizzati come `any`. Non causa bug runtime ma riduce la sicurezza del codice. Si puo migliorare usando i tipi generati.

**Fix**: Non prioritario. Annotare per un futuro refactoring ma non modificare ora per evitare rischi.

### 7. Bug: CampaignDialog - update sovrascrive `created_by`

Quando si modifica una campagna, il payload include `created_by: user!.id`, sovrascrivendo il creatore originale con l'utente che sta facendo la modifica.

**Fix**: Includere `created_by` solo nell'insert, non nell'update. Separare il payload base (condiviso) dai campi specifici per insert.

### 8. Bug: TemplateDialog - stesso problema con `created_by` su update

Identico al punto 7: l'update sovrascrive `created_by`.

**Fix**: Stesso approccio - includere `created_by` e `company_id` solo nell'insert.

### 9. UX: Nessun feedback di errore sulle mutation di eliminazione

`deleteMutation` in entrambi i tab non ha `onError` handler. Se l'eliminazione fallisce (es. RLS, rete), l'utente non riceve feedback.

**Fix**: Aggiungere `onError: (e) => toast.error(e.message)` alle mutation di eliminazione.

### 10. UX: Campagne - label tipo inconsistente

Nella tabella campagne, `broadcast` viene mostrato come "Email" ma nella sidebar e "Campagne email". Nel dialog e "Campagna Email". Le label dovrebbero essere coerenti in tutto il modulo.

**Fix**: Usare label corte e consistenti nella tabella: "Email", "Flusso", "Blocco" (gia cosi). OK, gia allineato.

---

## Riepilogo Modifiche

| Azione | File | Dettaglio |
|--------|------|-----------|
| Modifica | `EmailStatsTab.tsx` | Unificare query key campagne, calcolare 3 dataset per il chart |
| Modifica | `EmailPerformanceChart.tsx` | Accettare 3 dataset e switchare in base a metrica selezionata |
| Modifica | `EmailCampaignsTab.tsx` | Aggiungere paginazione, sidebar responsive, onError delete |
| Modifica | `EmailTemplatesTab.tsx` | Semplificare menu "Nuovo", onError delete |
| Modifica | `CampaignDialog.tsx` | Separare payload insert/update per non sovrascrivere created_by |
| Modifica | `TemplateDialog.tsx` | Separare payload insert/update per non sovrascrivere created_by |

### Nessuna modifica database

Tutte le ottimizzazioni sono puramente frontend.

