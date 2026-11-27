-- «Attività non creata»: chi non vede costi e margini non poteva creare un'attività d'ufficio
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. validate_office_task (security invoker) controllava la commessa con una select
-- su public.orders. La regola restrittiva office_financial_select svuota orders a chi non ha
-- importi + costi + margini: per la segreteria di un'impresa la commessa «non esisteva» e
-- l'inserimento in tasks falliva con 23514 «Commessa non disponibile per questa azienda.»
-- (riprodotto in transazione annullata con l'utente vero).
--
-- Il controllo deve solo dire se la commessa è di quell'azienda: lo fa una funzione definer
-- che non restituisce niente della commessa. Chi può scrivere su tasks lo decidono già le policy.

create or replace function private.commessa_dell_azienda(p_order uuid, p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.orders o
                  where o.id = p_order and o.company_id = p_company and o.deleted_at is null);
$$;

-- Il trigger gira coi diritti di chi scrive: gli serve EXECUTE. Dice solo sì/no su due id.
revoke all on function private.commessa_dell_azienda(uuid, uuid) from public, anon;
grant execute on function private.commessa_dell_azienda(uuid, uuid) to authenticated;

create or replace function public.validate_office_task()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.activity_scope = 'ufficio' then
    if new.order_id is not null and not private.commessa_dell_azienda(new.order_id, new.company_id) then
      raise exception 'Commessa non disponibile per questa azienda.' using errcode = '23514'; end if;
    if new.assigned_to is not null and not public.e_persona_ufficio(new.assigned_to, new.company_id) then
      raise exception 'Il responsabile di una fase d’ufficio deve essere una persona dell’azienda.' using errcode = '23514'; end if;
    if new.status = 'completata' and new.assigned_to is null and new.ufficio_id is null then
      raise exception 'Assegna un responsabile o un ufficio prima di completare la fase d’ufficio.' using errcode = '23514'; end if;
    if new.attende_fase_id is not null and not exists (
      select 1 from public.order_work_phases f where f.id = new.attende_fase_id and f.order_id = new.order_id
    ) then raise exception 'La fase del cantiere attesa non è di questa commessa.' using errcode = '23514'; end if;
  end if;
  return new;
end; $function$;
