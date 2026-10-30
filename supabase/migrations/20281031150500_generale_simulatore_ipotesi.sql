-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali — Simulatore prima dell'acquisto
-- ════════════════════════════════════════════════════════════════════════════
-- «Se compro questo terreno a X, faccio N unità, spendo Z e vendo a W €/m² in
-- T mesi, con questo mutuo e questi mezzi propri: conviene?», prima che esista
-- una commessa. I conti li fa il browser (src/lib/orders/generali/simulatore.ts,
-- con le stesse funzioni del piano economico e delle fonti); qui si salvano le
-- ipotesi e si trasforma quella scelta in un'operazione.
--
--   · generale_ipotesi  un'ipotesi per riga, per azienda, con nome e data. I
--     numeri stanno in `dati` (jsonb, letto senza fidarsi della forma da
--     leggiIpotesi). `generale_id` è la commessa generale nata dall'ipotesi.
--   · generale_ipotesi_diventa_operazione  crea in una transazione sola la
--     generale (commessa_generale_crea), la prima versione del piano con voci e
--     mesi (generale_piano_nuova_versione), le fonti e, se richieste, le unità
--     in serie (generale_unita_serie). Se una parte fallisce non resta niente
--     a metà. Le funzioni chiamate fanno i loro controlli: modello acceso,
--     «Ordini e Commesse» (can_edit_orders), margini (can_view_margins).
--
-- Permessi: vedere, salvare ed eliminare le ipotesi chiede can_view_margins
-- (sono margini e rendimenti); creare l'operazione anche can_edit_orders.
-- Tabella con company_id: entra da sola nel backup per azienda.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le ipotesi ───────────────────────────────────────────────────────────
create table if not exists public.generale_ipotesi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  modello text not null,
  dati jsonb not null default '{}'::jsonb,
  generale_id uuid references public.orders(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generale_ipotesi_modello check (modello in ('sviluppo', 'compravendita')),
  constraint generale_ipotesi_nome check (char_length(btrim(nome)) between 1 and 200),
  constraint generale_ipotesi_dati check (jsonb_typeof(dati) = 'object' and pg_column_size(dati) <= 200000)
);

comment on table public.generale_ipotesi is
  'Ipotesi del simulatore prima dell''acquisto (sviluppo, compravendita): acquisto, unità, costi, prezzi, tempi e fonti, salvate per azienda. Diventano una commessa generale con generale_ipotesi_diventa_operazione.';
comment on column public.generale_ipotesi.dati is
  'L''ipotesi come la scrive il simulatore (src/lib/orders/generali/simulatore.ts, tipo Ipotesi). Si legge con leggiIpotesi.';
comment on column public.generale_ipotesi.generale_id is
  'La commessa generale creata da questa ipotesi («Diventa operazione»).';

create index if not exists generale_ipotesi_company_idx on public.generale_ipotesi (company_id, updated_at desc);
create index if not exists generale_ipotesi_generale_idx on public.generale_ipotesi (generale_id) where generale_id is not null;

-- ── 2. Coerenza ─────────────────────────────────────────────────────────────
create or replace function public.generale_ipotesi_coerente()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'Un''ipotesi non si sposta da un''azienda all''altra.' using errcode = '22023';
  end if;
  if new.generale_id is not null and (tg_op = 'INSERT' or new.generale_id is distinct from old.generale_id) then
    if not exists (select 1 from public.commesse_generali g where g.order_id = new.generale_id and g.company_id = new.company_id) then
      raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
    end if;
  end if;
  new.nome := btrim(new.nome);
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists generale_ipotesi_coerente on public.generale_ipotesi;
create trigger generale_ipotesi_coerente
  before insert or update on public.generale_ipotesi
  for each row execute function public.generale_ipotesi_coerente();

-- Le funzioni di trigger non hanno bisogno di EXECUTE (CLAUDE.md, «Funzioni esposte ad anon»).
revoke all on function public.generale_ipotesi_coerente() from public, anon, authenticated;

-- ── 3. Permessi: chi vede i margini ─────────────────────────────────────────
alter table public.generale_ipotesi enable row level security;

revoke all on public.generale_ipotesi from anon, authenticated;
grant select, insert, update, delete on public.generale_ipotesi to authenticated;

drop policy if exists generale_ipotesi_lettura on public.generale_ipotesi;
create policy generale_ipotesi_lettura on public.generale_ipotesi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id));

drop policy if exists generale_ipotesi_inserimento on public.generale_ipotesi;
create policy generale_ipotesi_inserimento on public.generale_ipotesi for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
              and not (select public.utente_bloccato()));

