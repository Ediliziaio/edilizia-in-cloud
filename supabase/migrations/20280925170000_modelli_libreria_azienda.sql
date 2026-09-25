-- I modelli della libreria dei moduli si salvano per l'azienda, non nel browser (25/09/2026).
--
-- La libreria «Un modello per ogni intervento» (Impostazioni → Template preventivi →
-- Moduli vendita, 68 modelli in 11 aree) salvava le personalizzazioni solo nel
-- localStorage di chi le faceva. Un collega su un altro computer creava i preventivi
-- Tetti e Serramenti col modello di serie, senza avviso; niente backup; e le foto
-- caricate riempivano lo spazio del browser.
--
-- Ora ogni salvataggio va anche qui (src/lib/moduli-vendita/archivioModelli.ts), e
-- all'apertura della libreria o di un preventivo le copie dell'azienda tornano nel
-- browser. Una riga per modello: la chiave è quella che il browser usa per la sua
-- copia («eic:<archivio>:v1:<azienda>:<modello>»), il contenuto è il record salvato
-- dall'editor, salvato_il la sua data (vince il più recente).
--
-- Lettura: chi lavora nell'azienda (i venditori creano i preventivi coi modelli),
-- mai il cliente esterno. Scrittura: chi può modificare i listini e i modelli
-- (can_edit_settings_pricing, come la pagina), più amministratori e super admin
-- (has_permission_for_company). Il backup settimanale la prende da sé: ha company_id.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.modelli_libreria_azienda (
  company_id uuid not null references public.companies(id) on delete cascade,
  chiave text not null,
  contenuto jsonb not null,
  salvato_il timestamptz not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (company_id, chiave),
  constraint modelli_libreria_chiave_dell_azienda check (
    chiave ~ '^eic:(local-module-template|module-document|full-[a-z]+-module):v1:'
    and split_part(chiave, ':', 4) = company_id::text
  ),
  constraint modelli_libreria_dimensione check (octet_length(contenuto::text) <= 8388608)
);

comment on table public.modelli_libreria_azienda is
  'Modelli della libreria dei moduli di vendita, per azienda: una riga per modello, stessa chiave della copia nel browser. Li scrive archivioModelli.ts.';

alter table public.modelli_libreria_azienda enable row level security;

drop policy if exists blocco_utente_bloccato on public.modelli_libreria_azienda;
create policy blocco_utente_bloccato on public.modelli_libreria_azienda
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists modelli_libreria_lettura on public.modelli_libreria_azienda;
create policy modelli_libreria_lettura on public.modelli_libreria_azienda
  as permissive for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
  );

drop policy if exists modelli_libreria_scrittura on public.modelli_libreria_azienda;
create policy modelli_libreria_scrittura on public.modelli_libreria_azienda
  as permissive for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_pricing', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_pricing', company_id));

revoke all on table public.modelli_libreria_azienda from public, anon, authenticated;
grant select, insert, update, delete on table public.modelli_libreria_azienda to authenticated;
grant all on table public.modelli_libreria_azienda to service_role;

-- updated_at e updated_by a ogni scrittura, anche se il browser non li manda.
-- Vince la copia salvata per ultima anche qui: una più vecchia (un browser rimasto
-- indietro, due salvataggi arrivati in ordine inverso) non sostituisce la nuova.
create or replace function public.modelli_libreria_timbro()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' and new.salvato_il < old.salvato_il then
    return null;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

revoke all on function public.modelli_libreria_timbro() from public, anon, authenticated;

drop trigger if exists modelli_libreria_timbro on public.modelli_libreria_azienda;
create trigger modelli_libreria_timbro
  before insert or update on public.modelli_libreria_azienda
  for each row execute function public.modelli_libreria_timbro();
