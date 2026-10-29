-- ════════════════════════════════════════════════════════════════════════════
-- Via la tabella temporanea da appalto_sal_crea
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione a `appalto_sal_crea` (20281028150000): raccoglieva le righe
-- candidate in una TABELLA TEMPORANEA `on commit drop`. «On commit» vuol dire
-- al commit, non alla fine della funzione: due rendiconti composti nella stessa
-- transazione si scontravano con «relation _righe_sal already exists».
--
-- In produzione ogni chiamata e' una transazione sua, quindi non si sarebbe
-- visto subito — ma qualunque lavoro a lotti (comporre i rendiconti di tutti i
-- committenti in un giro) ci sarebbe finito dentro. Trovato provando due
-- composizioni di fila nella stessa transazione di collaudo.
--
-- Via la tabella temporanea: una query sola che riempie un array di id, il
-- conteggio, il totale e l'elenco dei contratti. Niente oggetti di sessione
-- dentro una funzione SECURITY DEFINER con search_path vuoto.
--
-- Idempotente. Nessuna riga scritta.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_sal_crea(
  p_committente_id uuid,
  p_dal date,
  p_al date,
  p_order_id uuid default null,
  p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_ids uuid[];
  v_contratti uuid[];
  v_contratto uuid;
  v_numero integer;
  v_sal uuid;
  v_tot numeric(14,2);
  v_n integer;
  v_rit numeric(6,3);
begin
  if p_al < p_dal then
    raise exception 'Il periodo finisce prima di cominciare' using errcode = '22023';
  end if;

  select p.company_id into v_company from public.profiles p
   where p.id = p_committente_id and p.customer_type = 'appaltatore';
  if v_company is null then
    raise exception 'Committente inesistente' using errcode = '23514';
  end if;

  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi comporre il rendiconto di questo committente' using errcode = '42501';
  end if;

  -- Un numero per committente, uno alla volta: due persone che compongono lo
  -- stesso rendiconto nello stesso momento non devono prendere lo stesso numero.
  perform pg_advisory_xact_lock(hashtextextended(p_committente_id::text, 0));

  -- Le righe candidate: confermate, dentro il periodo, non ancora in un
  -- rendiconto, su commesse di questo committente che l'utente puo' modificare.
  select array_agg(rr.id), count(*), coalesce(sum(rr.importo), 0),
         array_agg(distinct o.appalto_contratto_id)
    into v_ids, v_n, v_tot, v_contratti
    from public.appalto_rendiconto_righe rr
    join public.orders o on o.id = rr.order_id and o.deleted_at is null
   where rr.stato = 'confermata'
     and rr.sal_id is null
     and rr.data between p_dal and p_al
     and o.company_id = v_company
     and o.order_type = 'appaltatore_lavoro'
     and o.customer_id = p_committente_id
     and (p_order_id is null or rr.order_id = p_order_id)
     and public.puo_modificare_commessa(o.id);

  if coalesce(v_n, 0) = 0 then
    raise exception 'Nessuna riga confermata da rendicontare in questo periodo' using errcode = '22023';
  end if;

  -- Contratti diversi vogliono dire condizioni diverse (ritenuta, pagamento):
  -- non si mescolano in un documento solo.
  if array_length(v_contratti, 1) > 1 or v_contratti[1] is null then
    raise exception 'Le righe del periodo appartengono a contratti diversi (o a commesse senza contratto): va fatto un rendiconto per contratto'
      using errcode = '22023';
  end if;
  v_contratto := v_contratti[1];
  select ritenuta_pct into v_rit from public.appalto_contratti where id = v_contratto;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.appalto_sal where committente_id = p_committente_id;

  insert into public.appalto_sal (
    company_id, committente_id, contratto_id, order_id,
    periodo_dal, periodo_al, numero, stato,
    totale, ritenuta_pct, ritenuta, netto, righe_contate, note
  ) values (
    v_company, p_committente_id, v_contratto, p_order_id,
    p_dal, p_al, v_numero, 'bozza',
    v_tot, coalesce(v_rit, 0), round(v_tot * coalesce(v_rit, 0) / 100.0, 2),
    v_tot - round(v_tot * coalesce(v_rit, 0) / 100.0, 2), v_n, p_note
  ) returning id into v_sal;

  update public.appalto_rendiconto_righe
     set stato = 'in_sal', sal_id = v_sal
   where id = any(v_ids);

  return v_sal;
end;
$fn$;
revoke all on function public.appalto_sal_crea(uuid, date, date, uuid, text) from public, anon;
grant execute on function public.appalto_sal_crea(uuid, date, date, uuid, text) to authenticated, service_role;
