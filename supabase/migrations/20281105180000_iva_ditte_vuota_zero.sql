-- IVA delle ditte esterne: vuota non vuol dire 22%.
--
-- v_ordine_marginalita (margine reale della commessa) toglieva il 22% al costo di una ditta senza IVA
-- scritta; la scheda Lavorazioni (costo previsto) contava 0. La stessa ditta dava due costi diversi, e il
-- margine reale risultava più alto del dovuto. Le ditte lavorano in reverse charge: 0 è il valore giusto.
--
-- Il 31/10/2026 le 157 righe di order_external_teams hanno tutte vat_rate = 0, nessuna vuota: nessun
-- numero cambia. Da qui la colonna non può più essere vuota (NOT NULL), e la vista conta 0 come il resto
-- del codice. src/test/logic/ivaDitteCoerente.test.ts tiene fermo il codice.
--
-- Niente valore di default, apposta: chi inserisce senza IVA la riceve dalla ditta dal trigger
-- trg_oet_iva_dalla_ditta (20281031230000), che scatta prima del controllo NOT NULL. Un default 0 la
-- scavalcherebbe, e una ditta che fattura col 22% finirebbe a 0.
--
-- La vista si riscrive dal suo testo attuale con una sola sostituzione (l'aliquota della ditta), per non
-- toccare quello che altre migrazioni ci hanno messo. Se il pezzo da sostituire non c'è esattamente una
-- volta, si ferma. Rilanciabile: già sostituita, non fa niente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- pg_get_viewdef dipende dal search_path: lo stesso con cui la vista è stata scritta.
set local search_path = "$user", public, extensions;

update public.order_external_teams set vat_rate = 0 where vat_rate is null;
alter table public.order_external_teams alter column vat_rate drop default;
alter table public.order_external_teams alter column vat_rate set not null;

do $$
declare
  v_def text;
  v_vecchio constant text := 'coalesce(ot.vat_rate, 22::numeric)';
  v_nuovo constant text := 'coalesce(ot.vat_rate, 0::numeric)';
  v_volte int;
begin
  v_def := pg_get_viewdef('public.v_ordine_marginalita'::regclass, true);
  if position(lower(v_nuovo) in lower(v_def)) > 0 and position(lower(v_vecchio) in lower(v_def)) = 0 then
    return;
  end if;
  v_volte := (length(lower(v_def)) - length(replace(lower(v_def), lower(v_vecchio), ''))) / length(v_vecchio);
  if v_volte <> 1 then
    raise exception 'v_ordine_marginalita: l''aliquota della ditta compare % volte, attesa 1: rivedere a mano', v_volte;
  end if;
  v_def := regexp_replace(v_def, 'coalesce\(ot\.vat_rate, 22::numeric\)', v_nuovo, 'i');
  execute 'create or replace view public.v_ordine_marginalita with (security_invoker = true) as ' || v_def;
end $$;
