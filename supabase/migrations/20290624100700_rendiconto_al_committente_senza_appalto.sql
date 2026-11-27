-- Il rendiconto al committente anche fuori dall'appalto
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Completa la decisione D1 di
-- docs/piano-rendiconto-da-rapportini-verifica.md, che finora era applicata
-- solo a metà.
--
-- La `20290624100000` ha aperto le RIGHE di rendiconto a qualunque commessa: la
-- vendita di una voce di rapportino non viene più cancellata. Ma il documento
-- che da quelle righe nasce — `appalto_sal_crea` — era ancora chiuso
-- all'appalto in tre punti, e la pagina non mostrava nemmeno il riquadro. Il
-- risultato: su una commessa cliente le righe si creavano nel database e
-- restavano invisibili e non fatturabili. Scoperto provando dal vivo, su una
-- commessa con 24 voci di lavoro già scritto, 21 pronte.
--
-- I tre blocchi tolti qui:
-- 1. il committente doveva avere `profiles.customer_type = 'appaltatore'`,
--    altrimenti «Committente inesistente». Su una commessa cliente è un
--    privato o un'azienda qualunque.
-- 2. le righe candidate erano filtrate su `o.order_type = 'appaltatore_lavoro'`:
--    nessuna riga trovata, «Nessuna riga confermata da rendicontare».
-- 3. un contratto nullo faceva fallire sempre. Ora: contratti DIVERSI nello
--    stesso periodo restano un errore (condizioni diverse non si mescolano in
--    un documento solo), ma «nessun contratto» è un caso legittimo — e la
--    ritenuta è zero, come è giusto quando non c'è un contratto che la fissi.
--
-- `array_agg(distinct …)` tiene il NULL come elemento: commesse con contratto e
-- senza nello stesso periodo danno un array di due, quindi l'errore scatta
-- ancora. È il comportamento che si vuole.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Un rendiconto di una commessa senza contratto non ha un contratto.
alter table public.appalto_sal alter column contratto_id drop not null;

create or replace function public.appalto_sal_crea(
  p_committente_id uuid,
  p_dal date,
  p_al date,
  p_order_id uuid default null::uuid,
  p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  -- Qualunque committente dell'azienda, non solo quelli di tipo «appaltatore»:
  -- il rendiconto vale anche per un cliente privato.
  select p.company_id into v_company from public.profiles p
   where p.id = p_committente_id;
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

  perform pg_advisory_xact_lock(hashtextextended(p_committente_id::text, 0));

  -- Le righe candidate: confermate, dentro il periodo, non ancora in un
  -- rendiconto, su commesse di questo committente che l'utente puo' modificare.
  -- Senza piu' il filtro sul tipo di commessa.
  select array_agg(rr.id), count(*), coalesce(sum(rr.importo), 0),
         array_agg(distinct o.appalto_contratto_id)
    into v_ids, v_n, v_tot, v_contratti
    from public.appalto_rendiconto_righe rr
    join public.orders o on o.id = rr.order_id and o.deleted_at is null
   where rr.stato = 'confermata'
     and rr.sal_id is null
     and rr.data between p_dal and p_al
     and o.company_id = v_company
     and o.customer_id = p_committente_id
     and (p_order_id is null or rr.order_id = p_order_id)
     and public.puo_modificare_commessa(o.id);

  if coalesce(v_n, 0) = 0 then
    raise exception 'Nessuna riga confermata da rendicontare in questo periodo' using errcode = '22023';
  end if;

  -- Contratti diversi vogliono dire condizioni diverse (ritenuta, pagamento):
  -- non si mescolano in un documento solo. «Nessun contratto» invece va bene.
  if array_length(v_contratti, 1) > 1 then
    raise exception 'Le righe del periodo appartengono a contratti diversi: va fatto un rendiconto per contratto'
      using errcode = '22023';
  end if;
  v_contratto := v_contratti[1];
  if v_contratto is not null then
    select ritenuta_pct into v_rit from public.appalto_contratti where id = v_contratto;
  end if;

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
$function$;
