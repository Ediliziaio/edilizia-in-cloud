# Calendari lavori — Pezzo 3: la disponibilità della squadra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando scegli le date di una commessa, per ogni squadra assegnata vedi se in quei giorni è libera o già impegnata (altre commesse con orari + impegni del suo calendario Google). Avvisa, non blocca. Nel calendario operativo gli impegni Google delle squadre hanno il colore della squadra.

**Architecture:** Una RPC `squadra_impegni` (SECURITY DEFINER con controllo azienda) unisce le altre commesse della squadra nel periodo e gli slot occupati del suo calendario Google (già in `google_calendar_busy_slots`, alimentati dal pezzo 2). Un componente `DisponibilitaSquadra` la interroga con date e orari correnti del dialog (debounce) e mostra una striscia verde/ambra. In `Calendar.tsx` gli slot occupati vengono arricchiti con nome e colore della squadra proprietaria del calendario.

**Tech Stack:** Postgres, React + TanStack Query, vitest per la funzione pura di sovrapposizione.

---

## Mappa dei file

| File | Ruolo |
|---|---|
| `supabase/migrations/20280912000003_squadra_impegni.sql` | RPC `squadra_impegni` |
| `src/lib/calendar/sovrapposizione.ts` + `src/test/logic/sovrapposizione.test.ts` | funzione pura: intervallo commessa (date+ore) e sovrapposizione |
| `src/hooks/useSquadraImpegni.ts` | query alla RPC |
| `src/components/calendar/DisponibilitaSquadra.tsx` | la striscia |
| `src/components/calendar/EditOrderDatesDialog.tsx` | montaggio sotto Subappaltatori |
| `src/types/calendar.ts`, `src/pages/azienda/Calendar.tsx`, `CalendarWeekView/MonthView/DayView.tsx` | slot occupati col colore della squadra |

---

### Task 1: RPC `squadra_impegni`

```sql
-- Disponibilità della squadra (08/09/2026): le altre commesse della squadra nel
-- periodo + gli impegni del suo calendario Google. Avvisa, non blocca: è la
-- UI a decidere cosa farne. DEFINER con controllo azienda: gli slot Google
-- sono leggibili solo da chi ha la connessione o dallo staff, ma la striscia
-- serve a chiunque pianifichi.
CREATE OR REPLACE FUNCTION public.squadra_impegni(
  p_team_id uuid, p_dal date, p_al date, p_commessa_esclusa uuid DEFAULT NULL
) RETURNS TABLE (fonte text, titolo text, inizio timestamptz, fine timestamptz, tutto_il_giorno boolean, order_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  WITH sq AS (
    SELECT t.id, t.company_id, t.google_calendar_id
      FROM public.external_teams t
     WHERE t.id = p_team_id AND t.company_id = public.get_user_company_id((SELECT auth.uid()))
  ),
  commesse AS (
    SELECT 'commessa'::text AS fonte,
           coalesce(o.order_code, '') || coalesce(' · ' || o.client_name, '') AS titolo,
           (o.work_start_date + coalesce(o.work_start_time, time '00:00')) AT TIME ZONE 'Europe/Rome' AS inizio,
           (coalesce(o.work_end_date, o.work_start_date) + coalesce(o.work_end_time, time '23:59')) AT TIME ZONE 'Europe/Rome' AS fine,
           (o.work_start_time IS NULL) AS tutto_il_giorno,
           o.id AS order_id
      FROM sq
      JOIN public.order_external_teams oet ON oet.external_team_id = sq.id
      JOIN public.orders o ON o.id = oet.order_id AND o.company_id = sq.company_id
     WHERE o.work_start_date IS NOT NULL
       AND (p_commessa_esclusa IS NULL OR o.id <> p_commessa_esclusa)
       AND o.work_start_date <= p_al
       AND coalesce(o.work_end_date, o.work_start_date) >= p_dal
  ),
  google AS (
    SELECT 'google'::text, coalesce(nullif(b.summary, ''), 'Impegno su Google'),
           b.start_at, b.end_at, b.is_all_day, NULL::uuid
      FROM sq
      JOIN public.google_calendar_busy_slots b ON b.google_calendar_id = sq.google_calendar_id AND b.company_id = sq.company_id
     WHERE sq.google_calendar_id IS NOT NULL
       AND b.start_at < ((p_al + 1) AT TIME ZONE 'Europe/Rome')
       AND b.end_at > (p_dal AT TIME ZONE 'Europe/Rome')
  )
  SELECT * FROM commesse UNION ALL SELECT * FROM google ORDER BY inizio;
$$;
REVOKE ALL ON FUNCTION public.squadra_impegni(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.squadra_impegni(uuid, date, date, uuid) TO authenticated;
```
Applica sul live + `migration repair 20280912000003`. Verifica: `select * from squadra_impegni('<id squadra Montaggi>', '2026-09-14', '2026-09-14', null)` come utente → almeno la commessa di prova (con `p_commessa_esclusa` = null).

### Task 2: funzione pura di sovrapposizione (test prima)

`src/lib/calendar/sovrapposizione.ts`: `intervalloCommessa({ work_start_date, work_end_date, work_start_time, work_end_time })` → `{ inizio: Date, fine: Date } | null` (senza orari: 00:00 → 23:59 del giorno di fine); `siSovrappongono(a, b)` → `a.inizio < b.fine && a.fine > b.inizio`. Test: due mezze giornate (8–12 / 13–17) NON si sovrappongono; tutto-il-giorno vs 8–12 sì; giorni diversi no.

### Task 3: hook + componente

`useSquadraImpegni(teamId, dal, al, commessaEsclusa)` → `supabase.rpc("squadra_impegni" as never, {...} as never)`, `enabled` solo con team+date, `staleTime 60s`.

`DisponibilitaSquadra({ team: {id,name,color}, dates, orderId })`: calcola l'intervallo scelto con `intervalloCommessa`, filtra gli impegni della RPC che si sovrappongono (`siSovrappongono`), e mostra:
- verde «Squadra X: libera dal … al …»
- ambra «Squadra X: già impegnata» + elenco (max 3, poi «+N») con fonte e giorno/ora
- grigio «disponibilità non verificabile» su errore.
Mai un bottone disabilitato: avvisa e basta.

### Task 4: montaggio nel dialog date

Sotto la lista dei subappaltatori assegnati (`order.order_external_teams`), una `DisponibilitaSquadra` per squadra, con le date/orari **correnti del form** (non quelli salvati), così cambiando data la striscia cambia.

### Task 5: colore della squadra sugli slot Google nel calendario

`GoogleBusySlot` + `team_name?`, `team_color?`. In `Calendar.tsx`, dopo la query degli slot: mappa `google_calendar_id → external_teams (name,color)` dalla lista `externalTeams` già caricata (serve `google_calendar_id` nella select del filtro squadre). Week/Month/Day: se `busySlot.team_color` → quello al posto di `eventColors.google_busy`, etichetta `«Squadra X · summary»`. Il gate `isGoogleConnected` della query slot diventa `isGoogleConnected || haSquadreCollegate`.

### Task 6: verifica

Demo Azienda: dialog date di ORD-DEM-SR19 (14/09 8–12, squadra Montaggi) → striscia. Metti un'altra commessa della stessa squadra il 14/09 13–17 → verde (mezze giornate); 10–14 → ambra con la SR19 in elenco. Slot Google della squadra (dopo un `pull-busy-slots`) → in elenco con «Google». Calendario: slot occupati del calendario Team col colore della squadra. Pulizia. vitest + build + ratchet. Nessun push.
