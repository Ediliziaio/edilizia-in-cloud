-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali — Piano economico (tappa 2)
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- (§2.2 Piano economico e Costi comuni, §B, §4 tappa 2).
--
-- Per l'appalto è il budget, per lo sviluppo il business plan: voci di ricavo
-- e di costo con il mese in cui entra o esce il denaro, confrontate con il
-- reale che l'app ha già (consuntivo delle commesse, ordini d'acquisto, spese
-- e fatture ricevute portate sulle commesse, fatture emesse).
--
--   · generale_piano_versioni  bozza → approvata (bloccata) → superata quando
--     se ne approva un'altra. Una sola bozza e una sola approvata per generale.
--   · generale_piano_voci      le voci di una versione. Si scrivono dal
--     browser (policy); su una versione approvata si può cambiare soltanto
--     l'«a finire», che è una stima e non il budget.
--   · generale_fotografie      uno scatto dei numeri principali a fine mese
--     (job pg_cron solo SQL, migrazione 20281031111000), per vedere come
--     cambia la stima finale nel tempo.
--
-- Il reale si abbina alle voci QUI, in SQL, con una regola sola: la usano sia
-- la pagina (commessa_generale_piano_reale) sia lo scatto di fine mese, così i
-- due non possono dare numeri diversi. La regola, in ordine:
--   0. la categoria di costo della spesa è tra quelle scelte sulla voce;
--   1. la categoria della voce è quella della riga (materiali → Materiali);
--   2. ripiego: una voce «Costruzione» raccoglie materiali, manodopera,
--      subappalti, noli, sicurezza e imprevisti; «Spese generali» allacci e
--      spese non riconosciute;
--   3. «Altri costi» / «Altri ricavi» raccolgono tutto il resto.
-- A parità di regola vince la voce della stessa commessa figlia, poi l'ordine.
-- Una riga che nessuna voce raccoglie resta «fuori piano», ma è contata.
--
-- Importi al netto dell'IVA. Ogni euro una volta sola: il costo di una
-- commessa è il suo consuntivo (v_ordine_marginalita), riga per riga; se le
-- righe non arrivano al consuntivo (rientri in magazzino) la differenza è una
-- riga di rettifica.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Versioni ─────────────────────────────────────────────────────────────
create table if not exists public.generale_piano_versioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  numero integer not null,
  stato text not null default 'bozza',
  nota text,
  approvata_at timestamptz,
  approvata_da uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_piano_versioni_stato check (stato in ('bozza', 'approvata', 'superata')),
  constraint generale_piano_versioni_numero unique (generale_id, numero)
);

comment on table public.generale_piano_versioni is
  'Versioni del piano economico di una commessa generale: bozza → approvata (bloccata) → superata.';

create unique index if not exists generale_piano_versioni_una_bozza
  on public.generale_piano_versioni (generale_id) where stato = 'bozza';
create unique index if not exists generale_piano_versioni_una_approvata
  on public.generale_piano_versioni (generale_id) where stato = 'approvata';
create index if not exists generale_piano_versioni_company_idx on public.generale_piano_versioni (company_id);

