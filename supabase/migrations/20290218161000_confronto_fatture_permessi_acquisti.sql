-- UI canViewCosts comprende can_manage_purchasing. Anche la gestione dei collegamenti
-- e della verifica segue quel contratto, senza concedere permessi fiscali o su altre aziende.
-- Errore riprodotto nei log: 42501 su fattura_segna_verifica e insert dei mezzi.
-- Non modifica permessi personali, fatture, costi, carichi o movimenti.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists fattura_ddt_legge on public.fattura_ddt;
create policy fattura_ddt_legge on public.fattura_ddt for select to authenticated
  using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]));
drop policy if exists fattura_ddt_scrive on public.fattura_ddt;
create policy fattura_ddt_scrive on public.fattura_ddt for all to authenticated
  using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]) and not public.utente_sola_lettura(company_id))
  with check (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]) and not public.utente_sola_lettura(company_id));

drop policy if exists fattura_ricevuta_mezzi_legge on public.fattura_ricevuta_mezzi;
create policy fattura_ricevuta_mezzi_legge on public.fattura_ricevuta_mezzi for select to authenticated
  using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]));
drop policy if exists fattura_ricevuta_mezzi_scrive on public.fattura_ricevuta_mezzi;
create policy fattura_ricevuta_mezzi_scrive on public.fattura_ricevuta_mezzi for all to authenticated
  using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]) and not public.utente_sola_lettura(company_id))
  with check (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and company_id = any ((select public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))::uuid[]) and not public.utente_sola_lettura(company_id));

create or replace function public.fattura_segna_verifica(p_fattura_id uuid, p_verificata boolean)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s'
as $$
declare f record;
begin
  select id, company_id into f from public.fatture_ricevute where id = p_fattura_id for update;
  if not found then raise exception 'Fattura non trovata.' using errcode = 'P0002'; end if;
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce((public.e_super_admin_dentro(f.company_id) or f.company_id = any (public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))) and not public.utente_sola_lettura(f.company_id), false) then
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
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce((public.e_super_admin_dentro(f.company_id) or f.company_id = any (public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))) and not public.utente_sola_lettura(f.company_id), false) then
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


revoke all on function public.fattura_segna_verifica(uuid,boolean),public.fattura_segna_rettifica(uuid,text) from public,anon;
grant execute on function public.fattura_segna_verifica(uuid,boolean),public.fattura_segna_rettifica(uuid,text) to authenticated;
