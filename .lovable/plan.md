

## Piano: Ristrutturazione Sidebar Finanza, Rinomina e Note di Credito

### Analisi completata

- **DB**: La tabella `documenti_fiscali` ha già `nota_credito` e `proforma` nel CHECK constraint e la colonna `documento_correlato_id`. Nessuna migrazione necessaria.
- **Types**: `src/types/fatturazione.ts` ha già `nota_credito` e `proforma` nel type `TipoDocumento`.
- **Logica NC**: `src/lib/fatturazione/noteCredito.ts` esiste già con `creaNotaCredito` e `applicaStornoSuFattura`.

### Modifiche

#### 1. `src/lib/sidebarConfig.ts`
- Aggiungere `groupLabel?: string` all'interfaccia `NavItem`
- Rinominare items in `area_finanza`: "Documenti Fiscali" → "Fatture", "Preventivi Fiscali" → "Proforma" (nuovo URL `/azienda/documenti/proforma`)
- Aggiungere item "Note di Credito" (`/azienda/documenti/note-credito`, icona `FileX2`)
- Aggiungere `groupLabel: "Fatturazione e Documenti"` al primo item billing_native e al primo item billing_external
- Aggiungere `groupLabel: "Contabilità"` a "Prima Nota"
- Import nuove icone: `FileClock`, `FileX2`

#### 2. `src/components/layouts/CompanyLayout.tsx`
- Modificare `MacroAreaCollapsible` (expanded mode) per raggruppare gli item per `groupLabel` e renderizzare separatori visivi (etichetta uppercase con bordo) prima di ogni gruppo
- Stessa logica per il flyout HoverCard (collapsed mode)

#### 3. `src/routes/companyRoutes.tsx`
- Aggiungere lazy import per `NoteCreditoList` e `ProformaPage`
- Aggiungere route `documenti/note-credito` con `BillingModeGuard`
- Aggiungere route `documenti/proforma` con `BillingModeGuard`
- Redirect `documenti/preventivi/pipeline` → `documenti/proforma`

#### 4. Nuove pagine stub
- `src/pages/azienda/fatturazione/NoteCreditoList.tsx` — lista vuota con CTA "Nuova Nota di Credito"
- `src/pages/azienda/fatturazione/ProformaPage.tsx` — wrapper che riutilizza `PipelinePreventivi` filtrando per tipo `proforma`/`preventivo`

#### 5. Nessuna migrazione DB necessaria
Il tipo `nota_credito`, `proforma` e la colonna `documento_correlato_id` sono già presenti nello schema.

### Risultato sidebar Finanza (billing_native attivo)

```text
▼ 💰 Finanza
   ─── FATTURAZIONE E DOCUMENTI ──────
   📄 Fatture
   🕐 Proforma
   ❌ Note di Credito
   🚛 DDT
   👤 Anagrafica Fiscale
   💰 Registro Incassi
   🗃 Cassetto SDI
   📊 Report Fiscali
   ─── CONTABILITÀ ───────────────────
   📖 Prima Nota
   🏦 Tesoreria
   📉 Costi
   📈 Previsionale
```

