-- Fatture: note interne ricercabili e lo stato «da rettificare» (richiesta di un cliente, vale per tutti).
--   1. note_interne su ricevute e importate. `note` e `notes` li scrive anche il sistema; documenti_fiscali
--      ha già note_interne. Una nota interna non finisce né nell'XML né sul PDF.
--   2. «Da rettificare»: la fattura è sbagliata e serve un intervento del fornitore, col motivo scritto.
--      Non tocca i conti, come «verificata». Se ci sono RiBa aperte la funzione ne dice il numero, così
--      chi segna può bloccarle prima dell'addebito: non le blocca da sola.
--   3. ricerca_note_fatture: la ricerca dell'elenco delle emesse trova anche le note interne, senza
--      portare il testo delle note nelle viste dell'elenco.
-- Nessuna riga scritta. Colonne nullable senza default: istantaneo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.fatture_ricevute
  add column if not exists note_interne text,
  add column if not exists rettifica_motivo text;
alter table public.invoices add column if not exists note_interne text;

alter table public.fatture_ricevute drop constraint if exists fatture_ricevute_verifica_manuale_check;
alter table public.fatture_ricevute add constraint fatture_ricevute_verifica_manuale_check
  check (verifica_manuale is null or verifica_manuale in ('verificata', 'da_verificare', 'da_rettificare')) not valid;
alter table public.fatture_ricevute validate constraint fatture_ricevute_verifica_manuale_check;

create or replace function public.fattura_segna_verifica(p_fattura_id uuid, p_verificata boolean)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record;
begin
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (f.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(f.company_id) then
    raise exception 'Il tuo ruolo non permette di verificare le fatture.' using errcode = '42501';
  end if;
  update public.fatture_ricevute
     set verifica_manuale = case when p_verificata then 'verificata' else 'da_verificare' end,
         rettifica_motivo = null,
         verifica_da = auth.uid(), verifica_at = now()
   where id = p_fattura_id;
  return jsonb_build_object('fattura_id', p_fattura_id, 'verificata', p_verificata);
end $$;

create or replace function public.fattura_segna_rettifica(p_fattura_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record; v_motivo text := nullif(btrim(p_motivo), ''); v_riba integer;
begin
  if v_motivo is null then raise exception 'Scrivi cosa va rettificato.' using errcode = '22023'; end if;
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if not (f.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(f.company_id) then
    raise exception 'Il tuo ruolo non permette di verificare le fatture.' using errcode = '42501';
  end if;
  update public.fatture_ricevute
     set verifica_manuale = 'da_rettificare', rettifica_motivo = left(v_motivo, 1000),
         verifica_da = auth.uid(), verifica_at = now()
   where id = p_fattura_id;
  select count(*) into v_riba from public.rate_fornitori r
   where r.fattura_ricevuta_id = p_fattura_id and r.metodo = 'riba' and r.stato in ('da_pagare', 'avvisata');
  return jsonb_build_object('fattura_id', p_fattura_id, 'riba_aperte', v_riba);
end $$;

revoke all on function public.fattura_segna_rettifica(uuid, text) from public, anon;
grant execute on function public.fattura_segna_rettifica(uuid, text) to authenticated, service_role;

create or replace function public.ricerca_note_fatture(p_company_id uuid, p_testo text)
returns table(id uuid) language sql stable security invoker set search_path = public
as $$
  with q as (select '%' || replace(replace(replace(btrim(p_testo), '\', '\\'), '%', '\%'), '_', '\_') || '%' as t)
  select i.id from public.invoices i, q
   where i.company_id = p_company_id and i.note_interne ilike q.t and length(btrim(p_testo)) >= 2
  union all
  select d.id from public.documenti_fiscali d, q
   where d.company_id = p_company_id and d.note_interne ilike q.t and length(btrim(p_testo)) >= 2
  limit 200
$$;

revoke all on function public.ricerca_note_fatture(uuid, text) from public, anon;
grant execute on function public.ricerca_note_fatture(uuid, text) to authenticated, service_role;