-- ── 2. Voci ─────────────────────────────────────────────────────────────────
create table if not exists public.generale_piano_voci (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  versione_id uuid not null references public.generale_piano_versioni(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  tipo text not null,
  categoria text not null,
  descrizione text not null default '',
  importo numeric(14,2) not null default 0,
  mese date,
  durata_mesi integer not null default 1,
  figlia_id uuid references public.orders(id) on delete set null,
  categorie_costo text[] not null default '{}',
  a_finire numeric(14,2),
  nota text,
  ordine integer not null default 0,
  origine_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_piano_voci_tipo check (tipo in ('ricavo', 'costo')),
  constraint generale_piano_voci_categoria check (
    (tipo = 'ricavo' and categoria in ('vendite', 'lavori', 'altri_ricavi'))
    or (tipo = 'costo' and categoria in ('terreno', 'oneri', 'progettazione', 'costruzione', 'materiali', 'manodopera',
                                         'subappalti', 'noli', 'sicurezza', 'allacci', 'commercializzazione',
                                         'finanziari', 'generali', 'imprevisti', 'iva', 'altri_costi'))),
  constraint generale_piano_voci_importo check (importo >= 0),
  constraint generale_piano_voci_a_finire check (a_finire is null or a_finire >= 0),
  constraint generale_piano_voci_durata check (durata_mesi between 1 and 120),
  constraint generale_piano_voci_mese check (mese is null or extract(day from mese) = 1),
  constraint generale_piano_voci_descrizione check (char_length(descrizione) <= 300)
);

comment on table public.generale_piano_voci is
  'Voci di ricavo e di costo di una versione del piano economico di una commessa generale. Importi al netto dell''IVA.';
comment on column public.generale_piano_voci.mese is
  'Primo giorno del mese in cui il denaro entra o esce; con durata_mesi > 1 l''importo si divide in parti uguali sui mesi.';
comment on column public.generale_piano_voci.categorie_costo is
  'Categorie di costo dell''azienda (company_costs.category, cost_categories.name, normalizzate) che questa voce raccoglie per prime.';
comment on column public.generale_piano_voci.a_finire is
  'Stima a finire scritta a mano. Vuota = previsto meno reale, mai sotto zero. Modificabile anche sulla versione approvata.';
comment on column public.generale_piano_voci.origine_id is
  'La voce della versione approvata da cui questa è stata copiata (per il confronto con l''approvato).';

create index if not exists generale_piano_voci_versione_idx on public.generale_piano_voci (versione_id, ordine);
create index if not exists generale_piano_voci_company_idx on public.generale_piano_voci (company_id);
create index if not exists generale_piano_voci_generale_idx on public.generale_piano_voci (generale_id);
create index if not exists generale_piano_voci_figlia_idx on public.generale_piano_voci (figlia_id) where figlia_id is not null;

-- ── 3. Fotografie mensili ───────────────────────────────────────────────────
create table if not exists public.generale_fotografie (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  mese date not null,
  versione_id uuid references public.generale_piano_versioni(id) on delete set null,
  versione_numero integer,
  versione_stato text,
  ricavi_previsti numeric(14,2) not null default 0,
  costi_previsti numeric(14,2) not null default 0,
  ricavi_reali numeric(14,2) not null default 0,
  costi_reali numeric(14,2) not null default 0,
  ricavi_stima numeric(14,2) not null default 0,
  costi_stima numeric(14,2) not null default 0,
  capitale_massimo_previsto numeric(14,2) not null default 0,
  capitale_investito numeric(14,2) not null default 0,
  origine text not null default 'automatica',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_fotografie_mese check (extract(day from mese) = 1),
  constraint generale_fotografie_origine check (origine in ('automatica', 'manuale')),
  constraint generale_fotografie_una_al_mese unique (generale_id, mese)
);

comment on table public.generale_fotografie is
  'Scatto mensile dei numeri del piano economico di una commessa generale (previsto, reale, stima finale, capitale). Lo scrive il job generale-piano-fotografie a fine mese.';

create index if not exists generale_fotografie_company_idx on public.generale_fotografie (company_id);
create index if not exists generale_fotografie_versione_idx on public.generale_fotografie (versione_id) where versione_id is not null;

-- ── 4. Coerenza delle voci e blocco della versione approvata ────────────────
create or replace function public.generale_piano_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  -- Come normalizzaCategoria() del browser: «Materiali edili» → materiali_edili.
  select btrim(regexp_replace(translate(lower(coalesce(p, '')),
                                        'àáâäãåèéêëìíîïòóôöõùúûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
                              '[^a-z0-9]+', '_', 'g'), '_');
$$;

create or replace function public.generale_piano_voci_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v record;
begin
  -- Una cancellazione a cascata (commessa purgata, figlia cancellata) non si blocca.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.versione_id is distinct from old.versione_id then
    raise exception 'Una voce non si sposta da una versione all''altra.' using errcode = '22023';
  end if;
  select x.company_id, x.generale_id, x.stato into v
    from public.generale_piano_versioni x
   where x.id = new.versione_id;
  if not found then
    raise exception 'Versione del piano non trovata.' using errcode = 'P0002';
  end if;
  new.company_id := v.company_id;
  new.generale_id := v.generale_id;

  if v.stato <> 'bozza' then
    if tg_op = 'INSERT' or v.stato = 'superata'
       or (new.tipo, new.categoria, new.descrizione, new.importo, new.mese, new.durata_mesi,
           new.figlia_id, new.categorie_costo, new.ordine, new.origine_id)
          is distinct from
          (old.tipo, old.categoria, old.descrizione, old.importo, old.mese, old.durata_mesi,
           old.figlia_id, old.categorie_costo, old.ordine, old.origine_id) then
      raise exception 'Questa versione del piano è approvata e bloccata: per cambiarla crea una nuova revisione.'
        using errcode = '23514';
    end if;
  end if;

  if new.mese is not null then
    new.mese := date_trunc('month', new.mese)::date;
  end if;
  new.descrizione := btrim(coalesce(new.descrizione, ''));
  new.categorie_costo := coalesce((
    select array_agg(distinct c order by c)
      from (select public.generale_piano_norm(x) as c from unnest(new.categorie_costo) x) s
     where c <> ''), '{}');

  if new.figlia_id is not null
     and (tg_op = 'INSERT' or new.figlia_id is distinct from old.figlia_id)
     and not exists (
       select 1 from public.orders o
        where o.id = new.figlia_id and o.commessa_generale_id = v.generale_id and o.deleted_at is null
     ) then
    raise exception 'La commessa scelta non fa parte di questa commessa generale.' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_generale_piano_voci_coerente on public.generale_piano_voci;
create trigger trg_generale_piano_voci_coerente
  before insert or update on public.generale_piano_voci
  for each row execute function public.generale_piano_voci_coerente();

-- ── 5. Lettura: policy; scrittura delle voci: policy; versioni: RPC ─────────
alter table public.generale_piano_versioni enable row level security;
alter table public.generale_piano_voci enable row level security;
alter table public.generale_fotografie enable row level security;

revoke all on public.generale_piano_versioni, public.generale_piano_voci, public.generale_fotografie from anon, authenticated;
grant select, delete on public.generale_piano_versioni to authenticated;
grant select, insert, update, delete on public.generale_piano_voci to authenticated;
grant select on public.generale_fotografie to authenticated;

-- Il piano mostra margini: lo vede chi vede i margini dell'azienda.
drop policy if exists generale_piano_versioni_lettura on public.generale_piano_versioni;
create policy generale_piano_versioni_lettura on public.generale_piano_versioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

-- Si butta via solo una bozza: l'approvato resta per sempre.
drop policy if exists generale_piano_versioni_elimina_bozza on public.generale_piano_versioni;
create policy generale_piano_versioni_elimina_bozza on public.generale_piano_versioni for delete to authenticated
  using (stato = 'bozza'
         and public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_piano_voci_lettura on public.generale_piano_voci;
create policy generale_piano_voci_lettura on public.generale_piano_voci for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

-- company_id e generale_id li scrive il trigger dalla versione (le policy guardano la riga dopo il trigger).
drop policy if exists generale_piano_voci_inserimento on public.generale_piano_voci;
create policy generale_piano_voci_inserimento on public.generale_piano_voci for insert to authenticated
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
              and exists (select 1 from public.generale_piano_versioni x
                           where x.id = versione_id and x.stato = 'bozza'));

drop policy if exists generale_piano_voci_modifica on public.generale_piano_voci;
create policy generale_piano_voci_modifica on public.generale_piano_voci for update to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id))
  with check (public.puo_modificare_commessa(generale_id)
              and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_piano_voci_elimina on public.generale_piano_voci;
create policy generale_piano_voci_elimina on public.generale_piano_voci for delete to authenticated
  using (public.puo_modificare_commessa(generale_id)
         and public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
         and exists (select 1 from public.generale_piano_versioni x
                      where x.id = versione_id and x.stato = 'bozza'));

drop policy if exists generale_fotografie_lettura on public.generale_fotografie;
create policy generale_fotografie_lettura on public.generale_fotografie for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

-- ── 6. Da una riga reale alla voce ──────────────────────────────────────────
-- La categoria di una spesa (testo libero: «materiali_edili», «Trasporti»,
-- «INPS»…) diventa una delle chiavi del piano. Ciò che non si riconosce è «altro».
create or replace function public.generale_piano_chiave_costo(p_categoria text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when c = '' then 'altro'
    when c ~ '(^|_)iva(_|$)' then 'iva'
    when c ~ 'consulenza_lavoro|commercialist|paghe|affitt|pernottament' then 'generali'
    when c ~ 'terren|notai|rogit|compravendit|immobil' then 'terreno'
    when c ~ 'oneri|permess|concession|urbanizzaz|diritti|(^|_)imu(_|$)|tass|tribut|catast|imposte' then 'oneri'
    when c ~ 'progett|direzione_lavori|profession|tecnic|geometr|ingegner|architett|consulen|collaud|perizi' then 'progettazione'
    when c ~ 'subappalt|squadr|cottim|manodopera_estern|decorator|idraulic|elettricist|murator|cartongess|imbianchin|posator' then 'subappalti'
    when c ~ 'stipend|salari|personale|(^|_)inps|(^|_)inail|(^|_)tfr(_|$)|manodopera|dipendent|contribut' then 'manodopera'
    when c ~ 'material|merci|acquist|fornitur|calcestruzz|acciai|ferrament|edil|cement|laterizi|legname|profili|finestre|serrament|isolament|tapparell|zanzarier|impiant' then 'materiali'
    when c ~ 'trasport|nolegg|(^|_)nol[io](_|$)|mezz|veicol|carburant|leasing|attrezzatur|ponteggi|logistic' then 'noli'
    when c ~ 'sicurezz|(^|_)dpi(_|$)' then 'sicurezza'
    when c ~ 'allacc|utenz|(^|_)enel(_|$)|acqua|(^|_)gas(_|$)|energia|telefon' then 'allacci'
    when c ~ 'provvigion|marketing|pubblicit|(^|_)adv(_|$)|agenzi|commercializz|vendit' then 'commercializzazione'
    when c ~ 'interess|mutu[oi]|banc|fideiussion|finanz|canone_c_c|bollo|commission' then 'finanziari'
    when c ~ 'imprevist|errori|danni|sinistr' then 'imprevisti'
    when c ~ 'assicuraz|cancelleri|software|struttura|servizi|generali|manutenz|rifiut|formazion|trasfert|viaggi|pasto|sosta' then 'generali'
    else 'altro'
  end
  from (select public.generale_piano_norm(p_categoria) as c) x;
$$;

-- Quanto bene una voce raccoglie una riga: 0 = scelta sulla voce, 1 = stessa
-- categoria, 2 = ripiego, 3 = «Altri costi/ricavi». null = non la raccoglie.
create or replace function public.generale_piano_rango(
  p_categoria text, p_categorie_costo text[], p_chiave text, p_categoria_reale text
)
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when coalesce(p_categoria_reale, '') <> '' and p_categoria_reale = any (coalesce(p_categorie_costo, '{}')) then 0
    when p_categoria = p_chiave then 1
    when p_chiave = 'ricavi' and p_categoria in ('vendite', 'lavori') then 1
    when p_categoria = 'costruzione' and p_chiave in ('materiali', 'manodopera', 'subappalti', 'noli', 'sicurezza', 'imprevisti') then 2
    when p_categoria = 'generali' and p_chiave in ('allacci', 'altro') then 2
    when p_categoria in ('altri_costi', 'altri_ricavi') then 3
  end;
$$;

-- Le righe del reale: costi della generale e delle figlie, riga per riga, e
-- fatture emesse al netto dell'IVA e delle note di credito. Nessun controllo
-- di permesso qui: la chiamano solo le funzioni sotto, che lo fanno.
create or replace function public.generale_piano_righe_reali(p_generale_id uuid, p_costi boolean, p_ricavi boolean)
returns table (
  id text, fonte text, rif_id uuid, order_id uuid, data date, tipo text,
  chiave text, categoria text, descrizione text, importo numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s as materialized (
    select o.id, o.company_id
      from public.orders o
     where o.deleted_at is null
       and (o.id = p_generale_id or o.commessa_generale_id = p_generale_id)
  ),
  m as materialized (
    select v.id, v.consuntivo, v.costo_materiali_magazzino, v.costo_rimborsi_km
      from public.v_ordine_marginalita v
     where p_costi and v.id in (select s.id from s)
  ),
  costi as materialized (
    -- Spese portate sulla commessa: anche le fatture ricevute contabilizzate.
    select 'spesa'::text as fonte, cc.id as rif_id, cc.order_id,
           coalesce(cc.paid_date, cc.due_date, cc.created_at::date) as data,
           public.generale_piano_chiave_costo(cc.category) as chiave, cc.category as categoria,
           concat_ws(' · ', coalesce(nullif(btrim(cc.name), ''), 'Spesa'), su.name,
                     (select 'fattura ' || string_agg(fr.numero_fattura, ', ')
                        from public.fatture_ricevute fr
                       where fr.company_cost_id = cc.id and fr.company_id = cc.company_id)) as descrizione,
           coalesce(cc.amount, 0) as importo
      from public.company_costs cc
      join s on s.id = cc.order_id
      left join public.suppliers su on su.id = cc.supplier_id
     where p_costi
       and cc.purchase_order_id is null and cc.order_external_team_id is null
       and (cc.allocations is null or jsonb_typeof(cc.allocations) <> 'array' or jsonb_array_length(cc.allocations) = 0)
    union all
    -- Spese divise tra più commesse: la parte di ognuna.
    select 'spesa_divisa', cc.id, (a.value ->> 'order_id')::uuid,
           coalesce(cc.paid_date, cc.due_date, cc.created_at::date),
           public.generale_piano_chiave_costo(cc.category), cc.category,
           concat_ws(' · ', coalesce(nullif(btrim(cc.name), ''), 'Spesa'), su.name, (a.value ->> 'pct') || '%'),
           coalesce(cc.amount, 0) * (a.value ->> 'pct')::numeric / 100
      from public.company_costs cc
      cross join lateral jsonb_array_elements(cc.allocations) a(value)
      left join public.suppliers su on su.id = cc.supplier_id
     where p_costi
       and cc.company_id in (select s.company_id from s)
       and jsonb_typeof(cc.allocations) = 'array' and jsonb_array_length(cc.allocations) > 0
       and cc.purchase_order_id is null and cc.order_external_team_id is null
       and (a.value ->> 'order_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
       and (a.value ->> 'pct') ~ '^[0-9]+(\.[0-9]+)?$'
       and (a.value ->> 'order_id')::uuid in (select s.id from s)
    union all
    -- Ordini d'acquisto: stesso conto di marginalita_costo_oda.
    select 'oda', po.id, po.order_id, coalesce(po.issue_date, po.created_at::date),
           'materiali', null::text,
           concat_ws(' · ', 'OdA ' || coalesce(po.oda_number, ''), su.name),
           case when cct.tot is null and qf.tot is null then coalesce(po.subtotal, 0)
                else greatest(0, greatest(coalesce(po.subtotal, 0), coalesce(cct.tot, 0) + coalesce(qf.tot, 0) + coalesce(nc.tot, 0))
                                 - coalesce(nc.tot, 0)) end
      from public.purchase_orders po
      join s on s.id = po.order_id and s.company_id = po.company_id
      left join public.suppliers su on su.id = po.supplier_id
      left join lateral (select sum(coalesce(c.amount, 0)) as tot
                           from public.company_costs c
                          where c.purchase_order_id = po.id and c.company_id = po.company_id) cct on true
      left join lateral (select sum(q.importo) as tot
                           from public.fattura_ricevuta_ordini q
                           join public.fatture_ricevute fr on fr.id = q.fattura_id and fr.company_id = q.company_id
                          where q.purchase_order_id = po.id and q.company_id = po.company_id
                            and fr.stato = 'contabilizzata' and fr.company_cost_id is not null) qf on true
      left join lateral (select sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                           from public.fatture_ricevute fr
                           join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                          where c.purchase_order_id = po.id and c.company_id = po.company_id
                            and fr.tipo_documento in ('TD04', 'passive_credit_note')) nc on true
     where p_costi and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
    union all
    select 'magazzino', null::uuid, m.id, null::date, 'materiali', null::text,
           'Materiali presi dal magazzino', m.costo_materiali_magazzino
      from m
    union all
    select 'ore', oe.id, oe.order_id, coalesce(oe.paid_date, oe.created_at::date), 'manodopera', null::text,
           concat_ws(' · ', 'Ore', nullif(btrim(concat_ws(' ', e.first_name, e.last_name)), ''),
                     case when oe.hours_worked is not null then trim(to_char(oe.hours_worked, 'FM999G990D0')) || ' h' end),
           coalesce(oe.total_cost, 0)
      from public.order_employees oe
      join s on s.id = oe.order_id
      left join public.employees e on e.id = oe.employee_id
     where p_costi
    union all
    select 'squadra', ot.id, ot.order_id, coalesce(ot.paid_date, ot.payment_date, ot.created_at::date), 'subappalti', null::text,
           concat_ws(' · ', 'Squadra esterna', et.name),
           coalesce(ot.total_cost, 0) / (1 + coalesce(ot.vat_rate, 22) / 100)
      from public.order_external_teams ot
      join s on s.id = ot.order_id
      left join public.external_teams et on et.id = ot.external_team_id
     where p_costi
    union all
    select 'errore', oe.id, oe.order_id, coalesce(oe.error_date, oe.created_at::date), 'imprevisti', null::text,
           concat_ws(' · ', 'Errore', nullif(btrim(oe.description), '')), coalesce(oe.amount, 0)
      from public.order_errors oe
      join s on s.id = oe.order_id
     where p_costi
    union all
    select 'provvigione', osp.id, osp.order_id, coalesce(osp.paid_date, osp.payment_expected_date, osp.created_at::date),
           'commercializzazione', null::text,
           concat_ws(' · ', 'Provvigione', nullif(btrim(concat_ws(' ', sp.first_name, sp.last_name)), '')),
           greatest(greatest(coalesce(osp.commission_amount, 0), 0) - greatest(coalesce(osp.deduction_amount, 0), 0), 0)
      from public.order_salespeople osp
      join s on s.id = osp.order_id
      left join public.salespeople sp on sp.id = osp.salesperson_id
     where p_costi
    union all
    select 'rimborsi_km', null::uuid, m.id, null::date, 'manodopera', null::text,
           'Rimborsi chilometrici approvati', m.costo_rimborsi_km
      from m
  ),
  rettifiche as (
    -- In pratica sono i materiali degli OdA rientrati in magazzino: si contano coi materiali.
    select 'rettifica'::text as fonte, null::uuid as rif_id, m.id as order_id, null::date as data,
           'materiali'::text as chiave, null::text as categoria,
           'Materiali rientrati in magazzino e arrotondamenti (differenza col consuntivo della commessa)'::text as descrizione,
           m.consuntivo - coalesce(t.tot, 0) as importo
      from m
      left join (select c.order_id, sum(c.importo) as tot from costi c group by c.order_id) t on t.order_id = m.id
     where abs(m.consuntivo - coalesce(t.tot, 0)) >= 0.01
  ),
  ricavi as (
    select 'fattura'::text as fonte, i.id as rif_id, i.order_id, i.issue_date as data,
           'ricavi'::text as chiave, null::text as categoria,
           concat_ws(' · ', 'Fattura ' || coalesce(i.invoice_number, ''), nullif(btrim(i.client_company_name), '')) as descrizione,
           coalesce(i.subtotal, coalesce(i.total, 0) - coalesce(i.tax_amount, 0))
             - coalesce((select sum(coalesce(nc.subtotal, coalesce(nc.total, 0) - coalesce(nc.tax_amount, 0)))
                           from public.invoices nc
                          where nc.credited_invoice_id = i.id
                            and nc.document_type in ('credit_note', 'nota_credito')
                            and nc.deleted_at is null
                            and coalesce(nc.status, '') <> 'cancelled'), 0) as importo
      from public.invoices i
      join s on s.id = i.order_id and s.company_id = i.company_id
     where p_ricavi
       and i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
  )
  select x.fonte || ':' || coalesce(x.rif_id::text, '-') || ':' || x.order_id::text,
         x.fonte, x.rif_id, x.order_id, x.data, 'costo'::text,
         x.chiave, x.categoria, x.descrizione, round(x.importo, 2)
    from (select * from costi union all select * from rettifiche) x
   where round(x.importo, 2) <> 0
  union all
  select r.fonte || ':' || r.rif_id::text || ':' || r.order_id::text,
         r.fonte, r.rif_id, r.order_id, r.data, 'ricavo'::text,
         r.chiave, r.categoria, r.descrizione, round(r.importo, 2)
    from ricavi r
   where round(r.importo, 2) <> 0;
$$;

-- Gli incassi delle fatture emesse, al netto dell'IVA (stessa proporzione della fattura).
create or replace function public.generale_piano_incassi(p_generale_id uuid)
returns table (fattura_id uuid, data date, importo numeric)
language sql
stable
security definer
set search_path = public
as $$
  with s as materialized (
    select o.id, o.company_id
      from public.orders o
     where o.deleted_at is null
       and (o.id = p_generale_id or o.commessa_generale_id = p_generale_id)
  ),
  f as materialized (
    select i.id, i.status, i.issue_date, i.due_date, i.payment_date,
           coalesce(i.total, 0) as totale, coalesce(i.paid_amount, 0) as pagato,
           case when coalesce(i.total, 0) > 0
                then coalesce(i.subtotal, i.total - coalesce(i.tax_amount, 0)) / i.total else 1 end as quota_netta
      from public.invoices i
      join s on s.id = i.order_id and s.company_id = i.company_id
     where i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
  ),
  p as (
    select ip.invoice_id, ip.payment_date, sum(coalesce(ip.amount, 0)) as importo
      from public.invoice_payments ip
      join f on f.id = ip.invoice_id
     group by ip.invoice_id, ip.payment_date
  )
  select p.invoice_id, p.payment_date, round(p.importo * f.quota_netta, 2)
    from p join f on f.id = p.invoice_id
   where round(p.importo * f.quota_netta, 2) <> 0
  union all
  select f.id, coalesce(f.payment_date, f.due_date, f.issue_date),
         round((case when f.status in ('paid', 'pagata') then f.totale - public.nc_collegate_importo(f.id)
                     else least(f.pagato, f.totale) end) * f.quota_netta, 2)
    from f
   where not exists (select 1 from p where p.invoice_id = f.id)
     and (f.status in ('paid', 'pagata') or f.pagato > 0);
$$;

-- Le righe del reale con la voce che le raccoglie (null = fuori piano).
create or replace function public.generale_piano_righe_abbinate(
  p_generale_id uuid, p_versione_id uuid, p_costi boolean, p_ricavi boolean
)
returns table (
  id text, fonte text, rif_id uuid, order_id uuid, data date, tipo text,
  chiave text, categoria text, descrizione text, importo numeric, voce_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.fonte, r.rif_id, r.order_id, r.data, r.tipo, r.chiave, r.categoria, r.descrizione, r.importo,
         (select v.id
            from public.generale_piano_voci v
           cross join lateral (
             select public.generale_piano_rango(v.categoria, v.categorie_costo, r.chiave, public.generale_piano_norm(r.categoria)) as rango
           ) k
           where v.versione_id = p_versione_id
             and v.tipo = r.tipo
             and k.rango is not null
             and (v.figlia_id is null or v.figlia_id = r.order_id)
           order by (k.rango = 3), (k.rango > 0), (v.figlia_id is null), k.rango, v.ordine, v.created_at, v.id
           limit 1)
    from public.generale_piano_righe_reali(p_generale_id, p_costi, p_ricavi) r;
$$;

-- ── 7. La lettura per la pagina ─────────────────────────────────────────────
create or replace function public.commessa_generale_piano_reale(p_generale_id uuid, p_versione_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_costi boolean;
  v_importi boolean;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda) then
    raise exception 'Non hai il permesso di vedere il piano economico di questa commessa.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g where g.order_id = p_generale_id) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if p_versione_id is not null and not exists (
    select 1 from public.generale_piano_versioni x where x.id = p_versione_id and x.generale_id = p_generale_id
  ) then
    raise exception 'Versione del piano non trovata.' using errcode = 'P0002';
  end if;
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  return jsonb_build_object(
    'oggi', (now() at time zone 'Europe/Rome')::date,
    'permessi', jsonb_build_object('costi', v_costi, 'importi', v_importi),
    'righe', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'fonte', r.fonte, 'rif_id', r.rif_id, 'order_id', r.order_id, 'data', r.data,
               'tipo', r.tipo, 'chiave', r.chiave, 'categoria', r.categoria, 'descrizione', r.descrizione,
               'importo', r.importo, 'voce_id', r.voce_id) order by r.data nulls last, r.id)
        from public.generale_piano_righe_abbinate(p_generale_id, p_versione_id, v_costi, v_importi) r), '[]'::jsonb),
    'incassi', case when v_importi then coalesce((
      select jsonb_agg(jsonb_build_object('fattura_id', x.fattura_id, 'data', x.data, 'importo', x.importo) order by x.data nulls last)
        from public.generale_piano_incassi(p_generale_id) x), '[]'::jsonb) else '[]'::jsonb end,
    -- Le categorie di costo che l'azienda usa già: si possono agganciare alle voci.
    'categorie', coalesce((
      select jsonb_agg(jsonb_build_object('chiave', c.chiave, 'etichetta', c.etichetta) order by c.etichetta)
        from (select public.generale_piano_norm(t.n) as chiave, min(t.n) as etichetta
                from (select cc.category as n from public.company_costs cc
                       where cc.company_id = v_azienda and nullif(btrim(cc.category), '') is not null
                      union all
                      select ct.name from public.cost_categories ct
                       where ct.company_id = v_azienda and nullif(btrim(ct.name), '') is not null) t
               group by 1
              having public.generale_piano_norm(min(t.n)) <> ''
               limit 300) c), '[]'::jsonb)
  );
