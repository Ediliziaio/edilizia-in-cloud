-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali nel cruscotto aziendale e in Silvio (tappa 7)
-- ════════════════════════════════════════════════════════════════════════════
-- Nessun conto nuovo: si leggono le funzioni che la pagina della generale usa
-- già, una volta per generale, dentro il database (una chiamata dal browser
-- invece di tre per ogni generale).
--
--   1. generale_piano_numeri(generale, costi, importi): i numeri del piano
--      economico in breve (previsto, reale, stima finale, capitale). Sono le
--      righe che le fotografie mensili calcolavano in SQL; la fotografia ora
--      legge da qui, così il conto è uno solo. Interna.
--   2. cruscotto_commesse_generali(azienda): per ogni generale che chi chiede
--      può vedere, la risposta di commessa_generale_riepilogo, di
--      generale_unita_elenco (sviluppo e compravendita) e del piano. I totali
--      li fa l'app con le stesse funzioni della pagina (totaliGenerale,
--      riepilogoVendite). Per gli utenti dell'app.
--   3. Silvio e il connettore AI (platform-mcp), sola lettura, ruolo di servizio:
--        · silvio_tool_commesse_generali   elenco con i numeri chiave
--        · silvio_tool_commessa_generale   una generale: scala, numeri, piano,
--                                          unità e vendite, avvisi, scadenze
--        · silvio_tool_scadenze_generali   garanzie, fine lavori, rogiti
--      Chi chiede (p_user_id) vede quello che vedrebbe nell'app: le funzioni
--      di lettura girano con la sua identità (generali_come_utente), quindi con
--      i suoi permessi su commesse, importi, costi e margini. I totali per
--      l'AI li fa generale_sintesi, con le regole di totaliGenerale
--      (src/lib/orders/commesseGenerali.ts) e riepilogoVendite
--      (src/lib/orders/generali/unitaConti.ts): se cambiano lì, cambiano qui.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Il piano economico in breve ──────────────────────────────────────────
-- Gli stessi conti della pagina, in SQL: a finire = scritto a mano, oppure
-- previsto − reale (mai sotto zero); stima finale = reale + a finire; le righe
-- fuori piano entrano col loro reale. Il capitale massimo previsto viene dal
-- flusso mensile delle voci. Versione: l'approvata, altrimenti la bozza.
-- p_costi / p_importi: quali righe reali può vedere chi chiede (come
-- commessa_generale_piano_reale); le fotografie passano true, true.
create or replace function public.generale_piano_numeri(p_generale_id uuid, p_costi boolean default true, p_importi boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_versione record;
  n record;
begin
  select x.id, x.numero, x.stato into v_versione
    from public.generale_piano_versioni x
   where x.generale_id = p_generale_id and x.stato in ('approvata', 'bozza')
   order by (x.stato = 'approvata') desc, x.numero desc
   limit 1;
  if not found then
    return null;
  end if;

  with r as materialized (
    select * from public.generale_piano_righe_abbinate(p_generale_id, v_versione.id, p_costi, p_importi)
  ),
  voci as (
    select w.id, w.tipo, w.importo, w.mese, w.durata_mesi, w.a_finire
      from public.generale_piano_voci w where w.versione_id = v_versione.id
  ),
  rv as (
    select r.voce_id, sum(r.importo) as reale from r where r.voce_id is not null group by r.voce_id
  ),
  stime as (
    select w.tipo, coalesce(rv.reale, 0) + coalesce(w.a_finire, greatest(w.importo - coalesce(rv.reale, 0), 0)) as stima
      from voci w left join rv on rv.voce_id = w.id
    union all
    select r.tipo, r.importo from r where r.voce_id is null
  ),
  flussi as (
    select (w.mese + make_interval(months => g.k))::date as mese,
           sum(case when w.tipo = 'ricavo' then 1 else -1 end * w.importo / w.durata_mesi) as netto
      from voci w
     cross join lateral generate_series(0, w.durata_mesi - 1) g(k)
     where w.mese is not null
     group by 1
  ),
  cumulato as (
    select sum(f.netto) over (order by f.mese) as c from flussi f
  )
  select coalesce((select sum(w.importo) from voci w where w.tipo = 'ricavo'), 0) as ricavi_previsti,
         coalesce((select sum(w.importo) from voci w where w.tipo = 'costo'), 0) as costi_previsti,
         coalesce((select sum(r.importo) from r where r.tipo = 'ricavo'), 0) as ricavi_reali,
         coalesce((select sum(r.importo) from r where r.tipo = 'costo'), 0) as costi_reali,
         coalesce((select sum(t.stima) from stime t where t.tipo = 'ricavo'), 0) as ricavi_stima,
         coalesce((select sum(t.stima) from stime t where t.tipo = 'costo'), 0) as costi_stima,
         greatest(0, -coalesce((select min(c.c) from cumulato c), 0)) as capitale_massimo_previsto,
         greatest(0, coalesce((select sum(r.importo) from r where r.tipo = 'costo'), 0)
                     - case when p_importi
                            then coalesce((select sum(i.importo) from public.generale_piano_incassi(p_generale_id) i), 0)
                            else 0 end) as capitale_investito
    into n;

  return jsonb_build_object(
    'versione_id', v_versione.id,
    'versione_numero', v_versione.numero,
    'versione_stato', v_versione.stato,
    'ricavi_previsti', round(n.ricavi_previsti, 2),
    'costi_previsti', round(n.costi_previsti, 2),
    'ricavi_reali', round(n.ricavi_reali, 2),
    'costi_reali', round(n.costi_reali, 2),
    'ricavi_stima', round(n.ricavi_stima, 2),
    'costi_stima', round(n.costi_stima, 2),
    'capitale_massimo_previsto', round(n.capitale_massimo_previsto, 2),
    'capitale_investito', round(n.capitale_investito, 2));
end;
$$;

revoke all on function public.generale_piano_numeri(uuid, boolean, boolean) from public, anon, authenticated;

-- La fotografia del mese legge gli stessi numeri (prima li calcolava qui).
create or replace function public.generale_piano_fotografa(p_generale_id uuid, p_mese date, p_origine text default 'automatica')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid;
  v jsonb;
begin
  select o.company_id into v_azienda
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_azienda is null then
    return false;
  end if;
  v := public.generale_piano_numeri(p_generale_id, true, true);
  if v is null then
    return false;
  end if;

  insert into public.generale_fotografie (
    company_id, generale_id, mese, versione_id, versione_numero, versione_stato,
    ricavi_previsti, costi_previsti, ricavi_reali, costi_reali, ricavi_stima, costi_stima,
    capitale_massimo_previsto, capitale_investito, origine
  )
  values (
    v_azienda, p_generale_id, date_trunc('month', p_mese)::date,
    (v ->> 'versione_id')::uuid, (v ->> 'versione_numero')::integer, v ->> 'versione_stato',
    (v ->> 'ricavi_previsti')::numeric, (v ->> 'costi_previsti')::numeric,
    (v ->> 'ricavi_reali')::numeric, (v ->> 'costi_reali')::numeric,
    (v ->> 'ricavi_stima')::numeric, (v ->> 'costi_stima')::numeric,
    (v ->> 'capitale_massimo_previsto')::numeric, (v ->> 'capitale_investito')::numeric,
    case when p_origine = 'manuale' then 'manuale' else 'automatica' end
  )
  on conflict (generale_id, mese) do update set
    versione_id = excluded.versione_id, versione_numero = excluded.versione_numero, versione_stato = excluded.versione_stato,
    ricavi_previsti = excluded.ricavi_previsti, costi_previsti = excluded.costi_previsti,
    ricavi_reali = excluded.ricavi_reali, costi_reali = excluded.costi_reali,
    ricavi_stima = excluded.ricavi_stima, costi_stima = excluded.costi_stima,
    capitale_massimo_previsto = excluded.capitale_massimo_previsto, capitale_investito = excluded.capitale_investito,
    origine = excluded.origine, updated_at = now();
  return true;
end;
$$;

revoke all on function public.generale_piano_fotografa(uuid, date, text) from public, anon, authenticated;

-- ── 2. Il cruscotto: tutte le generali in una chiamata ──────────────────────
-- Solo le generali che chi chiede vede nell'elenco commesse (can_see_order:
-- «solo le assegnate», «solo il mio magazzino»). Una generale che non si legge
-- non ferma le altre: arriva con «errore».
create or replace function public.cruscotto_commesse_generali(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_modelli text[];
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_generali jsonb := '[]'::jsonb;
  v_riepilogo jsonb;
  v_unita jsonb;
  v_piano jsonb;
  v_errore text;
  g record;
begin
  if v_uid is null then
    raise exception 'Accesso non autorizzato.' using errcode = '42501';
  end if;
  perform public.assert_company_access(p_company_id);
  if not public.has_permission_for_company(v_uid, 'can_view_orders', p_company_id) then
    raise exception 'Non hai il permesso di vedere le commesse.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(v_uid, 'can_view_order_amounts', p_company_id);
  v_costi := public.has_permission_for_company(v_uid, 'can_view_costs', p_company_id);
  v_margini := public.has_permission_for_company(v_uid, 'can_view_margins', p_company_id);

  select s.modelli_attivi into v_modelli
    from public.company_commesse_generali_settings s
   where s.company_id = p_company_id;

  for g in
    select o.id, o.order_code, cg.modello,
           not (coalesce(o.status, '') in ('completato', 'annullato', 'cancelled', 'canceled')
                or coalesce(o.fulfillment_status, '') = 'completed') as in_corso
      from public.commesse_generali cg
      join public.orders o on o.id = cg.order_id
     where cg.company_id = p_company_id
       and o.company_id = p_company_id
       and o.deleted_at is null
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
     order by o.created_at desc
     limit 200
  loop
    v_riepilogo := null; v_unita := null; v_piano := null; v_errore := null;
    begin
      v_riepilogo := public.commessa_generale_riepilogo(g.id);
      if g.modello in ('sviluppo', 'compravendita') then
        v_unita := public.generale_unita_elenco(g.id);
      end if;
      if v_margini then
        v_piano := public.generale_piano_numeri(g.id, v_costi, v_importi);
      end if;
    exception when others then
      v_errore := sqlerrm;
    end;
    v_generali := v_generali || jsonb_build_array(jsonb_build_object(
      'id', g.id, 'codice', g.order_code, 'modello', g.modello, 'in_corso', g.in_corso,
      'riepilogo', v_riepilogo, 'unita', v_unita, 'piano', v_piano, 'errore', v_errore));
  end loop;

  return jsonb_build_object(
    'attiva', coalesce(cardinality(v_modelli), 0) > 0,
    'modelli', to_jsonb(coalesce(v_modelli, '{}'::text[])),
    'permessi', jsonb_build_object('importi', v_importi, 'costi', v_costi, 'margini', v_margini),
    'generali', v_generali);
end;
$$;

revoke all on function public.cruscotto_commesse_generali(uuid) from public, anon;
grant execute on function public.cruscotto_commesse_generali(uuid) to authenticated;

-- ── 3. Silvio: chi chiede ───────────────────────────────────────────────────
-- Le funzioni di lettura della generale controllano auth.uid(). Silvio e il
-- connettore chiamano col ruolo di servizio, dove auth.uid() è vuoto: per la
-- durata della lettura si mette nella richiesta l'identità di chi chiede, poi
-- si rimette quella di prima. Restituisce le impostazioni da rimettere.
create or replace function public.generali_come_utente(p_user_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_prima jsonb := jsonb_build_object(
    'claims', current_setting('request.jwt.claims', true),
    'sub', current_setting('request.jwt.claim.sub', true));
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  return v_prima;
end;
$$;

create or replace function public.generali_rimetti_utente(p_prima jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', coalesce(p_prima ->> 'claims', ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(p_prima ->> 'sub', ''), true);
end;
$$;

revoke all on function public.generali_come_utente(uuid) from public, anon, authenticated;
revoke all on function public.generali_rimetti_utente(jsonb) from public, anon, authenticated;

-- Il cruscotto con gli occhi di chi chiede.
create or replace function public.generali_dati_per(p_company_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prima jsonb;
  v_dati jsonb;
begin
  if p_user_id is null then
    raise exception 'Serve l''utente che chiede.' using errcode = '22023';
  end if;
  v_prima := public.generali_come_utente(p_user_id);
  begin
    v_dati := public.cruscotto_commesse_generali(p_company_id);
  exception when others then
    perform public.generali_rimetti_utente(v_prima);
    raise;
  end;
  perform public.generali_rimetti_utente(v_prima);
  return v_dati;
end;
$$;

revoke all on function public.generali_dati_per(uuid, uuid) from public, anon, authenticated;

-- ── 4. I numeri chiave di una generale, per l'AI ────────────────────────────
-- Riceve un elemento di cruscotto_commesse_generali. Regole di totaliGenerale
-- e riepilogoVendite (vedi intestazione). null = non visibile con i permessi.
create or replace function public.generale_sintesi(p_g jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  r jsonb := nullif(p_g -> 'riepilogo', 'null'::jsonb);
  v_permessi jsonb := coalesce(p_g -> 'riepilogo' -> 'permessi', '{}'::jsonb);
  v_importi boolean := coalesce((v_permessi ->> 'importi')::boolean, false);
  v_costi boolean := coalesce((v_permessi ->> 'costi')::boolean, false);
  v_margini boolean := coalesce((v_permessi ->> 'margini')::boolean, false);
  v_figlie jsonb := coalesce(r -> 'figlie', '[]'::jsonb);
  v_n integer := jsonb_array_length(coalesce(r -> 'figlie', '[]'::jsonb));
  v_valore numeric := nullif(r -> 'generale' ->> 'valore', '')::numeric;
  v_fg jsonb := r -> 'fatture_generale';
  t record;
  v record;
  p jsonb := nullif(p_g -> 'piano', 'null'::jsonb);
  v_elenco jsonb := nullif(p_g -> 'unita', 'null'::jsonb);
  v_vendite jsonb;
  v_piano jsonb;
begin
  if r is null then
    return null;
  end if;

  select round(sum((f ->> 'importo')::numeric), 2) as assegnato,
         round(sum((f ->> 'eseguito')::numeric), 2) as eseguito,
         round(sum((f ->> 'fatturato')::numeric) + coalesce((v_fg ->> 'fatturato')::numeric, 0), 2) as fatturato,
         round(sum((f ->> 'incassato')::numeric) + coalesce((v_fg ->> 'incassato')::numeric, 0), 2) as incassato,
         round(sum(coalesce((f ->> 'costo')::numeric, 0)), 2) as costo,
         round(sum(coalesce((f ->> 'margine')::numeric, 0)), 2) as margine,
         sum(greatest(0, coalesce((f ->> 'importo')::numeric, 0))) as peso,
         sum(coalesce((f ->> 'avanzamento')::numeric, 0) * greatest(0, coalesce((f ->> 'importo')::numeric, 0))) as avanz_pesato,
         avg(coalesce((f ->> 'avanzamento')::numeric, 0)) as avanz_medio,
         count(*) filter (where coalesce((f ->> 'divisa')::boolean, false) = false
                            and (f ->> 'margine')::numeric < 0) as in_perdita
    into t
    from jsonb_array_elements(v_figlie) f;

  if v_n = 0 then
    t.assegnato := 0; t.eseguito := 0;
    t.fatturato := coalesce((v_fg ->> 'fatturato')::numeric, 0);
    t.incassato := coalesce((v_fg ->> 'incassato')::numeric, 0);
  end if;

  if v_elenco is not null then
    with u as (
      select f -> 'unita' as s,
             coalesce(f -> 'unita' ->> 'stato', 'libera') as stato,
             case when jsonb_typeof(f -> 'unita') = 'object' then (f -> 'unita' ->> 'prezzo_listino')::numeric
                  when (f ->> 'importo')::numeric > 0 then (f ->> 'importo')::numeric end as listino,
             (f -> 'unita' ->> 'prezzo_trattato')::numeric as trattato,
             (f -> 'unita' ->> 'prezzo_rogito')::numeric as rogito,
             (select coalesce(sum((m ->> 'importo')::numeric), 0) from jsonb_array_elements(coalesce(f -> 'unita' -> 'movimenti', '[]'::jsonb)) m
               where m ->> 'tipo' in ('caparra', 'acconto', 'saldo')) as incassato,
             (select coalesce(sum((m ->> 'importo')::numeric), 0) from jsonb_array_elements(coalesce(f -> 'unita' -> 'movimenti', '[]'::jsonb)) m
               where m ->> 'tipo' = 'permuta') as permute
        from jsonb_array_elements(coalesce(v_elenco -> 'figlie', '[]'::jsonb)) f
       where nullif(f -> 'unita' ->> 'divisa_il', '') is null
    ),
    c as (
      select u.*, coalesce(u.rogito, u.trattato, u.listino) as prezzo from u
    )
    select count(*) as unita,
           count(*) filter (where stato in ('compromesso', 'rogitata')) as vendute,
           count(*) filter (where stato = 'rogitata') as rogitate,
           count(*) filter (where stato = 'prenotata') as prenotate,
           count(*) filter (where stato = 'libera') as libere,
           round(coalesce(sum(prezzo) filter (where stato in ('compromesso', 'rogitata')), 0), 2) as venduto,
           round(coalesce(sum(coalesce(trattato, listino)) filter (where stato = 'prenotata'), 0), 2) as prenotato,
           round(coalesce(sum(listino) filter (where stato = 'libera'), 0), 2) as in_vendita,
           round(coalesce(sum(incassato), 0), 2) as incassato,
           round(coalesce(sum(permute), 0), 2) as permute,
           round(coalesce(sum(greatest(0, prezzo - incassato - permute)) filter (where stato in ('compromesso', 'rogitata')), 0), 2) as da_incassare
      into v
      from c;
    v_vendite := jsonb_build_object(
      'unita', v.unita, 'vendute', v.vendute, 'di_cui_rogitate', v.rogitate,
      'prenotate', v.prenotate, 'libere', v.libere,
      'venduto_eur', case when v_importi then v.venduto end,
      'prenotato_eur', case when v_importi then v.prenotato end,
      'in_vendita_a_listino_eur', case when v_importi then v.in_vendita end,
      'incassato_dalle_vendite_eur', case when v_importi then v.incassato end,
      'permute_eur', case when v_importi then v.permute end,
      'da_incassare_sulle_vendite_eur', case when v_importi then v.da_incassare end);
  end if;

  if p is not null then
    v_piano := jsonb_build_object(
      'versione', 'n. ' || (p ->> 'versione_numero') || ' (' || (p ->> 'versione_stato') || ')',
      'ricavi_previsti_eur', (p ->> 'ricavi_previsti')::numeric,
      'costi_previsti_eur', (p ->> 'costi_previsti')::numeric,
      'margine_previsto_eur', (p ->> 'ricavi_previsti')::numeric - (p ->> 'costi_previsti')::numeric,
      'ricavi_stima_finale_eur', (p ->> 'ricavi_stima')::numeric,
      'costi_stima_finale_eur', (p ->> 'costi_stima')::numeric,
      'margine_a_finire_eur', (p ->> 'ricavi_stima')::numeric - (p ->> 'costi_stima')::numeric,
      'capitale_impegnato_oggi_eur', (p ->> 'capitale_investito')::numeric,
      'capitale_massimo_previsto_eur', (p ->> 'capitale_massimo_previsto')::numeric);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'commesse_dentro', v_n,
    'valore_aggiornato_eur', case when v_importi then v_valore end,
    'assegnato_alle_commesse_eur', case when v_importi then t.assegnato end,
    'da_assegnare_eur', case when v_importi and v_valore is not null then round(v_valore - t.assegnato, 2) end,
    'eseguito_eur', case when v_importi then t.eseguito end,
    'da_eseguire_eur', case when v_importi then round(greatest(0, coalesce(v_valore, t.assegnato) - t.eseguito), 2) end,
    'fatturato_eur', case when v_importi then t.fatturato end,
    'incassato_eur', case when v_importi then t.incassato end,
    'da_incassare_sul_fatturato_eur', case when v_importi then round(greatest(0, t.fatturato - t.incassato), 2) end,
    'costi_registrati_eur', case when v_costi and v_n > 0 then t.costo end,
    'margine_attuale_commesse_eur', case when v_margini and v_n > 0 then t.margine end,
    'commesse_in_perdita', case when v_margini then t.in_perdita end,
    'avanzamento_pct', case when v_n = 0 then 0
                            when t.peso > 0 then round(t.avanz_pesato / t.peso, 1)
                            else round(t.avanz_medio, 1) end,
    'vendite', v_vendite,
    'piano_economico', v_piano));
end;
$$;

revoke all on function public.generale_sintesi(jsonb) from public, anon, authenticated;

-- Il nome del modello come lo dice l'app.
create or replace function public.generale_nome_modello(p_modello text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_modello when 'appalto' then 'Appalto a contratto'
                        when 'sviluppo' then 'Sviluppo immobiliare'
                        when 'compravendita' then 'Compra, ristruttura, vendi'
                        else p_modello end
$$;

revoke all on function public.generale_nome_modello(text) from public, anon, authenticated;

-- ── 5. Le scadenze delle generali ───────────────────────────────────────────
-- Garanzie non svincolate, fine lavori del contratto (con le proroghe, finché
-- i lavori non sono ultimati), rogiti previsti dei compromessi. Entro
-- p_giorni, più quelle già passate. Legge le tabelle con i permessi di chi
-- chiede (serve vedere gli importi: le stesse policy delle tabelle).
create or replace function public.generale_scadenze(p_company_id uuid, p_user_id uuid, p_generali uuid[], p_giorni integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_entro date := (now() at time zone 'Europe/Rome')::date + greatest(0, least(coalesce(p_giorni, 60), 730));
begin
  if not (public.has_permission_for_company(p_user_id, 'can_view_orders', p_company_id)
          and public.has_permission_for_company(p_user_id, 'can_view_order_amounts', p_company_id)) then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(s.riga order by s.data, s.ordine)
      from (
        select gg.scadenza as data, 1 as ordine, jsonb_strip_nulls(jsonb_build_object(
                 'commessa', o.order_code, 'generale', o.description, 'tipo', 'garanzia',
                 'cosa', case gg.tipo when 'cauzione_definitiva' then 'Cauzione definitiva'
                                      when 'garanzia_anticipazione' then 'Garanzia dell''anticipazione'
                                      when 'car' then 'Polizza CAR'
                                      when 'rata_saldo' then 'Garanzia della rata di saldo'
                                      else 'Altra garanzia' end,
                 'garante', nullif(btrim(gg.garante), ''), 'numero', nullif(btrim(gg.numero), ''),
                 'importo_eur', gg.importo,
                 'scade_il', gg.scadenza, 'giorni', gg.scadenza - v_oggi,
                 'scaduta', gg.scadenza < v_oggi)) as riga
          from public.generale_contratto_garanzie gg
          join public.orders o on o.id = gg.generale_id
         where gg.company_id = p_company_id and gg.generale_id = any(p_generali)
           and gg.svincolata_il is null and gg.scadenza is not null and gg.scadenza <= v_entro
        union all
        select f.fine, 2, jsonb_build_object(
                 'commessa', f.order_code, 'generale', f.description, 'tipo', 'fine_lavori',
                 'cosa', case when f.fine < v_oggi then 'Lavori oltre la fine prevista del contratto'
                              else 'Fine lavori prevista dal contratto' end,
                 'scade_il', f.fine, 'giorni', f.fine - v_oggi,
                 'giorni_di_proroga', f.proroghe, 'scaduta', f.fine < v_oggi)
          from (
            select o.order_code, o.description, c.data_fine_prevista + coalesce(a.giorni, 0) as fine, coalesce(a.giorni, 0) as proroghe
              from public.generale_contratti c
              join public.orders o on o.id = c.generale_id
              left join lateral (select sum(x.giorni_proroga)::integer as giorni from public.generale_contratto_atti x
                                  where x.generale_id = c.generale_id) a on true
             where c.company_id = p_company_id and c.generale_id = any(p_generali)
               and c.data_fine_prevista is not null and c.data_ultimazione is null
          ) f
         where f.fine <= v_entro
        union all
        select u.rogito_previsto, 3, jsonb_strip_nulls(jsonb_build_object(
                 'commessa', g.order_code, 'generale', g.description, 'tipo', 'rogito',
                 'cosa', 'Rogito previsto dell''unità ' || coalesce(nullif(btrim(u.sigla), ''), f.order_code, 'senza sigla'),
                 'unita_commessa', f.order_code,
                 'prezzo_eur', coalesce(u.prezzo_rogito, u.prezzo_trattato, u.prezzo_listino),
                 'scade_il', u.rogito_previsto, 'giorni', u.rogito_previsto - v_oggi,
                 'scaduta', u.rogito_previsto < v_oggi))
          from public.unita_immobiliari u
          join public.orders f on f.id = u.order_id and f.deleted_at is null
          join public.orders g on g.id = f.commessa_generale_id
         where u.company_id = p_company_id and f.commessa_generale_id = any(p_generali)
           and u.stato_vendita = 'compromesso' and u.divisa_il is null
           and u.rogito_previsto is not null and u.rogito_previsto <= v_entro
      ) s), '[]'::jsonb);
end;
$$;

revoke all on function public.generale_scadenze(uuid, uuid, uuid[], integer) from public, anon, authenticated;

-- Le generali di p_dati che corrispondono a p_cerca: codice esatto, oppure
-- nome, codice o cliente che contengono il testo (senza accenti né maiuscole).
create or replace function public.generali_trova(p_dati jsonb, p_cerca text)
returns setof jsonb
language sql
immutable
set search_path = public
as $$
  with g as (
    select e, lower(btrim(coalesce(p_cerca, ''))) as q
      from jsonb_array_elements(coalesce(p_dati -> 'generali', '[]'::jsonb)) e
  )
  select g.e from g
   where g.q = ''
      or lower(coalesce(g.e ->> 'codice', '')) = g.q
      or (not exists (select 1 from g g2 where lower(coalesce(g2.e ->> 'codice', '')) = g2.q)
          and (lower(coalesce(g.e -> 'riepilogo' -> 'generale' ->> 'nome', '')) like '%' || g.q || '%'
               or lower(coalesce(g.e ->> 'codice', '')) like '%' || g.q || '%'
               or lower(coalesce(g.e -> 'riepilogo' -> 'generale' ->> 'cliente', '')) like '%' || g.q || '%'));
$$;

revoke all on function public.generali_trova(jsonb, text) from public, anon, authenticated;

-- ── 6. Gli strumenti di Silvio ──────────────────────────────────────────────
-- Elenco delle generali con i numeri chiave e il totale del portafoglio.
create or replace function public.silvio_tool_commesse_generali(
  p_company_id uuid, p_user_id uuid, p_cerca text default null, p_anche_chiuse boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dati jsonb;
  v_righe jsonb;
begin
  v_dati := public.generali_dati_per(p_company_id, p_user_id);
  if not coalesce((v_dati ->> 'attiva')::boolean, false) and jsonb_array_length(v_dati -> 'generali') = 0 then
    return jsonb_build_object('ok', true, 'generali', '[]'::jsonb,
      'nota', 'L''azienda non usa le commesse generali (si accendono da Impostazioni → Commesse).');
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'commessa', e ->> 'codice',
           'nome', e -> 'riepilogo' -> 'generale' ->> 'nome',
           'tipo', public.generale_nome_modello(e ->> 'modello'),
           'cliente', e -> 'riepilogo' -> 'generale' ->> 'cliente',
           'in_corso', (e ->> 'in_corso')::boolean,
           'numeri', public.generale_sintesi(e),
           'errore', case when e ->> 'errore' is not null then 'Numeri non disponibili per questa generale.' end))
         order by (e ->> 'in_corso')::boolean desc, e ->> 'codice'), '[]'::jsonb)
    into v_righe
    from public.generali_trova(v_dati, p_cerca) e
   where coalesce(p_anche_chiuse, false) or (e ->> 'in_corso')::boolean;

  return jsonb_build_object(
    'ok', true,
    'generali', v_righe,
    'totale_appalti_in_corso', (
      select jsonb_strip_nulls(jsonb_build_object(
               'appalti', count(*),
               'valore_aggiornato_eur', sum((s ->> 'valore_aggiornato_eur')::numeric),
               'eseguito_eur', sum((s ->> 'eseguito_eur')::numeric),
               'da_eseguire_eur', sum((s ->> 'da_eseguire_eur')::numeric),
               'fatturato_eur', sum((s ->> 'fatturato_eur')::numeric),
               'da_incassare_sul_fatturato_eur', sum((s ->> 'da_incassare_sul_fatturato_eur')::numeric)))
        from (select public.generale_sintesi(e) as s from jsonb_array_elements(v_dati -> 'generali') e
               where e ->> 'modello' = 'appalto' and (e ->> 'in_corso')::boolean) x),
    'nota', 'Una commessa generale raccoglie altre commesse: un appalto e i suoi ordini di lavoro, oppure un''operazione immobiliare e le sue unità. Il valore della generale NON si somma a quello delle commesse dentro: è lo stesso lavoro visto dall''alto. Il margine a finire viene dal piano economico (stima finale), quando c''è. Importi IVA esclusa.');
