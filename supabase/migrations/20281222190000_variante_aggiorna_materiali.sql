-- Variante approvata → i materiali da rivedere, che il tecnico conferma.
--
-- Provato il 07/11/2026: approvata una perizia di variante che porta il cappotto
-- da 412,35 a 450 m², i materiali della commessa restavano quelli di prima e
-- nessuno vedeva che mancavano circa 40 m² di pannelli. È il caso che la
-- riconciliazione deve evitare: il progetto cambia dopo che gli ordini sono
-- partiti. Terzo passo del piano docs/piano-fabbisogno-acquisti-da-progetto.md.
--
-- Come si ricalcola, senza rifare la distinta:
--   ogni materiale generato ricorda in `origini` quanta parte viene da ogni voce
--   del computo (`{tipo:'computo', voce_id, quantita}`, quantità con lo sfrido).
--   Le voci della variante ricordano la voce da cui vengono (`voce_origine_id`).
--   Se la voce passa da 412,35 a 450, la sua parte cresce nella stessa proporzione;
--   se la voce non c'è più nella variante, la sua parte va a zero; le parti delle
--   voci non toccate restano uguali. La scomposizione è lineare (quantità per
--   unità × voce × sfrido), quindi la proporzione è esatta.
--   Il nuovo valore si arrotonda come il generatore: pezzi interi per cad/pz,
--   due decimali per eccesso il resto. Se la quantità era stata cambiata a mano,
--   si scala quella.
--
-- Cosa succede all'approvazione (computo_approva_variante):
--   * per ogni materiale che cambia, una riga in materiali_variazioni
--     (prima → dopo, da confermare); per ogni voce NUOVA della variante, una
--     riga «nuova voce: i materiali vanno generati»;
--   * i materiali vengono riagganciati alle voci della variante (computo_voce_id
--     e voce_id nelle origini), così la variante successiva li ritrova;
--   * una notifica a chi valida la distinta e all'ufficio acquisti.
-- La quantità NON cambia da sola: la conferma il tecnico
-- (materiali_variazioni_decidi), perché magari il materiale è già ordinato o
-- arrivato. Le righe già ordinate non si cancellano mai: se il nuovo valore è
-- sotto l'ordinato, la riconciliazione mostra l'eccedenza.

set local lock_timeout = '3s';

-- ─── Le variazioni ──────────────────────────────────────────────────────────
-- permesso materiali_variazioni: chi è dell'azienda; stretta a chi vede la commessa
-- (puo_vedere_commessa) da 20281222240000_correzioni_acquisti_computo.

