-- ════════════════════════════════════════════════════════════════════════════
-- Le righe della bolla: quello che l'AI legge smette di essere buttato via
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2 del piano in docs/piano-ddt-bolle-fatture.md.
--
-- `ddt-ai-extract` estrae gia' da ogni bolla, riga per riga: codice articolo,
-- descrizione, unita' di misura, quantita', PREZZO UNITARIO e importo, piu' il
-- mittente con partita IVA. Ma la maschera lo chiamava con
-- `legacy_format: true`, cioe' chiedeva apposta il formato piatto, e delle
-- righe restava solo la somma delle quantita' in un campo. La risposta alla
-- domanda «l'AI prende tutti i prodotti del DDT?» era: si', li prende, e poi li
-- perdevamo noi, perche' non c'era nessun posto dove metterli.
--
-- Le uniche righe che esistevano, `goods_receipts`, non sono il posto giusto:
-- sono legate a `order_item_id`, cioe' a una riga di ordine GIA' ESISTENTE (un
-- prodotto che sul DDT c'e' e in ordine no non ha dove andare), e non hanno
-- prezzo. Senza prezzo la bolla non e' valorizzabile, e una fattura di fine
-- mese non si puo' ripartire sui cantieri.
--
-- Da qui:
--   ddt_righe                 una riga = un prodotto scritto sulla bolla, col
--                             suo prezzo. Nasce anche se non corrisponde a
--                             niente in ordine: l'abbinamento (`order_item_id`)
--                             e' un passo DOPO, e facoltativo. E' questo che
--                             oggi lascia il 40% delle bolle senza dettaglio.
--   ddt_ricezione.ai_lettura  la lettura grezza dell'AI, intera, con la sua
--                             confidenza e i suoi avvisi. Serve per dire alla
--                             persona che cosa ha scritto l'AI e che cosa ha
--                             corretto lei (Fase 3), e per rileggere una bolla
--                             senza richiamare il modello (e ripagarlo).
--
-- `origine` dice chi ha scritto la riga ('ai' | 'manuale'), e `ai_originale`
-- tiene com'era la riga appena letta: una correzione a mano si vede, invece di
-- sovrascrivere la storia. Il prezzo NON e' una colonna generata: sulla carta
-- l'importo di riga puo' essere diverso da quantita' x prezzo (sconti, arrotonda-
-- menti), e il documento ha ragione lui. Il trigger lo calcola solo quando
-- manca.
--
-- Quantita' e prezzo sono NULL quando non si sanno. Uno zero direbbe «niente»,
-- che non e' la stessa cosa di «non si legge».
--
-- Accessi: le righe le vede chi vede la bolla, con la stessa regola di
-- `ddt_ricezione` scritta una volta sola in `puo_vedere_ddt()`. Niente anon,
-- niente clienti del portale.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. La lettura dell'AI resta sulla bolla ─────────────────────────────────

alter table public.ddt_ricezione
  add column if not exists ai_lettura jsonb;
alter table public.ddt_ricezione
  add column if not exists ai_confidenza numeric(3,2)
    check (ai_confidenza is null or (ai_confidenza >= 0 and ai_confidenza <= 1));
alter table public.ddt_ricezione
  add column if not exists ai_avvisi text[];

comment on column public.ddt_ricezione.ai_lettura is
  'La lettura grezza dell''AI, intera (intestazione, mittente, destinatario, vettore, trasporto, righe, totali). Si rilegge senza richiamare il modello.';
comment on column public.ddt_ricezione.ai_confidenza is
  'Quanto l''AI dice di essersi fidata, da 0 a 1. NULL = la bolla non e'' passata dall''AI.';
comment on column public.ddt_ricezione.ai_avvisi is
  'Che cosa l''AI non ha letto con certezza: va mostrato a chi controlla, non nascosto.';

-- ── 2. Le righe della bolla ─────────────────────────────────────────────────