end;
$$;

-- Una generale: numeri, scala delle commesse dentro, piano, unità, avvisi, scadenze.
create or replace function public.silvio_tool_commessa_generale(
  p_company_id uuid, p_user_id uuid, p_cerca text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dati jsonb;
  v_trovate jsonb[];
  e jsonb;
  r jsonb;
  s jsonb;
  v_avvisi jsonb := '[]'::jsonb;
  v_unita jsonb;
  v_def_figlie text;
begin
  if nullif(btrim(coalesce(p_cerca, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Indica la commessa generale: codice, nome o cliente.');
  end if;
  v_dati := public.generali_dati_per(p_company_id, p_user_id);
  select array_agg(x) into v_trovate from public.generali_trova(v_dati, p_cerca) x;
  if v_trovate is null then
    return jsonb_build_object('ok', false,
      'error', 'Nessuna commessa generale corrisponde a «' || btrim(p_cerca) || '». Usa commesse_generali per l''elenco.');
  end if;
  if array_length(v_trovate, 1) > 1 then
    return jsonb_build_object('ok', false,
      'error', 'Più commesse generali corrispondono: chiedi quale.',
      'candidate', (select jsonb_agg(jsonb_build_object(
                       'commessa', t ->> 'codice', 'nome', t -> 'riepilogo' -> 'generale' ->> 'nome',
                       'tipo', public.generale_nome_modello(t ->> 'modello'), 'in_corso', (t ->> 'in_corso')::boolean))
                      from unnest(v_trovate) t));
  end if;

  e := v_trovate[1];
  if e ->> 'errore' is not null or nullif(e -> 'riepilogo', 'null'::jsonb) is null then
    return jsonb_build_object('ok', false, 'error', 'Non riesco a leggere la commessa generale ' || coalesce(e ->> 'codice', '') || '.');
  end if;
  r := e -> 'riepilogo';
  s := public.generale_sintesi(e);
  v_def_figlie := case when e ->> 'modello' = 'appalto' then 'ordini di lavoro' else 'unità' end;

  -- «Cosa richiede attenzione» (avvisiGenerale), più il piano.
  if jsonb_array_length(coalesce(r -> 'figlie', '[]'::jsonb)) = 0 then
    v_avvisi := v_avvisi || to_jsonb('Non ci sono ancora ' || v_def_figlie || ' dentro.');
  end if;
  if coalesce((r -> 'permessi' ->> 'importi')::boolean, false) and r -> 'generale' ->> 'valore' is null then
    v_avvisi := v_avvisi || to_jsonb(case when e ->> 'modello' = 'appalto' then 'Manca il valore del contratto.'
                                          else 'Mancano i ricavi previsti.' end);
  end if;
  if (s ->> 'da_assegnare_eur')::numeric < 0 then
    v_avvisi := v_avvisi || to_jsonb('Le commesse dentro superano il valore di '
      || to_char(-(s ->> 'da_assegnare_eur')::numeric, 'FM999G999G999G990') || ' €.');
  end if;
  if coalesce((s ->> 'commesse_in_perdita')::integer, 0) > 0 then
    v_avvisi := v_avvisi || to_jsonb((s ->> 'commesse_in_perdita') || ' ' || v_def_figlie || ' in perdita.');
  end if;
  if coalesce((r -> 'permessi' ->> 'margini')::boolean, false) and nullif(e -> 'piano', 'null'::jsonb) is null then
    v_avvisi := v_avvisi || to_jsonb('Il piano economico non è ancora impostato: niente margine a finire né capitale.'::text);
  end if;

  if nullif(e -> 'unita', 'null'::jsonb) is not null then
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'commessa', f ->> 'codice',
             'sigla', coalesce(f -> 'unita' ->> 'sigla', f ->> 'codice'),
             'tipologia', f -> 'unita' ->> 'tipologia',
             'stato', coalesce(f -> 'unita' ->> 'stato', 'libera'),
             'prezzo_eur', coalesce((f -> 'unita' ->> 'prezzo_rogito')::numeric, (f -> 'unita' ->> 'prezzo_trattato')::numeric,
                                    (f -> 'unita' ->> 'prezzo_listino')::numeric,
                                    case when jsonb_typeof(f -> 'unita') is distinct from 'object' then nullif((f ->> 'importo')::numeric, 0) end),
             'incassato_eur', (select sum((m ->> 'importo')::numeric) from jsonb_array_elements(coalesce(f -> 'unita' -> 'movimenti', '[]'::jsonb)) m
                                where m ->> 'tipo' in ('caparra', 'acconto', 'saldo')),
             'acquirente', f -> 'unita' ->> 'acquirente',
             'rogito_previsto', f -> 'unita' ->> 'rogito_previsto',
             'data_rogito', f -> 'unita' ->> 'data_rogito')) order by f ->> 'codice')
      into v_unita
      from jsonb_array_elements(coalesce(e -> 'unita' -> 'figlie', '[]'::jsonb)) f
     where nullif(f -> 'unita' ->> 'divisa_il', '') is null;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'commessa', e ->> 'codice',
    'nome', r -> 'generale' ->> 'nome',
    'tipo', public.generale_nome_modello(e ->> 'modello'),
    'cliente', r -> 'generale' ->> 'cliente',
    'in_corso', (e ->> 'in_corso')::boolean,
    'numeri', s,
    'commesse_dentro', (
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'commessa', f ->> 'codice', 'nome', f ->> 'nome', 'stato', coalesce(f ->> 'stato_nome', f ->> 'stato'),
               'avanzamento_pct', (f ->> 'avanzamento')::numeric,
               'importo_eur', (f ->> 'importo')::numeric, 'eseguito_eur', (f ->> 'eseguito')::numeric,
               'fatturato_eur', (f ->> 'fatturato')::numeric, 'incassato_eur', (f ->> 'incassato')::numeric,
               'costi_eur', (f ->> 'costo')::numeric, 'margine_eur', (f ->> 'margine')::numeric,
               'fine_lavori', f ->> 'fine')))
        from (select f from jsonb_array_elements(coalesce(r -> 'figlie', '[]'::jsonb)) f limit 60) x),
    'unita', v_unita,
    'avvisi', v_avvisi,
    'scadenze', public.generale_scadenze(p_company_id, p_user_id, array[(e ->> 'id')::uuid], 60),
    'nota', 'Importi IVA esclusa. Il valore della generale non si somma a quello delle commesse dentro. Il margine a finire è la stima finale del piano economico; il margine attuale è quello delle commesse dentro, senza i costi comuni registrati sulla generale.'));
