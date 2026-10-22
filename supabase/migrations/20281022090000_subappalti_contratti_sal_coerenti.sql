-- Subappalti: contratto completo per ogni commessa, SAL e ritenute coerenti col
-- contratto, fatture ricevute collegabili a contratto e SAL.
--
-- 1. `contratti_subappalto` aveva solo importo, % ritenuta e date. Ora ha anche
--    quello che un contratto di subappalto deve dire: oneri della sicurezza (non
--    ribassabili), data di stipula, responsabili delle due parti, obblighi e
--    responsabilità, pagamenti, penali, garanzie, durata della garanzia, firma.
-- 2. Il SAL prende la commessa dal SUO contratto, sempre: prima la prendeva dalla
--    scheda del subappaltatore, e se la scheda cambiava commessa il SAL finiva
--    nella commessa sbagliata.
-- 3. Ritenute: la data di svincolo prevista e la percentuale arrivano dal
--    contratto (fine lavori + durata della garanzia); un SAL contestato annulla la
--    sua ritenuta, e se la contestazione rientra la ritenuta torna «trattenuta».
-- 4. Fatture ricevute: collegabili al contratto e al SAL del subappaltatore, così
--    contratto, SAL, fatturato e pagato si possono riconciliare.

-- ── 1. Contratto ───────────────────────────────────────────────────────────
alter table public.contratti_subappalto
  add column if not exists oneri_sicurezza numeric not null default 0,
  add column if not exists data_stipula date,
  add column if not exists responsabile_impresa text,
  add column if not exists referente_subappaltatore text,
  add column if not exists obblighi text,
  add column if not exists modalita_pagamento text,
  add column if not exists penali text,
  add column if not exists garanzie text,
  add column if not exists durata_garanzia_mesi integer not null default 12,
  add column if not exists firmato_il timestamptz,
  add column if not exists firmato_da text;

create index if not exists idx_contratti_subappalto_sub on public.contratti_subappalto (subappaltatore_id, created_at desc);

-- ── 2. Il SAL segue il contratto ───────────────────────────────────────────
create or replace function public.sal_sub_commessa_dal_contratto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select c.order_id, c.subappaltatore_id into new.order_id, new.subappaltatore_id
    from public.contratti_subappalto c where c.id = new.contratto_id;
  return new;
end;
$$;
drop trigger if exists trg_sal_sub_commessa_dal_contratto on public.sal_subappaltatori;
create trigger trg_sal_sub_commessa_dal_contratto
  before insert or update of contratto_id, order_id, subappaltatore_id on public.sal_subappaltatori
  for each row execute function public.sal_sub_commessa_dal_contratto();

-- I SAL già esistenti si riallineano al loro contratto.
update public.sal_subappaltatori s set order_id = c.order_id
  from public.contratti_subappalto c
 where c.id = s.contratto_id and s.order_id is distinct from c.order_id;

-- ── 3. Ritenute dal contratto, annullate se il SAL è contestato ────────────
alter table public.ritenute_garanzia drop constraint if exists ritenute_garanzia_stato_check;
alter table public.ritenute_garanzia add constraint ritenute_garanzia_stato_check
  check (stato = any (array['trattenuta', 'svincolata', 'persa', 'annullata']));

create or replace function public.ritenuta_dal_contratto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if new.contratto_id is null then return new; end if;
  select c.order_id, c.ritenuta_garanzia_pct, c.data_fine_prevista, c.data_fine_effettiva, c.durata_garanzia_mesi, c.subappaltatore_id
    into v from public.contratti_subappalto c where c.id = new.contratto_id;
  new.order_id := coalesce(new.order_id, v.order_id);
  new.percentuale_applicata := coalesce(new.percentuale_applicata, v.ritenuta_garanzia_pct);
  -- Si svincola alla fine della garanzia, contata dalla fine dei lavori.
  if new.data_svincolo_prevista is null and coalesce(v.data_fine_effettiva, v.data_fine_prevista) is not null then
    new.data_svincolo_prevista := (coalesce(v.data_fine_effettiva, v.data_fine_prevista) + make_interval(months => coalesce(v.durata_garanzia_mesi, 12)))::date;
  end if;
  if new.controparte is null then
    select ss.ragione_sociale into new.controparte from public.subappaltatori_sicurezza ss where ss.id = v.subappaltatore_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ritenuta_dal_contratto on public.ritenute_garanzia;
create trigger trg_ritenuta_dal_contratto before insert on public.ritenute_garanzia
  for each row execute function public.ritenuta_dal_contratto();

create or replace function public.sal_sub_ritenuta_segue_stato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stato = 'contestato' and old.stato is distinct from 'contestato' then
    update public.ritenute_garanzia set stato = 'annullata' where sal_id = new.id and stato = 'trattenuta';
  elsif old.stato = 'contestato' and new.stato is distinct from 'contestato' then
    update public.ritenute_garanzia set stato = 'trattenuta' where sal_id = new.id and stato = 'annullata';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_sal_sub_ritenuta_segue_stato on public.sal_subappaltatori;
create trigger trg_sal_sub_ritenuta_segue_stato after update of stato on public.sal_subappaltatori
  for each row execute function public.sal_sub_ritenuta_segue_stato();

-- Ritenute esistenti: date e percentuali dai contratti, annullate quelle dei SAL contestati.
update public.ritenute_garanzia r set
  percentuale_applicata = coalesce(r.percentuale_applicata, c.ritenuta_garanzia_pct),
  order_id = coalesce(r.order_id, c.order_id),
  data_svincolo_prevista = coalesce(r.data_svincolo_prevista,
    case when coalesce(c.data_fine_effettiva, c.data_fine_prevista) is not null
         then (coalesce(c.data_fine_effettiva, c.data_fine_prevista) + make_interval(months => c.durata_garanzia_mesi))::date end)
  from public.contratti_subappalto c
 where c.id = r.contratto_id and r.direzione = 'passiva';
update public.ritenute_garanzia r set stato = 'annullata'
  from public.sal_subappaltatori s
 where s.id = r.sal_id and s.stato = 'contestato' and r.stato = 'trattenuta';

-- ── 4. Fatture ricevute ↔ contratto e SAL ──────────────────────────────────
alter table public.fatture_ricevute
  add column if not exists contratto_subappalto_id uuid references public.contratti_subappalto(id) on delete set null,
  add column if not exists sal_subappaltatore_id uuid references public.sal_subappaltatori(id) on delete set null;
create index if not exists idx_fatture_ricevute_contratto_sub on public.fatture_ricevute (contratto_subappalto_id) where contratto_subappalto_id is not null;

revoke all on function public.sal_sub_commessa_dal_contratto() from public, anon, authenticated;
revoke all on function public.ritenuta_dal_contratto() from public, anon, authenticated;
revoke all on function public.sal_sub_ritenuta_segue_stato() from public, anon, authenticated;