create table if not exists public.ddt_righe (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ddt_ricezione_id uuid not null references public.ddt_ricezione(id) on delete cascade,
  posizione integer not null default 0,
  codice_articolo text,
  descrizione text not null,
  unita_misura text,
  -- NULL = non si legge. Uno zero direbbe «nessun pezzo», che e' un'altra cosa.
  quantita numeric(18,4) check (quantita is null or quantita >= 0),
  prezzo_unitario numeric(14,4) check (prezzo_unitario is null or prezzo_unitario >= 0),
  importo numeric(14,2),
  iva_percentuale numeric(5,2) check (iva_percentuale is null or (iva_percentuale >= 0 and iva_percentuale <= 100)),
  -- L'abbinamento alla riga d'ordine: un passo DOPO, e facoltativo.
  order_item_id uuid references public.order_items(id) on delete set null,
  origine text not null default 'manuale' check (origine in ('ai', 'manuale')),
  -- Com'era la riga appena letta: una correzione a mano si vede.
  ai_originale jsonb,
  testo_grezzo text,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ddt_righe is
  'Una riga = un prodotto scritto sulla bolla del fornitore, col suo prezzo. Nasce anche quando non corrisponde a nessuna riga d''ordine: l''abbinamento e'' facoltativo e viene dopo.';
comment on column public.ddt_righe.order_item_id is
  'La riga di commessa corrispondente, quando si trova. NULL non e'' un errore: il fornitore manda anche quello che non e'' a preventivo.';
comment on column public.ddt_righe.importo is
  'L''importo di riga come sta sulla carta. Il trigger lo calcola (quantita x prezzo) solo quando il documento non lo dice: sconti e arrotondamenti del fornitore hanno ragione loro.';
comment on column public.ddt_righe.origine is
  '"ai" = l''ha letta il modello, "manuale" = l''ha scritta una persona.';

create index if not exists ddt_righe_ddt_idx
  on public.ddt_righe(ddt_ricezione_id, posizione);
create index if not exists ddt_righe_company_idx
  on public.ddt_righe(company_id, created_at desc);
create index if not exists ddt_righe_order_item_idx
  on public.ddt_righe(order_item_id) where order_item_id is not null;
-- Le righe ancora da abbinare: la coda di lavoro.
create index if not exists ddt_righe_da_abbinare_idx
  on public.ddt_righe(company_id, ddt_ricezione_id) where order_item_id is null;

-- ── 3. Quello che manca lo mette il database ────────────────────────────────

create or replace function public.ddt_riga_prepara()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_company uuid;
  v_oi_company uuid;
begin
  select d.company_id into v_company
    from public.ddt_ricezione d where d.id = new.ddt_ricezione_id;
  if not found then
    raise exception 'Bolla inesistente' using errcode = '23514';
  end if;
  -- L'azienda della riga e' quella della bolla, sempre: non si prende dal
  -- browser, che potrebbe mandarne un'altra.
  new.company_id := v_company;

  if new.order_item_id is not null then
    select o.company_id into v_oi_company
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.id = new.order_item_id;
    if v_oi_company is distinct from v_company then
      raise exception 'La riga di commessa e'' di un''altra azienda' using errcode = '23514';
    end if;
  end if;

  -- Una riga senza descrizione leggibile non si butta: si tiene il testo
  -- grezzo, cosi' chi controlla vede che qualcosa c'era.
  if coalesce(btrim(new.descrizione), '') = '' then
    new.descrizione := coalesce(nullif(btrim(coalesce(new.testo_grezzo, '')), ''), 'Riga non riconosciuta');
  end if;

  if new.importo is null and new.quantita is not null and new.prezzo_unitario is not null then
    new.importo := round(new.quantita * new.prezzo_unitario, 2);
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;
revoke all on function public.ddt_riga_prepara() from public, anon, authenticated;

drop trigger if exists trg_ddt_riga_prepara on public.ddt_righe;
create trigger trg_ddt_riga_prepara
  before insert or update on public.ddt_righe
  for each row execute function public.ddt_riga_prepara();

-- ── 4. Accessi: chi vede la bolla vede le sue righe ─────────────────────────
-- La regola e' quella di `ddt_ricezione_scoped_access`, scritta una volta sola.

create or replace function public.puo_vedere_ddt(p_ddt uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1
      from public.ddt_ricezione d
     where d.id = p_ddt
       and d.company_id = public.get_my_company_id()
       and (
            public.e_amministratore_di(public.get_my_company_id())
         or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
         or d.warehouse_id = any (public.get_my_warehouse_ids())
       )
  );
$fn$;
comment on function public.puo_vedere_ddt(uuid) is
  'La regola di accesso a una bolla ricevuta, scritta una volta: azienda propria, e amministratore, super admin o magazziniere di quel magazzino.';
revoke all on function public.puo_vedere_ddt(uuid) from public, anon;
grant execute on function public.puo_vedere_ddt(uuid) to authenticated, service_role;

alter table public.ddt_righe enable row level security;

revoke all on public.ddt_righe from public, anon, authenticated;
grant select, insert, update, delete on public.ddt_righe to authenticated;
grant all on public.ddt_righe to service_role;

drop policy if exists ddt_righe_blocco_utente_bloccato on public.ddt_righe;
create policy ddt_righe_blocco_utente_bloccato on public.ddt_righe
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists ddt_righe_lettura on public.ddt_righe;
create policy ddt_righe_lettura on public.ddt_righe for select to authenticated
  using (public.puo_vedere_ddt(ddt_ricezione_id));

drop policy if exists ddt_righe_inserimento on public.ddt_righe;
create policy ddt_righe_inserimento on public.ddt_righe for insert to authenticated
  with check (
    public.puo_vedere_ddt(ddt_ricezione_id)
    and not public.utente_sola_lettura(company_id)
  );

drop policy if exists ddt_righe_modifica on public.ddt_righe;
create policy ddt_righe_modifica on public.ddt_righe for update to authenticated
  using (
    public.puo_vedere_ddt(ddt_ricezione_id)
    and not public.utente_sola_lettura(company_id)
  )
  with check (public.puo_vedere_ddt(ddt_ricezione_id));

drop policy if exists ddt_righe_cancellazione on public.ddt_righe;
create policy ddt_righe_cancellazione on public.ddt_righe for delete to authenticated
  using (
    public.puo_vedere_ddt(ddt_ricezione_id)
    and not public.utente_sola_lettura(company_id)
  );