create table if not exists public.materiali_variazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  variante_id uuid not null references public.computo_uploads(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  voce_id uuid,
  tipo text not null check (tipo in ('cambia', 'nuova_voce')),
  descrizione text not null,
  unita_misura text,
  quantita_prima numeric(14,4),
  quantita_dopo numeric(14,4),
  stato text not null default 'da_confermare' check (stato in ('da_confermare', 'applicata', 'scartata')),
  deciso_da uuid references auth.users(id) on delete set null,
  deciso_il timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists materiali_variazioni_order_idx on public.materiali_variazioni (order_id, stato);
create index if not exists materiali_variazioni_item_idx on public.materiali_variazioni (order_item_id);

comment on table public.materiali_variazioni is
  'Materiali da rivedere dopo una perizia di variante approvata: prima → dopo, da confermare dal tecnico (materiali_variazioni_decidi). Le scrive computo_approva_variante.';

alter table public.materiali_variazioni enable row level security;

drop policy if exists materiali_variazioni_leggi on public.materiali_variazioni;
create policy materiali_variazioni_leggi on public.materiali_variazioni
  for select to authenticated
  using (public.materiali_utente_in_azienda(company_id));

revoke all on public.materiali_variazioni from public, anon, authenticated;
grant select on public.materiali_variazioni to authenticated;
grant all on public.materiali_variazioni to service_role;

-- ─── Il calcolo, all'approvazione ───────────────────────────────────────────

create or replace function public.materiali_variazioni_calcola(p_variante uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v public.computo_uploads%rowtype;
  r record;
  quante integer := 0;
  nuove integer := 0;
  testo text;
  url text;
begin
  select * into v from public.computo_uploads where id = p_variante;
  if v.id is null or v.variante_di is null or v.order_id is null then
    return 0;
  end if;

  -- Voce vecchia → voce della variante (null se nella variante non c'è più).
  create temp table if not exists pg_temp.variante_voci (vecchia uuid primary key, nuova uuid, q_vecchia numeric, q_nuova numeric) on commit drop;
  delete from pg_temp.variante_voci;
  insert into pg_temp.variante_voci (vecchia, nuova, q_vecchia, q_nuova)
  select ve.id, nv.id, coalesce(ve.quantita, 0), coalesce(nv.quantita, 0)
    from public.computo_voci_estratte ve
    left join public.computo_voci_estratte nv on nv.computo_upload_id = v.id and nv.voce_origine_id = ve.id
   where ve.computo_upload_id = v.variante_di;

  perform set_config('app.materiali_sistema', 'on', true);

  for r in
    with materiali as (
      select oi.id, oi.name, oi.unita_misura, coalesce(oi.quantity, 0) as quantita, oi.quantita_calcolata, oi.computo_voce_id,
             case when jsonb_typeof(oi.origini) = 'array' and jsonb_array_length(oi.origini) > 0 then oi.origini
                  when oi.computo_voce_id is not null then jsonb_build_array(jsonb_build_object('tipo', 'computo', 'voce_id', oi.computo_voce_id, 'quantita', coalesce(oi.quantita_calcolata, oi.quantity)))
                  else '[]'::jsonb end as origini
        from public.order_items oi
       where oi.order_id = v.order_id
         and oi.natura_riga = 'materiale'
         and oi.origine_materiale = 'computo'
    ),
    parti as (
      select m.id, o.ord, o.e,
             vv.vecchia is not null as della_base,
             vv.nuova,
             coalesce((o.e->>'quantita')::numeric, 0) as prima,
             case when vv.vecchia is null then coalesce((o.e->>'quantita')::numeric, 0)
                  when vv.nuova is null then 0
                  when vv.q_vecchia = 0 then coalesce((o.e->>'quantita')::numeric, 0)
                  else coalesce((o.e->>'quantita')::numeric, 0) * vv.q_nuova / vv.q_vecchia end as dopo
        from materiali m
        cross join lateral jsonb_array_elements(m.origini) with ordinality as o(e, ord)
        left join pg_temp.variante_voci vv on o.e->>'tipo' = 'computo' and vv.vecchia = (o.e->>'voce_id')::uuid
    )
    select m.id, m.name, m.unita_misura, m.quantita, m.quantita_calcolata, m.computo_voce_id,
           sum(p.prima) as prima, sum(p.dopo) as dopo,
           bool_or(p.della_base) as tocca,
           jsonb_agg(case when p.della_base and p.nuova is not null
                          then p.e || jsonb_build_object('voce_id', p.nuova, 'quantita', round(p.dopo, 4))
                          when p.della_base then p.e || jsonb_build_object('quantita', 0)
                          else p.e end order by p.ord) as origini_nuove
      from materiali m join parti p on p.id = m.id
     group by m.id, m.name, m.unita_misura, m.quantita, m.quantita_calcolata, m.computo_voce_id
  loop
    continue when not r.tocca;
    declare
      a_pezzi boolean := coalesce(nullif(lower(btrim(r.unita_misura)), ''), 'pz') in ('pz', 'cad', 'n', 'nr');
      intatta boolean := r.quantita_calcolata is null or r.quantita in (r.quantita_calcolata, ceil(r.quantita_calcolata));
      grezzo numeric := case when intatta or r.prima = 0 then r.dopo else r.quantita * r.dopo / r.prima end;
      dopo numeric := case when grezzo <= 0 then 0
                           when a_pezzi then ceil(grezzo - 0.000000001)
                           else ceil(grezzo * 100 - 0.000001) / 100 end;
      voce_nuova uuid;
    begin
      select vv.nuova into voce_nuova from pg_temp.variante_voci vv where vv.vecchia = r.computo_voce_id;
      update public.order_items
         set origini = r.origini_nuove,
             computo_voce_id = case when voce_nuova is not null then voce_nuova else computo_voce_id end
       where id = r.id;
      if round(dopo, 4) <> round(r.quantita, 4) then
        insert into public.materiali_variazioni (company_id, order_id, variante_id, order_item_id, voce_id, tipo, descrizione, unita_misura, quantita_prima, quantita_dopo)
        values (v.company_id, v.order_id, v.id, r.id, voce_nuova, 'cambia', r.name, r.unita_misura, r.quantita, dopo);
        quante := quante + 1;
      end if;
    end;
  end loop;

  -- Voci nuove della variante: i loro materiali non ci sono ancora.
  insert into public.materiali_variazioni (company_id, order_id, variante_id, voce_id, tipo, descrizione, unita_misura, quantita_dopo)
  select v.company_id, v.order_id, v.id, nv.id, 'nuova_voce', nv.descrizione_breve, nv.unita_misura, nv.quantita
    from public.computo_voci_estratte nv
   where nv.computo_upload_id = v.id
     and (nv.voce_origine_id is null or not exists (select 1 from pg_temp.variante_voci vv where vv.vecchia = nv.voce_origine_id))
     and coalesce(nv.is_sicurezza, false) = false
     and coalesce(nv.quantita, 0) > 0;
  get diagnostics nuove = row_count;

  perform set_config('app.materiali_sistema', '', true);

  if quante + nuove > 0 then
    testo := concat_ws(' · ',
      case when quante > 0 then format('%s %s da rivedere', quante, case when quante = 1 then 'materiale' else 'materiali' end) end,
      case when nuove > 0 then format('%s %s senza materiali', nuove, case when nuove = 1 then 'voce nuova' else 'voci nuove' end) end);
    url := '/azienda/ordini/' || v.order_id || '?tab=articoli&vista_materiali=articoli';
    perform public.materiali_notifica_permesso(v.company_id, 'can_validate_bom',
      format('Variante approvata: %s', (select order_code from public.orders where id = v.order_id)), testo, url, null);
    perform public.materiali_notifica_permesso(v.company_id, 'can_manage_purchasing',
      format('Variante approvata: %s', (select order_code from public.orders where id = v.order_id)), testo || '. Il tecnico conferma le quantità nuove prima degli acquisti.', url, null);
  end if;
  return quante + nuove;
end;
$function$;

revoke all on function public.materiali_variazioni_calcola(uuid) from public, anon, authenticated;
grant execute on function public.materiali_variazioni_calcola(uuid) to service_role;

-- ─── Il tecnico conferma o scarta ───────────────────────────────────────────

create or replace function public.materiali_variazioni_decidi(p_order uuid, p_ids uuid[], p_applica boolean)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  n integer := 0;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  select o.company_id into azienda from public.orders o where o.id = p_order and o.deleted_at is null;
  if azienda is null or not public.materiali_utente_in_azienda(azienda) then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if not public.materiali_puo('can_validate_bom', azienda) then
    raise exception 'Le quantità dopo una variante le conferma chi valida la distinta' using errcode = '42501';
  end if;
  perform set_config('app.materiali_sistema', 'on', true);
  for r in
    select x.* from public.materiali_variazioni x
     where x.order_id = p_order and x.stato = 'da_confermare'
       and (p_ids is null or x.id = any(p_ids))
     for update
  loop
    if p_applica and r.tipo = 'cambia' and r.order_item_id is not null then
      update public.order_items
         set quantity = r.quantita_dopo, quantita_calcolata = r.quantita_dopo
       where id = r.order_item_id;
    end if;
    update public.materiali_variazioni
       set stato = case when p_applica then 'applicata' else 'scartata' end, deciso_da = auth.uid(), deciso_il = now()
     where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('app.materiali_sistema', '', true);
  return n;
end;
$function$;

revoke all on function public.materiali_variazioni_decidi(uuid, uuid[], boolean) from public, anon;
grant execute on function public.materiali_variazioni_decidi(uuid, uuid[], boolean) to authenticated, service_role;

-- ─── Agganciata all'approvazione della variante ─────────────────────────────

do $migrazione$
declare
  def text;
  quanti integer;
begin
  def := pg_get_functiondef('public.computo_approva_variante(uuid)'::regprocedure);
  if position('materiali_variazioni_calcola' in def) > 0 then
    return;
  end if;
  select count(*) into quanti from regexp_matches(def, '''variante_approvata'', v\.motivo_variante, auth\.uid\(\)\);', 'g');
  if quanti <> 1 then
    raise exception 'computo_approva_variante: atteso un solo inserimento dell''evento, trovati %', quanti;
  end if;
  execute replace(def, '''variante_approvata'', v.motivo_variante, auth.uid());',
    '''variante_approvata'', v.motivo_variante, auth.uid());' || E'\n'
    || '  -- I materiali della commessa da rivedere (20281222190000).' || E'\n'
    || '  PERFORM public.materiali_variazioni_calcola(p_variante_id);');
end
$migrazione$;
