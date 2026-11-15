-- Bolle con lo stesso numero in anni diversi (15/11/2026, decisione aperta §6.3 di
-- docs/automazioni-acquisti.md). Molti fornitori ricominciano la numerazione dei DDT ogni anno:
-- la bolla 1068 del 2025 e la 1068 del 2026 sono due bolle diverse, ma il vincolo di
-- 20281029210000 (azienda, fornitore, numero) rifiutava la seconda come doppione.
-- Ora il vincolo comprende l'anno della bolla: la stessa bolla dello stesso fornitore resta una
-- volta sola nello stesso anno. Il nuovo vincolo è più largo del vecchio: nessuna bolla già
-- caricata può violarlo (anteprima del 15/11: 446 bolle, 0 conflitti). Il nome contiene ancora
-- «una_bolla_per_fornitore», che il messaggio in italiano del browser riconosce (useDDTRicezione).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create unique index if not exists ddt_ricezione_una_bolla_per_fornitore_anno
  on public.ddt_ricezione (company_id, supplier_id, upper(btrim(numero_ddt)), (coalesce(extract(year from data_ricezione)::integer, 0)))
  where supplier_id is not null and btrim(numero_ddt) <> '';

comment on index public.ddt_ricezione_una_bolla_per_fornitore_anno is
  'La stessa bolla dello stesso fornitore una volta sola nello stesso anno: caricarla due volte vuol dire merce e costo contati due volte. Lo stesso numero in un altro anno è un''altra bolla (numerazione annuale).';

drop index if exists public.ddt_ricezione_una_bolla_per_fornitore;

-- arrivo_registra (arrivo merce dall'ordine) cercava la bolla già caricata per fornitore e numero, di
-- qualsiasi anno: con la numerazione annuale avrebbe riusato la 1068 dell'anno prima. Ora solo nello
-- stesso anno. Modifica puntuale del testo attuale della funzione (permessi e resto del corpo restano
-- quelli di oggi): se il testo non è quello atteso si ferma, invece di sostituire alla cieca.
do $$
declare
  v_fn regprocedure := to_regprocedure('public.arrivo_registra(uuid,jsonb,uuid,text,date,uuid)');
  v_def text;
  v_anno text := E'       and extract(year from d.data_ricezione) = extract(year from v_data)\n';
  v_1 text := E'            or (public.bolla_numero_norma(v_numero) <> '''' and public.bolla_numero_norma(d.numero_ddt) = public.bolla_numero_norma(v_numero)))\n     order by case';
  v_2 text := E'and d.purchase_order_id = po.id and upper(btrim(d.numero_ddt)) = upper(v_numero)\n       order by d.created_at limit 1;';
begin
  if v_fn is null then
    raise exception 'arrivo_registra(uuid,jsonb,uuid,text,date,uuid) non c''è: correggere a mano la ricerca della bolla per anno.';
  end if;
  v_def := pg_get_functiondef(v_fn);
  if position('extract(year from d.data_ricezione) = extract(year from v_data)' in v_def) > 0 then
    return; -- già fatto
  end if;
  if position(v_1 in v_def) = 0 or position(v_2 in v_def) = 0 then
    raise exception 'arrivo_registra non è quella attesa: correggere a mano la ricerca della bolla per anno.';
  end if;
  v_def := replace(v_def, v_1, replace(v_1, E'\n     order by case', E'\n' || v_anno || '     order by case'));
  v_def := replace(v_def, v_2, replace(v_2, E'\n       order by', E'\n' || replace(v_anno, '       and', '         and') || '       order by'));
  execute v_def;
end $$;
