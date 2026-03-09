

## Piano: Integrare Report Fatture come tab dentro Fatturazione

### Analisi attuale
- `InvoicesList.tsx` è la pagina `/azienda/fatturazione` — contiene header, KPI, filtri per status (Tabs usati come filtro), e tabella fatture.
- `BillingReports.tsx` è una pagina standalone a `/azienda/report-fatturazione` con proprio header, KPI, grafici e aging report.
- La sidebar ha una voce separata "Report Fatture" che punta a `/azienda/report-fatturazione`.

### Approccio
Aggiungere un sistema di tab di primo livello nella pagina Fatturazione ("Fatture" e "Report") e spostare il contenuto di BillingReports come seconda tab.

### Modifiche

**1. `src/pages/azienda/billing/InvoicesList.tsx`**
- Aggiungere uno state `activeView` (`"fatture"` | `"report"`) con Tabs di primo livello sotto l'header.
- Wrappare il contenuto attuale (KPI + filtri + tabella) dentro `TabsContent value="fatture"`.
- Importare `BillingReports` e renderizzarlo dentro `TabsContent value="report"`.
- Il BillingReports renderizzato come tab non deve mostrare il suo header (titolo + icona) perché è già nel contesto della pagina Fatturazione.

**2. `src/pages/azienda/billing/BillingReports.tsx`**
- Aggiungere una prop opzionale `embedded?: boolean`.
- Quando `embedded=true`, nascondere il blocco header (titolo + icona BarChart3) per evitare duplicazione, mostrando solo il selettore anno, export CSV e il contenuto.

**3. `src/lib/sidebarConfig.ts`**
- Rimuovere la voce "Report Fatture" dalla sidebar (riga 75).

**4. `src/App.tsx`**
- Rimuovere la route standalone `report-fatturazione` (riga 315).

