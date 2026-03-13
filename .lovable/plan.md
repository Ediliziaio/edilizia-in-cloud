

## Piano: UX Unificata con URL Query Params e Redirect Route

### Situazione attuale

`DocumentiFiscaliList.tsx` ha gia tutti i tab funzionanti con la stessa tabella. I problemi sono:
1. La navigazione tab usa `useState` — i link diretti e il back button non funzionano
2. Le route standalone (`/documenti/ddt`, `/documenti/proforma`, `/documenti/note-credito`) caricano componenti separati con UX diversa
3. Le colonne della tabella sono identiche per tutti i tipi — mancano colonne specifiche (es. "Storna Fattura" per NC, "Fatturato" badge per DDT)

### Modifiche

**File 1: `src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx`**
- Sostituire `useState("fatture")` con `useSearchParams` per leggere/scrivere `?tipo=`
- Il default resta `fattura`; `handleTabChange` usa `setSearchParams`
- Aggiungere colonne condizionali per tipo:
  - **DDT**: colonna "Stato fatturazione" (badge Da fatturare / Fatturato) + azione "Fattura da DDT"
  - **NC**: colonna "Storna Fattura" con link al documento origine
  - **Preventivi**: colonna "Valido fino al" + azione "Converti in Fattura" + "Segna accettato"
- Empty state personalizzato per tipo (titolo e descrizione diversi)

**File 2: `src/routes/companyRoutes.tsx`**
- Sostituire le 3 route standalone con `<Navigate>` redirect:
  - `documenti/ddt` → `<Navigate to="/azienda/documenti?tipo=ddt" replace />`
  - `documenti/proforma` → `<Navigate to="/azienda/documenti?tipo=proforma" replace />`
  - `documenti/note-credito` → `<Navigate to="/azienda/documenti?tipo=nota_credito" replace />`
  - `documenti/preventivi/pipeline` → `<Navigate to="/azienda/documenti?tipo=preventivo" replace />`
- Rimuovere gli import di `DDTList`, `PipelinePreventivi`, `NoteCreditoList`

### Non serve creare `DocumentiListShell`

Il componente `DocumentiFiscaliList.tsx` fa gia da shell. Estrarlo in un componente separato aggiungerebbe complessita senza beneficio reale — il file e gia ben strutturato con timeline + tabs + filtri + tabella + footer. Bastano le modifiche inline per aggiungere colonne condizionali e URL params.

### Dettaglio colonne condizionali

```
if tipo === "nota_credito":
  inserire colonna "Storna Fattura" dopo "Cliente"
  → mostra link a doc.documento_origine_id

if tipo === "ddt":
  colonna "Stato" mostra badge DDT (fatturato/da fatturare) invece di StatoBadge
  colonna "Fattura collegata" dopo "Scadenza"

if tipo === "preventivo":
  colonna "Scadenza" diventa "Valido fino al"
  azioni extra: "Segna accettato", "Converti in Fattura"
```

