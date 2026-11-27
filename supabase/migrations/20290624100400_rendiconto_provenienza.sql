-- «Da dove viene»: il rendiconto e le giornate che l'hanno prodotto
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Lotto 3 di docs/piano-rendiconto-da-rapportini-verifica.md
--
-- Chiesto dal titolare: «quando fanno il rendiconto devono poter verificare e
-- modificare. Sarebbe figo aprire il rendiconto e vedere a destra tutti i
-- rapportini fatti giornalmente, così si fa un controllo incrociato anche col
-- listino».
--
-- Il confronto col listino non va calcolato: è già scritto su
-- `rapportino_voci_libere` da quando la voce è nata — `vendita_proposta` (cosa
-- diceva il listino), `vendita_unitaria` (cosa è stato applicato),
-- `prezzo_fonte` (committente / generale) e `prezzo_a_mano`. Questa funzione
-- le mette insieme, non le ricalcola: così il pannello non può dire una cosa
-- diversa da quello che è stato salvato.
--
-- Una chiamata sola per tutta la commessa (o un periodo): il pannello apre
-- senza una cascata di query, e `campo_rapportini` non viene mai letto dal
-- browser con un `select("*")` — che per i GRANT per colonna fallirebbe per
-- tutti (vedi CLAUDE.md, «I soldi dei rapportini»).
--
-- I costi escono solo a chi li può vedere: «Costi» oppure «Acquisti», la
-- stessa regola di `rapportini_costi()`.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.rendiconto_provenienza(
  p_order_id uuid,
  p_dal date default null,
  p_al date default null)
 returns table(
   rapportino_id uuid,
   data_lavoro date,
   descrizione_lavori text,
   persone jsonb,
   mezzi jsonb,
   voci jsonb,
   righe jsonb)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_company uuid; v_costi boolean;
begin
  select o.company_id into v_company
    from public.orders o
   where o.id = p_order_id and o.deleted_at is null;
  if not found then return; end if;

  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non hai il permesso di vedere il rendiconto di questa commessa' using errcode = '42501';
  end if;

  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company)
          or public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', v_company);

  return query
  select
    cr.id,
    cr.data_lavoro,
    cr.descrizione_lavori,
    -- Chi c'era e quante ore.
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome'),
               'ore', case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric end)
             order by coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome'))
        from jsonb_array_elements(
               case when jsonb_typeof(cr.presenze) = 'array' then cr.presenze else '[]'::jsonb end) p
    ), '[]'::jsonb),
    -- I mezzi e le loro ore.
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'mezzo_id', case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then m->>'mezzo_id' end,
               'nome', coalesce(nullif(btrim(m->>'nome'), ''), 'Mezzo'),
               'ore', case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'ore', ',', '.')::numeric end))
        from jsonb_array_elements(
               case when jsonb_typeof(cr.mezzi_usati) = 'array' then cr.mezzi_usati else '[]'::jsonb end) m
    ), '[]'::jsonb),
    -- Le voci, col confronto col listino già pronto.
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'descrizione', v.descrizione,
               'quantita', v.quantita,
               'unita', v.unita,
               'vendita_unitaria', v.vendita_unitaria,
               'vendita_proposta', v.vendita_proposta,
               'prezzo_fonte', v.prezzo_fonte,
               'prezzo_a_mano', coalesce(v.prezzo_a_mano, false),
               'al_listino', v.appalto_tariffa_id is not null,
               'costo_unitario', case when v_costi then v.costo_unitario end,
               'rendicontata', exists (
                 select 1 from public.appalto_rendiconto_righe rr where rr.voce_libera_id = v.id))
             order by v.descrizione)
        from public.rapportino_voci_libere v
       where v.rapportino_id = cr.id
    ), '[]'::jsonb),
    -- Le righe di rendiconto nate da questa giornata.
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', rr.id,
               'descrizione', rr.descrizione,
               'quantita', rr.quantita,
               'unita_misura', rr.unita_misura,
               'prezzo_unitario', rr.prezzo_unitario,
               'importo', rr.importo,
               'stato', rr.stato,
               'da_voce', rr.voce_libera_id is not null,
               'da_mezzo', rr.mezzo_id is not null,
               'costo_interno', case when v_costi then rr.costo_interno end)
             order by rr.descrizione)
        from public.appalto_rendiconto_righe rr
       where rr.rapportino_id = cr.id
    ), '[]'::jsonb)
  from public.campo_rapportini cr
  where cr.order_id = p_order_id
    and cr.approvato
    and cr.annullato_at is null
    and (p_dal is null or cr.data_lavoro >= p_dal)
    and (p_al is null or cr.data_lavoro <= p_al)
  order by cr.data_lavoro desc;
end;
$function$;

revoke all on function public.rendiconto_provenienza(uuid, date, date) from public, anon;
grant execute on function public.rendiconto_provenienza(uuid, date, date) to authenticated, service_role;
