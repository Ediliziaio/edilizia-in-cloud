-- 20290322090000_economia_commesse_per_id.sql
--
-- La pagina di un'operazione immobiliare andava in timeout (14/11/2026, URBAN VISION O-0003):
-- generale_unita_elenco e scheda_commessa rispondevano 500 dopo 8 secondi.
--
-- Causa. v_ordine_marginalita avvolge private.office_order_economics_projection(), che calcola
-- l'economia di TUTTE le commesse visibili all'utente: un filtro per id, fuori da una funzione,
-- non entra. Leggere una riga costava come leggerle tutte (1,4 s per un'azienda di 47 commesse).
-- generale_unita_elenco la leggeva una volta per la generale e una per ogni unità (11 volte su
-- O-0003: 3,9 s da sola); la leggevano anche scheda_commessa (ogni pagina commessa) e
-- generale_piano_righe_reali (il reale del piano economico).
--
-- Rimedio. economia_commesse(ids): la stessa proiezione, con gli stessi diritti
-- (office_order_rights per riga, office_visible_order), ma solo sulle commesse chieste.
-- private.office_order_economics_base filtrata per id: 29 ms per 11 righe.
--
-- Nella stessa migrazione (lotto 2 del piano 2026-11-14-operazione-immobiliare-piano-completo):
-- il piano datava una spesa con coalesce(paid_date, due_date, created_at). La convenzione del
-- progetto per «pagamento ignoto» è due_date = 9999-12-31: quelle spese finivano nel mese
-- 9999-12, fuori da cassa, capitale impegnato e andamento (738.937 € su Via Callimaco, 138 costi
-- in 6 aziende). Ora: pagamento, scadenza vera, data del documento, data della fattura ricevuta
-- collegata, creazione.
--
-- Le tre funzioni si cambiano sostituendo pezzi del loro testo attuale; se un pezzo non c'è
-- (funzione cambiata nel frattempo) la migrazione si ferma invece di applicare a metà. Rieseguita,
-- non fa niente: i pezzi sono già sostituiti.

create or replace function public.economia_commesse(p_ids uuid[])
returns setof private.office_order_economics_base
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.company_id, b.order_code, b.description,
    (case when coalesce((r.rights->>'amounts')::boolean, false) then b.preventivo_contratto end)::numeric(10,2),
    (case when coalesce((r.rights->>'amounts')::boolean, false) then b.variazioni_approvate end)::numeric,
    (case when coalesce((r.rights->>'amounts')::boolean, false) then b.preventivo_totale end)::numeric,
    b.work_start_date, b.work_end_date, b.created_at, b.cliente_nome,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_acquisti end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_errori end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.consuntivo end)::numeric,
    (case when coalesce((r.rights->>'margins')::boolean, false) then b.margine end)::numeric,
    (case when coalesce((r.rights->>'margins')::boolean, false) then b.margine_perc end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_manodopera end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_provvigioni end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_diretto end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_materiali_magazzino end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.movimenti_magazzino_senza_costo end)::bigint,
    b.percentuale_avanzamento,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.costo_rimborsi_km end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.rimborsi_km_da_approvare end)::numeric,
    (case when coalesce((r.rights->>'costs')::boolean, false) then b.numero_rimborsi_km_da_approvare end)::bigint
  from private.office_order_economics_base b
  cross join lateral (select private.office_order_rights(b.id) as rights offset 0) r
  where b.id = any (p_ids)
    and private.office_visible_order(b.id)
$$;

comment on function public.economia_commesse(uuid[]) is
  'v_ordine_marginalita per le sole commesse chieste: stessi diritti (office_order_rights, office_visible_order), senza calcolare tutte le commesse dell''azienda. 20290322090000.';

revoke all on function public.economia_commesse(uuid[]) from public, anon;
grant execute on function public.economia_commesse(uuid[]) to authenticated, service_role;

