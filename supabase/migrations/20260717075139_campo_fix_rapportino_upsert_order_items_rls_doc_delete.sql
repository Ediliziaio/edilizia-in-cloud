-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ════════════════════════════════════════════════════════════════════
-- Area campo (operai + subappaltatori) — 3 fix indipendenti
-- ════════════════════════════════════════════════════════════════════

-- ── 1) campo_rapportini: sblocca il RAPPORTINO VOCALE ────────────────
-- useRapportinoVocale fa upsert con onConflict "user_id,order_id,data_lavoro",
-- ma l'unico indice compatibile era PARZIALE (WHERE user_id IS NOT NULL AND
-- order_id IS NOT NULL). Postgres non può inferire un arbiter parziale senza
-- index_predicate (e PostgREST non lo può passare) → errore 42P10 a ogni
-- salvataggio, inghiottito dal catch che mostrava "Rapportino salvato".
-- Le 3 colonne sono già NOT NULL: il predicato è ridondante e il vincolo
-- pieno copre esattamente le stesse righe → nessuna nuova violazione.
DROP INDEX IF EXISTS public.ux_campo_rapportini_unique_day;

ALTER TABLE public.campo_rapportini
  ADD CONSTRAINT ux_campo_rapportini_unique_day
  UNIQUE (user_id, order_id, data_lavoro);

-- ── 2) order_items: il SUBAPPALTATORE vede i materiali di commessa ───
-- L'unica via campo era "Employees can view items of their assigned orders"
-- → order_has_employee_for_user(), che passa da order_employees JOIN
-- employees. Un subappaltatore non ha record in `employees` → 0 righe: nel
-- rapportino leggeva "Tocca i materiali della commessa" con zero chip.
-- Rispecchiamo la policy già esistente e collaudata su order_work_phases
-- ("Campo workers can view phases of assigned orders").
DROP POLICY IF EXISTS "Campo workers can view items of assigned orders" ON public.order_items;

CREATE POLICY "Campo workers can view items of assigned orders"
  ON public.order_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_campo_assignments oca
      WHERE oca.order_id = order_items.order_id
        AND oca.user_id = (SELECT auth.uid())
    )
  );

-- ── 3) documenti_dipendenti: l'eliminazione era FINTA ────────────────
-- Esistevano solo dd_insert / dd_insert_self / dd_select: nessuna DELETE.
-- Il delete passava la RLS su 0 righe, PostgREST rispondeva 204 senza
-- errore → toast "Documento rimosso" → invalidate → il documento riappariva.
-- Consentiamo la cancellazione dei PROPRI documenti (stessa semantica di
-- dd_insert_self), senza toccare quelli caricati dall'ufficio su altri.
DROP POLICY IF EXISTS "dd_delete_self" ON public.documenti_dipendenti;

CREATE POLICY "dd_delete_self"
  ON public.documenti_dipendenti
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));
