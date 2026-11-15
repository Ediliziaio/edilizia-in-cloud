-- 15/11/2026 — Lotti 4-5 del piano docs/piano-clienti-pa-commessa-fattura.md:
-- i riferimenti PA e l'ufficio destinatario sulla fattura.
--
-- documenti_fiscali.riferimenti_pa (jsonb, array): una riga per contratto / ordine d'acquisto /
-- convenzione, con numero, data, NumItem, codice commessa/convenzione, CIG (o «non dovuto»),
-- CUP (o «non dovuto»), righe a cui si applica (righe_id / numeri_linea; vuoto = tutta la
-- fattura), origine (anagrafica / commessa / manuale), modificato, commessa e riga di origine.
-- Lo legge l'XML (DatiOrdineAcquisto, DatiContratto, DatiConvenzione): vedi
-- supabase/functions/_shared/riferimentiPaFattura.ts. Vuoto = documento vecchio: l'XML usa
-- ancora cig, cup, codice_commessa_convenzione e riferimenti_ordine, che restano.
--
-- documenti_fiscali.ufficio_pa_id: l'ufficio scelto sulla fattura. Il suo codice è copiato in
-- cliente_snapshot.codice_sdi (CodiceDestinatario) e cliente_snapshot.ufficio_pa: la fattura
-- non dipende più da anagrafiche_native.codice_sdi.
--
-- Nessuna delle due colonne è in documento_fiscale_campi_modificabili(): su una fattura emessa
-- non si cambiano (trigger documenti_fiscali_proteggi_emessi).
--
-- Collegamenti tra aziende: le chiavi esterne si controllano senza regole d'accesso, quindi
-- una fattura poteva puntare (conoscendone l'id) alla commessa, all'anagrafica o all'ufficio di
-- un'altra azienda, e fattura_ordine collegare fattura e commessa di aziende diverse. Il 15/11
-- nessuna riga è in questa situazione (controllato prima). Ora un trigger lo rifiuta, con lo
-- stesso messaggio per «non esiste» e «è di un'altra azienda».
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.documenti_fiscali
  add column if not exists riferimenti_pa jsonb not null default '[]'::jsonb,
  add column if not exists ufficio_pa_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documenti_fiscali_riferimenti_pa_array') then
    alter table public.documenti_fiscali
      add constraint documenti_fiscali_riferimenti_pa_array check (jsonb_typeof(riferimenti_pa) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documenti_fiscali_ufficio_pa_fk') then
    alter table public.documenti_fiscali
      add constraint documenti_fiscali_ufficio_pa_fk foreign key (ufficio_pa_id)
      references public.anagrafica_uffici_pa(id) on delete set null;
  end if;
end $$;

create index if not exists documenti_fiscali_ufficio_pa_idx
  on public.documenti_fiscali (ufficio_pa_id) where ufficio_pa_id is not null;

comment on column public.documenti_fiscali.riferimenti_pa is
  'Riferimenti PA della fattura (contratto/ordine/convenzione, CIG, CUP, righe, origine). Vuoto = documento vecchio: valgono cig/cup/riferimenti_ordine. Vedi _shared/riferimentiPaFattura.ts.';
comment on column public.documenti_fiscali.ufficio_pa_id is
  'Ufficio PA destinatario scelto sulla fattura; il codice è copiato in cliente_snapshot.codice_sdi.';

-- ─── Collegamenti solo dentro la stessa azienda ───────────────────────────────

create or replace function public.documento_fiscale_collegamenti_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ordine_id is not null
     and (tg_op = 'INSERT' or new.ordine_id is distinct from old.ordine_id)
     and not exists (select 1 from public.orders o where o.id = new.ordine_id and o.company_id = new.company_id) then
    raise exception 'Commessa non trovata tra quelle di questa azienda' using errcode = '23503';
  end if;
  if new.anagrafica_id is not null
     and (tg_op = 'INSERT' or new.anagrafica_id is distinct from old.anagrafica_id)
     and not exists (select 1 from public.anagrafiche_native a where a.id = new.anagrafica_id and a.company_id = new.company_id) then
    raise exception 'Cliente non trovato tra quelli di questa azienda' using errcode = '23503';
  end if;
  if new.ufficio_pa_id is not null
     and (tg_op = 'INSERT' or new.ufficio_pa_id is distinct from old.ufficio_pa_id)
     and not exists (select 1 from public.anagrafica_uffici_pa u where u.id = new.ufficio_pa_id and u.company_id = new.company_id) then
    raise exception 'Ufficio PA non trovato tra quelli di questa azienda' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.documento_fiscale_collegamenti_stessa_azienda() from public, anon, authenticated;

drop trigger if exists documento_fiscale_collegamenti_stessa_azienda on public.documenti_fiscali;
create trigger documento_fiscale_collegamenti_stessa_azienda
  before insert or update of ordine_id, anagrafica_id, ufficio_pa_id on public.documenti_fiscali
  for each row execute function public.documento_fiscale_collegamenti_stessa_azienda();

create or replace function public.fattura_ordine_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.documenti_fiscali d where d.id = new.fattura_id and d.company_id = new.company_id)
     or not exists (select 1 from public.orders o where o.id = new.ordine_id and o.company_id = new.company_id) then
    raise exception 'Fattura o commessa non trovata tra quelle di questa azienda' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.fattura_ordine_stessa_azienda() from public, anon, authenticated;

drop trigger if exists fattura_ordine_stessa_azienda on public.fattura_ordine;
create trigger fattura_ordine_stessa_azienda
  before insert or update of fattura_id, ordine_id, company_id on public.fattura_ordine
  for each row execute function public.fattura_ordine_stessa_azienda();
