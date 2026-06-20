# Simulatore Contratti — Design

**Data:** 2026-06-20
**Stato:** approvato (design), in implementazione

## Obiettivo

Nuova sezione azienda **"Simulatore"** in *Marketing & Vendita*: il sostituto del foglio Excel che il commerciale/titolare usa per **simulare contratti edili** prima di impegnarsi. Mostra in tempo reale **margine azienda** (costi/ricavi/utile) **e offerta cliente** (prezzo finale, scenari IVA, rata da tabelle finanziarie). Bello, veloce, completamente editabile.

## Non-goal (cosa NON è)

- **Non è il preventivatore** (`quotes`/`quote_items`, QuoteBuilder): quello produce un documento cliente (PDF/firma → commessa). Il simulatore è uno strumento interno di what-if; può però **generare** un preventivo o una commessa con 1 click.
- **Non è il "Simulatore ROI"** (`RoiSimulator.tsx`, ROI dell'abbonamento EiC): solo omonimia.
- Niente firma, invio, stati documentali. È una sandbox numerica.

## Posizionamento

- **Sidebar** `src/lib/sidebarConfig.ts` (area `area_marketing`): voce `{ title: "Simulatore", url: "/azienda/marketing/simulatore", icon: Calculator, permissionKey: "canViewMarketingOpportunities", featureKey: "simulatore" }`.
- **Rotte** `src/routes/companyRoutes.tsx`: `simulatore` (lista) + `simulatore/:id` (banco) sotto `/azienda/marketing/`.
- **Permessi**: riuso `canViewMarketingOpportunities` / `canEditMarketingOpportunities` (stesso gate del preventivatore).

## Architettura — 3 strati

1. **Motore puro** `src/lib/simulatore/` (TS puro, no React/Supabase, testato vitest). Contiene tipi + tutto il calcolo. È il cuore.
2. **Dati** `src/hooks/useSimulazioni.ts` (react-query, pattern `useTariffaVarianti`). Riusa `useTabelleFinanziamentoAttive`/`useTabellaFinanziamentoRighe` (finanziamenti) e gli hook listino (`tariffe_aziendali`) + prezzari (`usePrezzarioVociGlobalSearch`).
3. **UI** `src/pages/azienda/marketing/simulatore/` (lista + banco) + componenti in `src/components/marketing/simulatore/`.

## Modello dati

Una tabella, stile "documento" (apri/modifica/salva tutto insieme). Migrazione `supabase/migrations/<ts>_simulatore_contratti.sql`.

```sql
CREATE TABLE public.simulazioni (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  contact_id uuid REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza','finalizzata','archiviata')),
  is_template boolean NOT NULL DEFAULT false,
  -- riepilogo denormalizzato (per la lista, niente parse JSON):
  costo_totale numeric(14,2) DEFAULT 0,
  ricavo_imponibile numeric(14,2) DEFAULT 0,
  margine_valore numeric(14,2) DEFAULT 0,
  margine_pct numeric(6,2) DEFAULT 0,
  iva_totale numeric(14,2) DEFAULT 0,
  prezzo_cliente numeric(14,2) DEFAULT 0,
  rata_mensile numeric(12,2),
  -- contenuto editabile:
  voci jsonb NOT NULL DEFAULT '[]'::jsonb,
  fasi jsonb NOT NULL DEFAULT '[]'::jsonb,
  scenari jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.simulazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simulazioni_company" ON public.simulazioni FOR ALL
  USING (company_id = public.get_my_company_id());
CREATE POLICY "simulazioni_sa" ON public.simulazioni FOR ALL
  USING (public.is_super_admin());
CREATE INDEX simulazioni_company_idx ON public.simulazioni(company_id, updated_at DESC);
```

### Shape JSONB (definiti in `src/lib/simulatore/tipi.ts`)

```ts
interface VoceSim {
  id: string;                  // uuid client-side
  fase_id: string | null;      // raggruppamento per fase
  descrizione: string;
  fonte: 'listino' | 'prezzario' | 'libera';
  riferimento_id: string | null;  // tariffa_id o prezzario_voce_id
  codice: string | null;
  quantita: number;
  unita: string;               // mq, ml, mc, h, pz, a_corpo…
  costo_unitario: number;      // costo azienda
  ricarico_pct: number;        // markup
  prezzo_unitario: number;     // = costo × (1+ricarico/100), override possibile
  vat_rate: 4 | 10 | 22 | 0;   // aliquota per riga
  bene_significativo: boolean; // IVA mista: split 10/22
  valore_posa_associata: number | null; // per lo split beni significativi
  is_manodopera: boolean;
  ordine: number;
}
interface FaseSim {
  id: string; nome: string; ordine: number;
  durata_settimane: number; inizio_offset_settimane: number;
  giorni_uomo: number; note: string | null;
}
interface ScenariConfig {
  iva_mode: 'singola' | 'mista';
  iva_rate_singola: 4 | 10 | 22;          // se singola
  iva_confronto: number[];                 // aliquote mostrate affiancate (default [4,10,22])
  finanziamento: {
    tabella_id: string | null;             // eic_tabelle_finanziamento
    importo_finanziato: number;            // default = prezzo_cliente − anticipo
    numero_rate: number;                   // 12/24/36/…
    anticipo: number;
  } | null;
}
```

## Motore di calcolo `src/lib/simulatore/calcoli.ts` (puro, testato)

- `calcolaVoce(v)` → `{ imponibile_costo, imponibile_ricavo, margine }` (qty × costo / prezzo).
- `calcolaTotali(voci)` → `{ costo_totale, ricavo_imponibile, margine_valore, margine_pct }`.
- `calcolaIva(voci, scenari)`:
  - **singola**: tutto l'imponibile a `iva_rate_singola`.
  - **mista 10/22**: somma per `vat_rate` di riga. Per le righe `bene_significativo`: applica la regola ristrutturazione → `imponibile_10 = posa + min(valore_bene, posa)`, `imponibile_22 = max(0, valore_bene − posa)`. Ritorna `RiepilogoIva[] = [{aliquota, imponibile, imposta}]` + `iva_totale`.
  - Riuso concettuale di `src/lib/fatturazione/calcoli.ts:calcolaRiepilogoIVA`, ma con la regola beni significativi (che lì non c'è).
- `calcolaConfrontoIva(ricavo_imponibile, voci, rates)` → per ogni aliquota in `iva_confronto`, il `prezzo_cliente` corrispondente (per il pannello a 3 colonne).
- `calcolaFasi(fasi, voci)` → rollup costo/manodopera per fase + timeline (settimane) per il cronoprogramma; durata totale = max(inizio+durata).
- `calcolaFinanziamento(...)` → **riuso diretto** di `src/lib/finanziamenti/calcolaFinanziamento.ts` (lookup+interpolazione su `eic_tabelle_finanziamento_righe`). Input: tabella righe + importo + numero_rate → `{ importo_rata, tan, taeg, importo_totale_dovuto, modalita }`.
- `calcolaSimulazione(sim, righeFinanziamento)` → orchestratore che produce `SimulazioneRisultato` (tutti i KPI della barra). Funzione pura → i risultati denormalizzati si salvano sulla riga `simulazioni`.

Tutto con test vitest (`src/lib/simulatore/calcoli.test.ts`): margine, IVA mista, beni significativi, confronto IVA, finanziamento (lookup ed interpolato).

## UI

### `SimulatoreIndex` (`/azienda/marketing/simulatore`)
Griglia di card per le simulazioni salvate (nome, cliente, valore cliente, margine % colorato, stato, data) + filtri (stato, template) + "Nuova simulazione" + duplica/elimina. Pattern visivo da `SettingsTariffe`/`CruscottoDashboardPage`.

### `SimulatoreEditor` (`/azienda/marketing/simulatore/:id`)
Il banco (vedi mockup approvato). Componenti in `src/components/marketing/simulatore/`:
- `SimKpiBar` — 5 metric card: Costo, Ricavo, **Margine % + valore** (verde), Prezzo cliente (IVA scelta), Rata.
- `SimVociGrid` — righe inline-editabili (`SimVoceRow`): descrizione, q.tà, UM, costo, ricarico%, prezzo, IVA, totale; raggruppate per fase; drag-reorder; toggle "bene significativo". Pulsanti **"Da listino"** (dialog che riusa il picker `tariffe_aziendali` + prezzari regionali `usePrezzarioVociGlobalSearch`) e **"Riga libera"**.
- `SimCronoprogramma` — editor fasi (`SimFaseEditor`) + barre tipo gantt (durata + giorni-uomo + costo manodopera per fase).
- `SimScenariPanel` — **IVA**: toggle singola/mista + 3 colonne di confronto (4/10/22) col prezzo cliente; **Finanziamento**: select tabella (da `useTabelleFinanziamentoAttive`) + importo/rate/anticipo (override) → rata/TAN/TAEG.
- `SimActions` — Salva, Esporta (PDF via @react-pdf, Excel via exceljs), **Trasforma in preventivo/commessa**.

Salvataggio: debounced autosave + Salva manuale; `calcolaSimulazione` ricalcola i KPI ad ogni edit (client-side, istantaneo); su save si persiste JSONB + riepilogo denormalizzato.

### Trasforma in preventivo/commessa
- **Preventivo**: INSERT `quotes` (company_id, quote_number `Q-YYYY-NNNNN`, status `bozza`, client_*, title, vat_rate globale) + `quote_items` per voce (name, quantity, unit_price, vat_rate per-riga, unit_of_measure, line_total, `tariffa_id` se da listino, item_category mappata da tipo). I trigger DB ricalcolano subtotal/iva/total.
- **Commessa**: RPC `create_order_atomic` (company_id, customer_id, order_code, total_amount, vat_rate, work_start/end_date dal cronoprogramma, financing_* dallo scenario) + link `quote_id`. La commessa richiede un'anagrafica cliente `profiles`: se la simulazione ha solo un `contact_id` CRM (o nessuno), l'azione apre la selezione/creazione cliente come fa già `CreateOrder.tsx`.
- Mapping in `src/lib/simulatore/trasforma.ts` (puro: SimVoce → QuoteItemInput / OrderInput), testato.

## Ordine di costruzione (una spec, due tappe)

**Tappa A — il foglio (MVP usabile):**
1. Migrazione `simulazioni` (file locale).
2. `src/lib/simulatore/tipi.ts` + `calcoli.ts` (voce, totali, margine, confronto IVA singola) + test.
3. `useSimulazioni` (CRUD).
4. Nav + rotte + `SimulatoreIndex` (lista/crea/elimina).
5. `SimulatoreEditor` con `SimKpiBar` + `SimVociGrid` (listino/prezzari/libere, inline edit) + autosave.

**Tappa B — la potenza:**
6. `SimCronoprogramma` (fasi + manodopera + timeline) + `calcolaFasi`.
7. `SimScenariPanel` IVA **mista 10/22 + beni significativi** + `calcolaIva` completo.
8. Finanziamenti: `SimScenariPanel` finanziario via `calcolaFinanziamento` + tabelle aziendali.
9. `trasforma.ts` + azioni "Trasforma in preventivo/commessa".
10. Export PDF/Excel + template (duplica come template / crea-da-template).

## Vincoli & gate

- **Solo locale**: migrazione come file, codice, nessun push/deploy/applicazione DB finché l'utente non dice "pubblica".
- **Gate**: `npx eslint <file>` (0 nuovi problemi) + `npx vite build` (exit 0) + `npx vitest run src/lib/simulatore` (motore puro). NON tsc completo.
- **DRY/YAGNI**: riuso massimo (finanziamenti, IVA, picker prezzari/listino, pattern hook). Niente refactor non necessari.
