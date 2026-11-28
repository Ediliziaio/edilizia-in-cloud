-- La vista dei rendiconti dice anche in che stato è il periodo che li contiene
-- ───────────────────────────────────────────────────────────────────────────
-- 28/11/2026. Con la 20290630360000 un giorno dentro un rendiconto del periodo **in bozza** si
-- corregge ancora: l'app deve poterlo dire, invece di sigillare il foglio appena vede un `sal_id`.
--
-- La colonna si aggiunge in coda prendendo la definizione dal catalogo, e `security_invoker` si
-- riapplica subito dopo: proprio questa vista, il 28/11, aveva mostrato i rendiconti di un'azienda
-- a un'altra perché un `CREATE OR REPLACE VIEW` gliel'aveva tolto in silenzio.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

do $$
declare v_def text; v_punto int;
begin
  select pg_get_viewdef('public.v_rendiconti_giornalieri'::regclass, true) into v_def;
  if position('sal_stato' in v_def) > 0 then
    return;
  end if;
  v_punto := position(E'\n   FROM ' in v_def);
  if v_punto = 0 then
    raise exception 'La definizione di v_rendiconti_giornalieri non è quella attesa.';
  end if;
  v_def := left(v_def, v_punto - 1)
        || E',\n    ( SELECT s.stato FROM public.appalto_sal s WHERE s.id = r.sal_id) AS sal_stato'
        || substr(v_def, v_punto);
  execute 'create or replace view public.v_rendiconti_giornalieri as ' || v_def;
end $$;

alter view public.v_rendiconti_giornalieri set (security_invoker = true);
