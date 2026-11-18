-- Fabbisogno materiali: anche le fasi che non usano la validazione del tecnico (17/11/2026).
--
-- Nella commessa una fase senza validazione si compra subito («funziona come prima»,
-- `acquistabile` in src/lib/distinta/statiFase.ts). La pagina «Fabbisogno materiali» invece
-- mostrava solo le fasi validate: per un'azienda che la validazione non la usa era sempre vuota
-- («Niente da ordinare» con 482 righe aperte su Demo Azienda 2, prova del 17/11/2026).
--
-- Si cambia solo il filtro della pagina (`materiali_riconciliazione_azienda`): una riga compare se
-- la sua fase è validata OPPURE non ha una validazione aperta. Una fase in preparazione o dal
-- tecnico resta fuori, come prima. Il promemoria giornaliero (`materiali_promemoria_acquisti`)
-- resta com'è: accenderlo per tutte le aziende senza validazione sarebbe una scelta a parte.
-- Idempotente: se il filtro è già quello nuovo non fa niente.

DO $$
DECLARE
  d text := pg_get_functiondef('public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer)'::regprocedure);
  vecchio constant text := 'where r.fase_validata
       and public.can_see_order';
  nuovo constant text := 'where (r.fase_validata
            or not exists (select 1 from public.materiali_fasi_validazione fv where fv.phase_id = r.phase_id))
       and public.can_see_order';
BEGIN
  IF position('not exists (select 1 from public.materiali_fasi_validazione fv' in d) > 0 THEN
    RETURN;
  END IF;
  IF position(vecchio in d) = 0 THEN
    RAISE EXCEPTION 'materiali_riconciliazione_azienda: il filtro delle fasi validate non è quello atteso';
  END IF;
  EXECUTE replace(d, vecchio, nuovo);
END $$;