end;
$$;

-- ── 8. Versioni: nuova (prima o revisione) e approvazione ───────────────────
-- Se c'è già una bozza la restituisce; se c'è un approvato lo copia (revisione);
-- altrimenti crea la prima versione con le voci di partenza passate dal browser.
create or replace function public.generale_piano_nuova_versione(p_generale_id uuid, p_voci jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_id uuid;
  v_approvata uuid;
  v_numero integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.puo_modificare_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda) then
    raise exception 'Non hai il permesso di modificare il piano economico.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g where g.order_id = p_generale_id) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_voci) = 'array' and jsonb_array_length(p_voci) > 300 then
    raise exception 'Troppe voci in una volta: al massimo 300.' using errcode = '22023';
  end if;
  -- Due clic insieme non creano due bozze.
  perform pg_advisory_xact_lock(hashtextextended('generale_piano:' || p_generale_id::text, 0));

  select x.id into v_id from public.generale_piano_versioni x where x.generale_id = p_generale_id and x.stato = 'bozza';
  if v_id is not null then
    return v_id;
  end if;
  select x.id into v_approvata from public.generale_piano_versioni x where x.generale_id = p_generale_id and x.stato = 'approvata';
  select coalesce(max(x.numero), 0) + 1 into v_numero from public.generale_piano_versioni x where x.generale_id = p_generale_id;

  insert into public.generale_piano_versioni (company_id, generale_id, numero, stato, created_by)
  values (v_azienda, p_generale_id, v_numero, 'bozza', auth.uid())
  returning id into v_id;

  if v_approvata is not null then
    insert into public.generale_piano_voci (company_id, versione_id, generale_id, tipo, categoria, descrizione, importo,
                                            mese, durata_mesi, figlia_id, categorie_costo, a_finire, nota, ordine, origine_id)
    select a.company_id, v_id, a.generale_id, a.tipo, a.categoria, a.descrizione, a.importo, a.mese, a.durata_mesi,
           -- una figlia uscita dalla generale non segue la revisione
           case when exists (select 1 from public.orders o where o.id = a.figlia_id
                                and o.commessa_generale_id = p_generale_id and o.deleted_at is null)
                then a.figlia_id end,
           a.categorie_costo, a.a_finire, a.nota, a.ordine, a.id
      from public.generale_piano_voci a
     where a.versione_id = v_approvata;
  elsif jsonb_typeof(p_voci) = 'array' then
    insert into public.generale_piano_voci (company_id, versione_id, generale_id, tipo, categoria, descrizione, importo,
                                            mese, durata_mesi, ordine)
    select v_azienda, v_id, p_generale_id, x.tipo, x.categoria, coalesce(x.descrizione, ''), coalesce(x.importo, 0),
           x.mese, greatest(1, least(120, coalesce(x.durata_mesi, 1))), coalesce(x.ordine, n.ord::integer)
      from jsonb_array_elements(p_voci) with ordinality n(el, ord)
      cross join lateral jsonb_to_record(n.el)
        as x(tipo text, categoria text, descrizione text, importo numeric, mese date, durata_mesi integer, ordine integer);
  end if;
  return v_id;