do $migrazione$
declare
  sostituisci constant jsonb := jsonb_build_array(
    -- generale_unita_elenco: costi comuni della generale.
    jsonb_build_array('public.generale_unita_elenco(uuid)',
      'select coalesce(m.consuntivo, 0) into v_costi_comuni from public.v_ordine_marginalita m where m.id = p_generale_id;',
      'select coalesce(m.consuntivo, 0) into v_costi_comuni from public.economia_commesse(array[p_generale_id]) m;'),
    -- generale_unita_elenco: costo di ogni unità, letto una volta per tutte.
    jsonb_build_array('public.generale_unita_elenco(uuid)',
      '''costo'', case when v_vede_costi then (select coalesce(m.consuntivo, 0) from public.v_ordine_marginalita m where m.id = o.id) end,',
      '''costo'', case when v_vede_costi then coalesce(ec.consuntivo, 0) end,'),
    jsonb_build_array('public.generale_unita_elenco(uuid)',
      'left join public.profiles p on p.id = u.acquirente_id
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null;',
      'left join public.profiles p on p.id = u.acquirente_id
    left join public.economia_commesse(case when v_vede_costi then array(
      select f.id from public.orders f where f.commessa_generale_id = p_generale_id and f.deleted_at is null) end) ec on ec.id = o.id
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null;'),
    -- generale_piano_righe_reali: una lettura per le commesse della generale.
    jsonb_build_array('public.generale_piano_righe_reali(uuid,boolean,boolean)',
      'from public.v_ordine_marginalita v
     where p_costi and v.id in (select s.id from s)',
      'from public.economia_commesse(array(select s.id from s)) v
     where p_costi'),
    -- generale_piano_righe_reali: data delle spese senza la scadenza convenzionale 9999-12-31.
    jsonb_build_array('public.generale_piano_righe_reali(uuid,boolean,boolean)',
      'coalesce(cc.paid_date, cc.due_date, cc.created_at::date) as data,',
      'coalesce(cc.paid_date, nullif(cc.due_date, date ''9999-12-31''), cc.documento_data,
                    (select min(fr.data_fattura) from public.fatture_ricevute fr
                      where fr.company_cost_id = cc.id and fr.company_id = cc.company_id),
                    cc.created_at::date) as data,'),
    jsonb_build_array('public.generale_piano_righe_reali(uuid,boolean,boolean)',
      'coalesce(cc.paid_date, cc.due_date, cc.created_at::date),
           public.generale_piano_chiave_costo(cc.category), cc.category,',
      'coalesce(cc.paid_date, nullif(cc.due_date, date ''9999-12-31''), cc.documento_data,
                    (select min(fr.data_fattura) from public.fatture_ricevute fr
                      where fr.company_cost_id = cc.id and fr.company_id = cc.company_id),
                    cc.created_at::date),
           public.generale_piano_chiave_costo(cc.category), cc.category,'),
    -- scheda_commessa: l'economia della sola commessa aperta.
    jsonb_build_array('public.scheda_commessa(uuid,uuid,boolean,boolean)',
      'from public.v_ordine_marginalita m where m.id = p_order_id)',
      'from public.economia_commesse(array[p_order_id]) m)')
  );
  s jsonb;
  funzioni text[] := array['public.generale_unita_elenco(uuid)',
                           'public.generale_piano_righe_reali(uuid,boolean,boolean)',
                           'public.scheda_commessa(uuid,uuid,boolean,boolean)'];
  f text;
  definizione text;
  nuova text;
begin
  foreach f in array funzioni loop
    definizione := pg_get_functiondef(f::regprocedure);
    nuova := definizione;
    for s in select value from jsonb_array_elements(sostituisci) loop
      continue when s->>0 <> f;
      if position(s->>2 in nuova) > 0 then
        continue; -- già sostituito
      end if;
      if position(s->>1 in nuova) = 0 then
        raise exception 'economia_commesse: in % non trovo il pezzo da sostituire: %', f, left(s->>1, 120);
      end if;
      nuova := replace(nuova, s->>1, s->>2);
    end loop;
    if nuova is distinct from definizione then
      execute nuova;
    end if;
  end loop;
end
$migrazione$;
