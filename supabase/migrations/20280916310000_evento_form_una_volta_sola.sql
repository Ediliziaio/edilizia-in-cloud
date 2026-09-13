-- L'invio di un form genera l'evento di automazione una volta sola.
--
-- Ogni invio scriveva DUE eventi `form_submitted`: il trigger
-- `trg_form_submission_automation` su form_submissions (payload con form_name)
-- e, mezzo secondo dopo, la RPC `trigger_form_automations` chiamata da
-- form-submit. In due giorni, otto invii su otto doppi.
--
-- Finora non ha fatto danni solo perché i form inviati non avevano automazioni:
-- un flusso "Form compilato" che permette il rientro partiva due volte — due
-- notifiche, due opportunità (la seconda scartata dal controllo doppioni, che
-- però riporta la prima nella fase iniziale con una nota).
--
-- La RPC resta, perché copre l'unico caso che il trigger salta (invio senza
-- contatto), ma se l'evento di quell'invio esiste già non ne scrive un altro.
create or replace function public.trigger_form_automations(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_sub record;
begin
  select fs.*, lf.company_id as lf_company_id
    into v_sub
    from form_submissions fs
    join lead_forms lf on lf.id = fs.form_id
   where fs.id = p_submission_id;

  if not found then return; end if;

  -- Il trigger su form_submissions scrive l'evento nello stesso istante
  -- dell'invio: qui si guarda solo il passato recente, su una tabella piccola.
  if exists (
    select 1
      from automation_trigger_events e
     where e.trigger_event = 'form_submitted'
       and e.created_at > now() - interval '1 hour'
       and e.payload->>'submission_id' = p_submission_id::text
  ) then
    return;
  end if;

  insert into automation_trigger_events (
    company_id, trigger_event, entity_type, entity_id, payload
  ) values (
    v_sub.company_id,
    'form_submitted',
    'contact',
    coalesce(v_sub.contact_id, v_sub.form_id),
    jsonb_build_object(
      'form_id', v_sub.form_id,
      'submission_id', p_submission_id,
      'contact_id', v_sub.contact_id,
      'data', v_sub.data
    )
  );
end;
$$;