end;
$$;

create or replace function public.generale_piano_approva(p_versione_id uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v record;
  v_stato text;
begin
  select x.id, x.generale_id, x.company_id, x.stato into v
    from public.generale_piano_versioni x where x.id = p_versione_id;
  if not found then
    raise exception 'Versione del piano non trovata.' using errcode = 'P0002';
  end if;
  if auth.uid() is null
     or not public.puo_modificare_commessa(v.generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v.company_id) then
    raise exception 'Non hai il permesso di approvare il piano economico.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generale_piano:' || v.generale_id::text, 0));
  -- Rilettura dopo il lucchetto: due approvazioni insieme non passano entrambe.
  select x.stato into v_stato from public.generale_piano_versioni x where x.id = p_versione_id;
  if v_stato is distinct from 'bozza' then
    raise exception 'Questa versione è già approvata.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.generale_piano_voci w where w.versione_id = p_versione_id) then
    raise exception 'Il piano è vuoto: aggiungi almeno una voce prima di approvarlo.' using errcode = '22023';
  end if;

  update public.generale_piano_versioni
     set stato = 'superata', updated_at = now()
   where generale_id = v.generale_id and stato = 'approvata';
  update public.generale_piano_versioni
     set stato = 'approvata', approvata_at = now(), approvata_da = auth.uid(),
         nota = coalesce(nullif(btrim(p_nota), ''), nota), updated_at = now()
   where id = p_versione_id;