end;
$$;

-- Le scadenze di tutte le generali in corso.
create or replace function public.silvio_tool_scadenze_generali(
  p_company_id uuid, p_user_id uuid, p_giorni integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dati jsonb;
  v_ids uuid[];
  v_scadenze jsonb;
begin
  v_dati := public.generali_dati_per(p_company_id, p_user_id);
  select array_agg((e ->> 'id')::uuid) into v_ids
    from jsonb_array_elements(v_dati -> 'generali') e
   where (e ->> 'in_corso')::boolean;
  if v_ids is null then
    return jsonb_build_object('ok', true, 'scadenze', '[]'::jsonb, 'nota', 'Nessuna commessa generale in corso.');
  end if;
  v_scadenze := public.generale_scadenze(p_company_id, p_user_id, v_ids, p_giorni);
  if v_scadenze is null then
    return jsonb_build_object('ok', false,
      'error', 'Le garanzie e le scadenze dei contratti non sono visibili con i permessi di chi chiede: servono commesse e importi.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'entro_giorni', greatest(0, least(coalesce(p_giorni, 60), 730)),
    'scadenze', v_scadenze,
    'nota', 'Garanzie non svincolate, fine lavori dei contratti (con le proroghe) e rogiti previsti dei compromessi. Le voci «scaduta» sono già passate: dirle per prime.');
end;
$$;

revoke all on function public.silvio_tool_commesse_generali(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.silvio_tool_commessa_generale(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.silvio_tool_scadenze_generali(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.silvio_tool_commesse_generali(uuid, uuid, text, boolean) to service_role;
grant execute on function public.silvio_tool_commessa_generale(uuid, uuid, text) to service_role;
grant execute on function public.silvio_tool_scadenze_generali(uuid, uuid, integer) to service_role;
