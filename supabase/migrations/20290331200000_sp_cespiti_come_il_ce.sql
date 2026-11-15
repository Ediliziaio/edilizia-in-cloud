-- Stato patrimoniale: beni ammortizzabili al valore netto della stessa regola del CE (15/11/2026)
--
-- Le immobilizzazioni materiali e immateriali entravano nello Stato
-- patrimoniale col valore residuo salvato sul cespite (costo − fondo_amm),
-- un numero inserito una volta e mai aggiornato, anche per gli anni chiusi;
-- il conto economico invece ammortizza mese per mese dalla data di acquisto.
-- Demo 2: furgone Iveco Daily a 22.800 € nello Stato patrimoniale, 10.292 €
-- secondo gli ammortamenti del CE. Attivo e risultato non tornavano tra loro
-- (art. 2426 c.c., n. 2; OIC 16 e 24: valore = costo meno ammortamenti).
--
-- Adesso il valore netto alla data è costo − quota mensile × mesi d'uso fino
-- al mese della data (dal mese di acquisto compreso), mai sotto zero: la
-- stessa regola degli ammortamenti del conto economico. Le immobilizzazioni
-- finanziarie (che non si ammortizzano) restano al valore salvato.

create or replace function private.cg_cespite_netto_al(
  p_costo numeric, p_aliquota numeric, p_vita_mesi integer, p_acquisto date, p_rif date)
returns numeric language sql immutable parallel safe set search_path to '' as $$
  select greatest(0, coalesce(p_costo, 0) - least(coalesce(p_costo, 0),
           (case when coalesce(p_aliquota, 0) > 0 then p_costo * p_aliquota / 100.0
                 when coalesce(p_vita_mesi, 0) > 0 then p_costo / (p_vita_mesi / 12.0)
                 else 0 end) / 12.0
           * greatest(0, (extract(year from p_rif) * 12 + extract(month from p_rif))
                       - (extract(year from p_acquisto) * 12 + extract(month from p_acquisto)) + 1)))::numeric(14,2)
$$;
revoke all on function private.cg_cespite_netto_al(numeric, numeric, integer, date, date) from public, anon, authenticated;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  nuovo text := vecchio;
  prima text[] := array[
    $a$COALESCE(sum(valore_residuo) FILTER (WHERE categoria='immateriale'), 0)$a$,
    $a$COALESCE(sum(valore_residuo) FILTER (WHERE categoria='materiale'),   0)$a$];
  dopo text[] := array[
    $b$COALESCE(sum(private.cg_cespite_netto_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, v_rif)) FILTER (WHERE categoria='immateriale'), 0)$b$,
    $b$COALESCE(sum(private.cg_cespite_netto_al(costo_storico, aliquota_amm, vita_utile_mesi, data_acquisto, v_rif)) FILTER (WHERE categoria='materiale'),   0)$b$];
  i integer;
begin
  if position('private.cg_cespite_netto_al' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Stato patrimoniale: blocco dei cespiti % non trovato, la funzione è cambiata', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