drop policy if exists generale_ipotesi_modifica on public.generale_ipotesi;
create policy generale_ipotesi_modifica on public.generale_ipotesi for update to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
              and not (select public.utente_bloccato()));

drop policy if exists generale_ipotesi_elimina on public.generale_ipotesi;
create policy generale_ipotesi_elimina on public.generale_ipotesi for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
         and not (select public.utente_bloccato()));

-- ── 4. Diventa operazione ───────────────────────────────────────────────────
-- p_voci:  [{tipo, categoria, descrizione, importo, mese «2027-03-01», durata_mesi, ordine}]
-- p_fonti: [{tipo, nome, soggetto, impegno, quota_utile_pct, tasso_pct, data_inizio,
--            forma, spese_iniziali, rimborso, ordine}]
-- p_unita: [{sigla, edificio, piano, tipologia, mq_commerciali, millesimi, prezzo_listino}] o null
create or replace function public.generale_ipotesi_diventa_operazione(
  p_ipotesi_id uuid,
  p_nome text,
  p_valore numeric,
  p_voci jsonb,
  p_fonti jsonb,
  p_unita jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
as $$
declare
  v_ip public.generale_ipotesi%rowtype;
  v_id uuid;
begin
  -- Due clic insieme non creano due operazioni.
  select * into v_ip from public.generale_ipotesi where id = p_ipotesi_id for update;
  if not found or auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v_ip.company_id) then
    raise exception 'Ipotesi non trovata.' using errcode = 'P0002';
  end if;
  if not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_ip.company_id) or public.utente_bloccato() then
    raise exception 'Non hai il permesso di creare commesse.' using errcode = '42501';
  end if;
  if v_ip.generale_id is not null and exists (
    select 1 from public.orders o where o.id = v_ip.generale_id and o.deleted_at is null
  ) then
    raise exception 'Questa ipotesi è già diventata un''operazione: la trovi tra le commesse.' using errcode = '22023';
  end if;
  if p_voci is null or jsonb_typeof(p_voci) <> 'array' or jsonb_array_length(p_voci) = 0 then
    raise exception 'L''ipotesi non ha voci da portare nel piano economico.' using errcode = '22023';
  end if;
  if p_fonti is not null and jsonb_typeof(p_fonti) <> 'array' then
    raise exception 'Le fonti non sono scritte bene.' using errcode = '22023';
  end if;
  if p_fonti is not null and jsonb_array_length(p_fonti) > 30 then
    raise exception 'Troppe fonti in una volta: al massimo 30.' using errcode = '22023';
  end if;

  v_id := public.commessa_generale_crea(v_ip.company_id, v_ip.modello, p_nome, null, p_valore, null);
  perform public.generale_piano_nuova_versione(v_id, p_voci);

  if p_fonti is not null and jsonb_array_length(p_fonti) > 0 then
    insert into public.generale_fonti (company_id, generale_id, tipo, nome, soggetto, impegno, quota_utile_pct, tasso_pct,
                                       data_inizio, forma, spese_iniziali, rimborso, ordine, nota, created_by)
    select v_ip.company_id, v_id, x.tipo, x.nome, coalesce(x.soggetto, 'societa'), coalesce(x.impegno, 0),
           x.quota_utile_pct, x.tasso_pct, x.data_inizio, x.forma, coalesce(x.spese_iniziali, 0),
           coalesce(x.rimborso, 'scadenza'), coalesce(x.ordine, n.ord::integer),
           'Dall''ipotesi «' || v_ip.nome || '».', auth.uid()
      from jsonb_array_elements(p_fonti) with ordinality n(el, ord)
      cross join lateral jsonb_to_record(n.el)
        as x(tipo text, nome text, soggetto text, impegno numeric, quota_utile_pct numeric, tasso_pct numeric,
             data_inizio date, forma text, spese_iniziali numeric, rimborso text, ordine integer);
  end if;

  if p_unita is not null and jsonb_typeof(p_unita) = 'array' and jsonb_array_length(p_unita) > 0 then
    perform public.generale_unita_serie(v_id, p_unita);
  end if;

  update public.generale_ipotesi set generale_id = v_id where id = v_ip.id;
  return v_id;
end;
$$;

revoke all on function public.generale_ipotesi_diventa_operazione(uuid, text, numeric, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.generale_ipotesi_diventa_operazione(uuid, text, numeric, jsonb, jsonb, jsonb) to authenticated;

comment on function public.generale_ipotesi_diventa_operazione(uuid, text, numeric, jsonb, jsonb, jsonb) is
  'Dall''ipotesi del simulatore crea, tutto o niente, la commessa generale, la prima versione del piano economico, le fonti e le unità in serie.';