end;
$$;

-- ── 9. Fotografie ───────────────────────────────────────────────────────────
-- Gli stessi conti della pagina, in SQL: a finire = scritto a mano, oppure
-- previsto − reale (mai sotto zero); stima finale = reale + a finire; le righe
-- fuori piano entrano col loro reale. Il capitale massimo previsto viene dal
-- flusso mensile delle voci (importo diviso sui mesi di durata).
create or replace function public.generale_piano_fotografa(p_generale_id uuid, p_mese date, p_origine text default 'automatica')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid;
  v_versione record;
  n record;
begin
  select o.company_id into v_azienda
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_azienda is null then
    return false;
  end if;
  select x.id, x.numero, x.stato into v_versione
    from public.generale_piano_versioni x
   where x.generale_id = p_generale_id and x.stato in ('approvata', 'bozza')
   order by (x.stato = 'approvata') desc, x.numero desc
   limit 1;
  if not found then
    return false;
  end if;

  with r as materialized (
    select * from public.generale_piano_righe_abbinate(p_generale_id, v_versione.id, true, true)
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
                     - coalesce((select sum(i.importo) from public.generale_piano_incassi(p_generale_id) i), 0)) as capitale_investito
    into n;

  insert into public.generale_fotografie (
    company_id, generale_id, mese, versione_id, versione_numero, versione_stato,
    ricavi_previsti, costi_previsti, ricavi_reali, costi_reali, ricavi_stima, costi_stima,
    capitale_massimo_previsto, capitale_investito, origine
  )
  values (
    v_azienda, p_generale_id, date_trunc('month', p_mese)::date, v_versione.id, v_versione.numero, v_versione.stato,
    round(n.ricavi_previsti, 2), round(n.costi_previsti, 2), round(n.ricavi_reali, 2), round(n.costi_reali, 2),
    round(n.ricavi_stima, 2), round(n.costi_stima, 2), round(n.capitale_massimo_previsto, 2), round(n.capitale_investito, 2),
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

-- «Scatta ora» dalla pagina: lo scatto del mese in corso, rifatto con i numeri di adesso.
create or replace function public.generale_piano_fotografa_ora(p_generale_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null
     or not public.puo_modificare_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda) then
    raise exception 'Non hai il permesso di aggiornare il piano economico.' using errcode = '42501';
  end if;
  return public.generale_piano_fotografa(
    p_generale_id, date_trunc('month', (now() at time zone 'Europe/Rome')::date)::date, 'manuale');
end;
$$;

-- Il job di fine mese (vedi 20281031111000): gira dal 28 al 31 e scatta solo
-- l'ultimo giorno del mese (ora di Roma). p_forza = scatta comunque (prove).
create or replace function public.generale_piano_fotografie_mensili(p_forza boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
set statement_timeout = '120s'
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_fatte integer := 0;
  g record;
begin
  if not p_forza and extract(day from v_oggi + 1) <> 1 then
    return 0;
  end if;
  for g in
    select distinct x.generale_id
      from public.generale_piano_versioni x
      join public.orders o on o.id = x.generale_id and o.deleted_at is null
     where x.stato in ('approvata', 'bozza')
  loop
    begin
      if public.generale_piano_fotografa(g.generale_id, date_trunc('month', v_oggi)::date, 'automatica') then
        v_fatte := v_fatte + 1;
      end if;
    exception when others then
      -- Una generale che non torna non ferma le altre.
      raise log 'generale_piano_fotografa (%): %', g.generale_id, sqlerrm;
    end;
  end loop;
  return v_fatte;
end;
$$;

-- ── 10. Chi può chiamare cosa ───────────────────────────────────────────────
revoke all on function public.generale_piano_norm(text) from public, anon, authenticated;
revoke all on function public.generale_piano_chiave_costo(text) from public, anon, authenticated;
revoke all on function public.generale_piano_rango(text, text[], text, text) from public, anon, authenticated;
revoke all on function public.generale_piano_righe_reali(uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.generale_piano_incassi(uuid) from public, anon, authenticated;
revoke all on function public.generale_piano_righe_abbinate(uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.generale_piano_fotografa(uuid, date, text) from public, anon, authenticated;
revoke all on function public.generale_piano_fotografie_mensili(boolean) from public, anon, authenticated;

revoke all on function public.commessa_generale_piano_reale(uuid, uuid) from public, anon;
grant execute on function public.commessa_generale_piano_reale(uuid, uuid) to authenticated;
revoke all on function public.generale_piano_nuova_versione(uuid, jsonb) from public, anon;
grant execute on function public.generale_piano_nuova_versione(uuid, jsonb) to authenticated;
revoke all on function public.generale_piano_approva(uuid, text) from public, anon;
grant execute on function public.generale_piano_approva(uuid, text) to authenticated;
revoke all on function public.generale_piano_fotografa_ora(uuid) from public, anon;
grant execute on function public.generale_piano_fotografa_ora(uuid) to authenticated;
