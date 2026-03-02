

# Ottimizzazione Expanded Row (Menu a Linguetta)

## Problemi attuali
1. **Ridondanza**: MRR, Utenti, N. Ordini sono già visibili nelle colonne della tabella — ripeterli nella expanded row spreca spazio
2. **Manca contesto operativo**: nessun conteggio clienti/staff, nessun progresso onboarding, nessuna preview delle note CRM
3. **Azioni ridondanti**: i bottoni "Apri dettaglio" e "Accedi come azienda" duplicano quelli già nella riga
4. **Layout piatto**: tutto ammassato in una griglia uniforme, senza gerarchia visiva

## Ottimizzazione proposta

### Nuova struttura expanded row in 3 sezioni orizzontali:

**Sezione 1 — KPI non ridondanti (solo dati NON già in tabella)**
- Valore Totale ordini (€)
- Ultimo Ordine (con colore salute)
- Clienti registrati (count da health data)
- Staff registrati (count da health data)
- Onboarding % (barra progresso)
- Trend Ordini 6m (sparkline — già presente)

**Sezione 2 — Info aziendali compatte** (invariata, ma in layout più compatto a 4-6 colonne)
- Ragione sociale, P.IVA, Telefono, PEC, SDI, Sito, Scadenza trial

**Sezione 3 — Preview Note CRM + Tags**
- Ultima nota CRM con data/autore (troncata a 2 righe) con link "Vedi tutte"
- Tags inline (riutilizzando CompanyTagsCell)
- Rimuovere i bottoni azione dal fondo (già presenti nella riga principale)

### File modificati
- `src/pages/admin/CompaniesList.tsx` — riscrittura sezione expanded row (linee 550-690)
  - Aggiungere query per `company_notes` (ultima nota per company)
  - Aggiungere query per customer/staff counts (già disponibili in `healthData` via RPC)
  - Rimuovere KPI ridondanti (MRR, Utenti, N. Ordini)
  - Aggiungere barra onboarding % e preview nota
  - Rimuovere bottoni azione duplicati

### Nessun nuovo file, nessuna migrazione DB
Tutti i dati necessari sono già disponibili tramite le query esistenti (`healthData`, `companyTags`, `company_notes`).

