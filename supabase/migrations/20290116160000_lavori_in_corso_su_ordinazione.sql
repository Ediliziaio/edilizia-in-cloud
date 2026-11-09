-- I lavori in corso su ordinazione (9 novembre 2026).
--
-- Un'impresa edile incassa a SAL e fattura a scaglioni: a fine anno ha sempre
-- lavoro eseguito e non ancora fatturato. In bilancio quel lavoro è una
-- rimanenza, e la sua variazione è una voce del conto economico (la 02, che
-- fin qui era zero con un commento che diceva «stub»). Senza di essa il
-- margine di un'impresa che cresce è sistematicamente più basso del vero: i
-- costi del cantiere sono già dentro, il ricavo arriva l'anno dopo.
--
-- Come si misura il lavoro eseguito. Le fasi della commessa hanno l'importo
-- venduto e la percentuale di avanzamento: il lavoro maturato è la somma di
-- importo × percentuale. Se le fasi non hanno importi ma hanno un avanzamento,
-- si usa il valore della commessa per l'avanzamento medio delle fasi — più
-- grossolano, e la vista lo dichiara nella colonna `base`.
--
-- Che cosa NON si fa, di proposito:
-- - niente stime dove non c'è avanzamento. Una commessa senza fasi, o con
--   tutte le percentuali a zero, resta fuori dal conto: non vale «zero lavoro
--   in corso», vale «non lo sappiamo». Sui dati veri sono la maggioranza in
--   più di un'azienda, e dirlo è l'unica risposta utile — la funzione riporta
--   quante commesse copre e quante no.
-- - la tabella `sal` è vuota su tutto il progetto: nessuno la usa ancora, e un
--   ramo di codice su una tabella vuota è un ramo mai provato. Quando i SAL
--   esisteranno saranno una base migliore di questa.
-- - la variazione entra nel conto economico SOLO se la rimanenza iniziale è
--   stata registrata. L'avanzamento delle fasi è un dato di oggi: la rimanenza
--   al 1° gennaio non si può ricostruire, e darla per zero gonfierebbe il
--   margine di tutto il lavoro cominciato negli anni prima. Finché non c'è, la
--   voce 02 resta zero come prima e la pagina spiega che cosa manca.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Il lavoro in corso, commessa per commessa ──────────────────────────────
create or replace view public.v_cg_lavori_in_corso as
select q.company_id,
       q.order_id,
       q.quote_number,
       q.client_name,
       q.status,
       q.base,
       q.valore_commessa,
       round(q.maturato, 2) as maturato,
       round(q.fatturato, 2) as fatturato,
       round(greatest(q.maturato - q.fatturato, 0), 2) as lavori_in_corso,
       -- Il contrario: fatturato più di quello che si è eseguito. È un acconto
       -- preso dal cliente, cioè un debito, non un ricavo.
       round(greatest(q.fatturato - q.maturato, 0), 2) as anticipi
  from (
    select o.company_id,
           o.id as order_id,
           o.quote_number,
           o.client_name,
           o.status,
           coalesce(o.total_amount, 0) as valore_commessa,
           case when fs.importi > 0 then 'fasi_importi' else 'fasi_percentuale' end as base,
           case when fs.importi > 0
                then fs.maturato_importi
                else coalesce(o.total_amount, 0) * fs.pct_media / 100.0
           end as maturato,
           coalesce(ft.imponibile, 0) as fatturato
      from orders o
      join (
        select f.order_id,
               sum(coalesce(f.importo_venduto, 0)) as importi,
               sum(coalesce(f.importo_venduto, 0)
                   * least(greatest(coalesce(f.percentuale, 0), 0), 100) / 100.0) as maturato_importi,
               avg(least(greatest(coalesce(f.percentuale, 0), 0), 100)) as pct_media,
               max(coalesce(f.percentuale, 0)) as pct_max
          from order_work_phases f
         group by f.order_id
      ) fs on fs.order_id = o.id
      left join (
        select i.order_id,
               sum(case when i.document_type = 'credit_note' then -1 else 1 end
                   * (coalesce(i.total, 0) - coalesce(i.tax_amount, 0))) as imponibile
          from invoices i
         where i.order_id is not null
           and i.deleted_at is null
           and (i.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
         group by i.order_id
      ) ft on ft.order_id = o.id
     where o.deleted_at is null
       and coalesce(o.status, '') <> 'bozza'
       and coalesce(o.total_amount, 0) > 0
       -- Serve una base d'avanzamento: senza, non si inventa.
       and (fs.importi > 0 or fs.pct_max > 0)
  ) q;

alter view public.v_cg_lavori_in_corso set (security_invoker = on);
grant select on public.v_cg_lavori_in_corso to authenticated;

comment on view public.v_cg_lavori_in_corso is
  'Lavoro eseguito e non ancora fatturato, commessa per commessa, alla data di oggi. Solo le commesse con un avanzamento: le altre restano fuori, perché non sapere non è zero (09/11/2026).';

-- ── Il quadro per l'azienda, con la copertura ──────────────────────────────
create or replace function public.cg_lavori_in_corso(
  p_company_id uuid default null,
  p_anno integer default extract(year from current_date)::integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_con_base integer := 0;
  v_maturato numeric(14,2) := 0;
  v_fatturato numeric(14,2) := 0;
  v_lavori numeric(14,2) := 0;
  v_anticipi numeric(14,2) := 0;
  v_senza_base integer := 0;
  v_valore_senza_base numeric(14,2) := 0;
  v_rim_anno numeric(14,2);
  v_rim_prec numeric(14,2);
begin
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if v_company_id <> public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato: company_id non autorizzato';
  end if;

  select count(*), coalesce(sum(maturato), 0), coalesce(sum(fatturato), 0),
         coalesce(sum(lavori_in_corso), 0), coalesce(sum(anticipi), 0)
    into v_con_base, v_maturato, v_fatturato, v_lavori, v_anticipi
    from public.v_cg_lavori_in_corso
   where company_id = v_company_id;

  -- Le commesse vive che non si possono misurare: è la parte che non sappiamo.
  select count(*), coalesce(sum(coalesce(o.total_amount, 0)), 0)
    into v_senza_base, v_valore_senza_base
    from orders o
   where o.company_id = v_company_id
     and o.deleted_at is null
     and coalesce(o.status, '') <> 'bozza'
     and coalesce(o.total_amount, 0) > 0
     and not exists (
       select 1 from public.v_cg_lavori_in_corso l where l.order_id = o.id
     );

  select importo into v_rim_anno
    from cg_rimanenze_lavori
   where company_id = v_company_id and esercizio = p_anno;

  select importo into v_rim_prec
    from cg_rimanenze_lavori
   where company_id = v_company_id and esercizio = p_anno - 1;

  return jsonb_build_object(
    'anno', p_anno,
    'commesse_misurate', v_con_base,
    'maturato', v_maturato,
    'fatturato', v_fatturato,
    'lavori_in_corso', v_lavori,
    'anticipi', v_anticipi,
    'commesse_senza_avanzamento', v_senza_base,
    'valore_senza_avanzamento', v_valore_senza_base,
    'rimanenza_registrata', v_rim_anno,
    'rimanenza_iniziale', v_rim_prec,
    -- La variazione entra nel conto economico solo con la rimanenza iniziale.
    'variazione_nel_ce', public.cg_variazione_lavori_in_corso(v_company_id, p_anno)
  );
end;
$$;

-- ── La variazione che entra nel conto economico ────────────────────────────
-- Zero finché la rimanenza iniziale non è registrata: è la differenza fra un
-- numero prudente e un numero inventato.
create or replace function public.cg_variazione_lavori_in_corso(
  p_company_id uuid,
  p_anno integer
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_inizio numeric(14,2);
  v_fine numeric(14,2);
begin
  if p_company_id is null or p_anno is null then
    return 0;
  end if;

  select importo into v_inizio
    from cg_rimanenze_lavori
   where company_id = p_company_id and esercizio = p_anno - 1;

  -- Senza rimanenza iniziale non si sa quanto di quel lavoro è di quest'anno.
  if v_inizio is null then
    return 0;
  end if;

  select importo into v_fine
    from cg_rimanenze_lavori
   where company_id = p_company_id and esercizio = p_anno;

  -- Per l'anno in corso la rimanenza finale non è ancora stata registrata:
  -- si usa il valore di oggi, che è il dato migliore che abbiamo.
  if v_fine is null then
    if p_anno = extract(year from current_date)::integer then
      select coalesce(sum(lavori_in_corso), 0) into v_fine
        from public.v_cg_lavori_in_corso
       where company_id = p_company_id;
    else
      return 0;
    end if;
  end if;

  return coalesce(v_fine, 0) - v_inizio;
end;
$$;

revoke all on function public.cg_lavori_in_corso(uuid, integer) from public, anon;
grant execute on function public.cg_lavori_in_corso(uuid, integer) to authenticated;
revoke all on function public.cg_variazione_lavori_in_corso(uuid, integer) from public, anon, authenticated;

comment on function public.cg_lavori_in_corso is
  'Lavoro eseguito e non fatturato dell''azienda, con quante commesse copre e quante no, e la variazione che entra nel conto economico (09/11/2026).';
comment on function public.cg_variazione_lavori_in_corso is
  'Variazione delle rimanenze lavori in corso per il conto economico. Zero se la rimanenza iniziale non è registrata: non si deduce, si registra (09/11/2026).';

-- ── Registrare la rimanenza di un esercizio ───────────────────────────────
create or replace function public.cg_registra_rimanenza_lavori(
  p_esercizio integer,
  p_importo numeric default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_importo numeric(14,2);
  v_fonte text;
begin
  v_company_id := public.get_my_company_id();
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if p_esercizio is null or p_esercizio < 2000 or p_esercizio > 2100 then
    raise exception 'esercizio non valido';
  end if;

  if p_importo is null then
    -- Senza importo si registra quello che il sistema calcola adesso.
    select coalesce(sum(lavori_in_corso), 0) into v_importo
      from public.v_cg_lavori_in_corso
     where company_id = v_company_id;
    v_fonte := 'calcolata';
  else
    if p_importo < 0 then
      raise exception 'la rimanenza non può essere negativa';
    end if;
    v_importo := p_importo;
    v_fonte := 'manuale';
  end if;

  insert into cg_rimanenze_lavori (company_id, esercizio, importo, fonte, note, created_by)
  values (v_company_id, p_esercizio, v_importo, v_fonte, p_note, auth.uid())
  on conflict (company_id, esercizio) do update
     set importo = excluded.importo,
         fonte = excluded.fonte,
         note = excluded.note,
         updated_at = now();

  return jsonb_build_object('esercizio', p_esercizio, 'importo', v_importo, 'fonte', v_fonte);
end;
$$;

revoke all on function public.cg_registra_rimanenza_lavori(integer, numeric, text) from public, anon;
grant execute on function public.cg_registra_rimanenza_lavori(integer, numeric, text) to authenticated;

comment on function public.cg_registra_rimanenza_lavori is
  'Registra la rimanenza dei lavori in corso di un esercizio: l''importo scritto da chi chiude il bilancio, o quello calcolato adesso se non lo si passa (09/11/2026).';

-- ── La voce 02 del conto economico ────────────────────────────────────────
-- Si riscrive solo quella riga della funzione, prendendola com'è adesso. Se
-- non si trova più, la migrazione si ferma invece di riscrivere a caso.
do $$
declare
  v_def text;
  v_vecchio text := 'v_var_rim_lic := 0; v_var_rim_mag := 0;';
  v_nuovo text := 'v_var_rim_lic := public.cg_variazione_lavori_in_corso(v_company_id, p_anno); v_var_rim_mag := 0;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'cg_get_conto_economico_riclassificato';

  if v_def is null then
    raise exception 'cg_get_conto_economico_riclassificato non esiste';
  end if;
  if position(v_nuovo in v_def) > 0 then
    return;
  end if;
  if position(v_vecchio in v_def) = 0 then
    raise exception 'La riga delle rimanenze è cambiata: controllala a mano invece di riscriverla';
  end if;

  execute replace(v_def, v_vecchio, v_nuovo);
end $$;
