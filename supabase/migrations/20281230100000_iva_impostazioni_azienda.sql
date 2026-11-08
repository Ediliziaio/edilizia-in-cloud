-- Liquidazione IVA, fase 0 (docs/piano-liquidazione-iva-lipe-f24.md):
-- le impostazioni IVA dell'azienda, una riga per anno.
--
-- Senza queste il calcolo non sa se liquidare per mese o per trimestre (con
-- l'1% di interessi), se l'IVA è per cassa, quale pro-rata applicare, da quale
-- credito dell'anno prima partire, né chi firma la LIPE. Finché la riga manca,
-- liquidazione e LIPE restano bloccate col motivo scritto: niente default
-- silenziosi su un dato fiscale.

create table if not exists public.fiscalita_impostazioni_iva (
  company_id uuid not null references public.companies(id) on delete cascade,
  anno integer not null check (anno between 2000 and 2100),
  periodicita text not null check (periodicita in ('mensile', 'trimestrale', 'trimestrale_speciale')),
  regime text not null default 'ordinario' check (regime in ('ordinario', 'forfettario', 'altro')),
  iva_per_cassa boolean not null default false,
  -- null = nessun pro-rata (detrazione piena salvo indetraibilità per documento).
  pro_rata_percentuale numeric(5,2) check (pro_rata_percentuale is null or pro_rata_percentuale between 0 and 100),
  -- Attività con contabilità separate: caso non gestito, il calcolo si ferma.
  attivita_separate boolean not null default false,
  -- Credito IVA della dichiarazione dell'anno prima, disponibile per la detrazione
  -- (rigo VP9). Quanto se ne usa in ogni periodo lo decide la liquidazione.
  credito_anno_precedente numeric(14,2) not null default 0 check (credito_anno_precedente >= 0),
  metodo_acconto text not null default 'storico' check (metodo_acconto in ('storico', 'previsionale', 'analitico')),
  -- Frontespizio della LIPE.
  cf_contribuente text check (cf_contribuente is null or cf_contribuente ~ '^([0-9]{11}|[A-Z0-9]{16})$'),
  cf_dichiarante text check (cf_dichiarante is null or cf_dichiarante ~ '^[A-Z0-9]{16}$'),
  codice_carica text check (codice_carica is null or codice_carica ~ '^[0-9]{1,2}$'),
  cf_intermediario text check (cf_intermediario is null or cf_intermediario ~ '^([0-9]{11}|[A-Z0-9]{16})$'),
  note text,
  aggiornato_da uuid,
  aggiornato_il timestamptz not null default now(),
  primary key (company_id, anno)
);

comment on table public.fiscalita_impostazioni_iva is
  'Impostazioni IVA per azienda e anno: periodicità, regime, IVA per cassa, pro-rata, credito anno precedente, dati del frontespizio LIPE. Senza riga la liquidazione si ferma.';

alter table public.fiscalita_impostazioni_iva enable row level security;

drop policy if exists fiscalita_impostazioni_iva_admin on public.fiscalita_impostazioni_iva;
create policy fiscalita_impostazioni_iva_admin on public.fiscalita_impostazioni_iva for all to authenticated
  using (not (select public.utente_bloccato())
         and ((select public.e_amministratore_di(company_id)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (not (select public.utente_bloccato())
              and not (select public.utente_sola_lettura(company_id))
              and ((select public.e_amministratore_di(company_id)) or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

revoke all on public.fiscalita_impostazioni_iva from public, anon, authenticated;
grant select on public.fiscalita_impostazioni_iva to authenticated;
grant insert (company_id, anno, periodicita, regime, iva_per_cassa, pro_rata_percentuale, attivita_separate,
              credito_anno_precedente, metodo_acconto, cf_contribuente, cf_dichiarante, codice_carica,
              cf_intermediario, note),
      update (periodicita, regime, iva_per_cassa, pro_rata_percentuale, attivita_separate,
              credito_anno_precedente, metodo_acconto, cf_contribuente, cf_dichiarante, codice_carica,
              cf_intermediario, note)
  on public.fiscalita_impostazioni_iva to authenticated;

-- Chi e quando: lo scrive il database, non il browser. I codici fiscali in
-- maiuscolo e senza spazi, così il controllo di formato non boccia «it0123…».
create or replace function private.fiscalita_impostazioni_iva_firma()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.aggiornato_da := auth.uid();
  new.aggiornato_il := now();
  new.cf_contribuente := nullif(upper(regexp_replace(coalesce(new.cf_contribuente, ''), '\s', '', 'g')), '');
  new.cf_dichiarante := nullif(upper(regexp_replace(coalesce(new.cf_dichiarante, ''), '\s', '', 'g')), '');
  new.cf_intermediario := nullif(upper(regexp_replace(coalesce(new.cf_intermediario, ''), '\s', '', 'g')), '');
  return new;
end $$;
revoke all on function private.fiscalita_impostazioni_iva_firma() from public, anon, authenticated;

drop trigger if exists fiscalita_impostazioni_iva_firma on public.fiscalita_impostazioni_iva;
create trigger fiscalita_impostazioni_iva_firma
  before insert or update on public.fiscalita_impostazioni_iva
  for each row execute function private.fiscalita_impostazioni_iva_firma();
