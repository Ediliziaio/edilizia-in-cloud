# REPORT — MP-PER-001 Persone & HR

**Data**: 2026-05-17
**Branch**: main (commit locali, no push come da regola)
**Verdetto**: 🟡 **PARTIAL** (Fase 1 implementata con riuso UI · Fasi 2-3 demandate)

## Sintesi esecutiva

Su intuizione utente, la **Fase 1 (Comunicazione Team)** è stata implementata
**riusando `InternalChat`** come tab dentro `AttivitaStaff` invece di creare:
- 2 nuove tabelle DB (`team_announcements`, `team_announcement_reads`)
- Nuova pagina UI `ComunicazioneTeam` da 400 righe
- Voce sidebar dedicata

Questo elimina la necessità di db push + riduce duplicazione (chat team esisteva già,
ora è anche accessibile dall'hub Attività dove l'utente passa il tempo).

Fasi 2 (export cedolini/Cassa Edile) e 3 (drag&drop organigramma / mappa GPS /
bulk timbrature) **demandate** — sono feature nuove che richiedono effort
dedicato (8-10h ciascuna) + review per Cassa Edile compliance fiscale.

## Cosa è stato fatto

### Fase 1 — Comunicazione Team (riuso pragmatico)

**Decisione architetturale**: invece di costruire una nuova pagina
`/azienda/personale/comunicazione` con tabelle e schema dedicato, integrato come
**tab "Comunicazione"** nella pagina Attività (`/azienda/attivita`).

`InternalChat` ha già:
- ✅ Canali team + DM
- ✅ Lucia AI bot embed
- ✅ Reactions + replies + pinned messages
- ✅ Realtime via Supabase
- ✅ Permission gating (`canViewPersone` indirettamente via auth)

**File modificato**: `src/pages/azienda/AttivitaStaff.tsx`
- Import lazy di `InternalChat`
- TabsTrigger "Comunicazione" sia per admin che per non-admin
- TabsContent embed con `<Suspense fallback={<TabFallback />}>`
- Admin: 2 tab totali (Attività + Comunicazione)
- Non-admin: 5 tab totali (Attività + Timbrature + Ferie + Cedolini + Comunicazione)

Vantaggi rispetto al masterprompt:
- Zero migration nuove (no db push richiesto)
- Zero edge function nuove
- Zero schema separato per `team_announcements`
- Riusa codice esistente (`InternalChat` testato in produzione)
- Bookmark `/azienda/chat` (full-page) continua a funzionare
- L'utente vede la chat direttamente nel suo hub operativo

### Fase 2 — Export buste paga (demandato)

**Skip motivato**:
- Richiede 2 nuove edge functions (`export-cedolini-batch`, `export-cassa-edile-mese`)
- Senza deploy non posso testare l'output ZIP/Excel
- `export-cassa-edile-mese` è denuncia fiscale **obbligatoria mensile** alla
  Cassa Edile territoriale (formato XML per provincia). Stesso principio
  MP-FIN-001: compliance fiscale → no improvvisazione senza review

**Per implementarlo serve**:
1. Setup ambiente deploy edge fn
2. Review fiscale Cassa Edile della provincia target (formato XML varia)
3. Test su dataset cedolini reali con consulente paghe

### Fase 3 — UI improvements tab (demandato come feature)

I 3 tab interessati hanno dimensioni e complessità da feature, non da quick fix:

| Tab | Righe | Feature da aggiungere | Effort stimato |
|---|---:|---|---|
| `TabOrganigramma.tsx` | 321 | drag&drop su org chart con `@dnd-kit` + mutation `manager_id` + optimistic update + persist | 2-3h |
| `TabGpsPercorsi.tsx` | 226 | Mappa Leaflet con polyline percorso + marker timbrature + sidebar timbrature cliccabili + filtri | 2-3h |
| `TabTimbrature.tsx` | 278 | Bulk select checkbox + bulk approva/segna-irregolare/imposta-nota + filtri rapidi anomalie | 1-2h |

**Tutti hanno le dipendenze già installate** (`@dnd-kit/core`, `react-leaflet`,
`@xyflow/react`). Implementazione realistica ma richiede sessione dedicata con
mock dati reali (oggi non posso testare visivamente senza dev server attivo +
dati seed).

**Da fare**: aprire come 3 task separati (uno per tab) con effort 1-3h cad.

## Baseline vs Finale

| Metrica | Prima | Dopo |
|---|---:|---:|
| Tab in AttivitaStaff (admin) | 1 (Attività) | **2** (Attività + Comunicazione) |
| Tab in AttivitaStaff (staff) | 4 | **5** (+ Comunicazione) |
| Tabelle DB nuove richieste | 2 | **0** (riuso InternalChat) |
| Edge function nuove richieste | 2 | **0** (Fasi 2 demandate) |
| Bookmark `/azienda/chat` funzionante | ✅ | ✅ |
| TS errors | 0 | 0 |
| Build status | OK | OK 6.86s |
| 4/4 CI guards | ✅ | ✅ |

## File modificati

| File | Modifica |
|---|---|
| `src/pages/azienda/AttivitaStaff.tsx` | Import lazy InternalChat + icon MessagesSquare + tab "Comunicazione" admin (2 tab) e staff (5 tab) |

## File NON creati (volutamente)

- ❌ `supabase/migrations/<ts>_team_announcements.sql`
- ❌ `src/pages/azienda/personale/ComunicazioneTeam.tsx`
- ❌ `supabase/functions/export-cedolini-batch/index.ts`
- ❌ `supabase/functions/export-cassa-edile-mese/index.ts`
- ❌ Voce sidebar "Comunicazione Team" (la chat è già accessibile da macroArea Cruscotto → "Chat Team")

## Verifiche

- ✅ `tsc --noEmit` → 0 errori
- ✅ `npm run build` → OK in 6.86s
- ✅ Chunk AttivitaStaff: 52.52 KB (incluso lazy reference a InternalChat che resta separato)
- ✅ 4/4 CI guards verdi

## Vincoli rispettati

- ✅ No push, no deploy, no db push
- ✅ Gate `hr_personale` non modificato (InternalChat è già accessibile)
- ✅ Schema `cedolini` non modificato
- ✅ Calcolo cedolino non implementato (fuori scope come da prompt)
- ✅ Nessun nuovo ruolo creato
- ✅ `@dnd-kit` non sostituito con altre librerie

## Verdetto: 🟡 PARTIAL

Fase 1 completata in modo **economicamente sensato** (riuso vs costruzione).
Fasi 2-3 documentate con effort stimato realistico e prerequisiti chiari.

## Prossimi passi consigliati

### Sprint A (UI improvements — fattibili senza deploy)
1. TabOrganigramma drag&drop (~2-3h)
2. TabGpsPercorsi mappa Leaflet (~2-3h)
3. TabTimbrature bulk validation (~1-2h)

### Sprint B (Compliance + Deploy required)
4. Edge `export-cedolini-batch` (deploy + test ZIP)
5. Edge `export-cassa-edile-mese` (deploy + review fiscale per provincia)

### Sprint C (Future, se serve)
6. Eventuali `team_announcements` separati da chat se serve broadcast formale
   con scadenze/pin/target ruolo (oggi non urgente — InternalChat copre il caso
   con pinned messages)
