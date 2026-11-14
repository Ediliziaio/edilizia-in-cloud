-- 20290322092000_unita_nascono_senza_stato.sql
--
-- Un'unità in vendita non è un contratto firmato (14/11/2026, URBAN VISION). La commessa di
-- un'unità nasceva con lo stato predefinito dell'azienda, che per quasi tutte è «Contratto
-- Firmato»: le 73 unità del sistema lo avevano, anche le 57 libere. Per un'unità conta lo stato
-- di vendita (unita_immobiliari.stato_vendita); la commessa nasce senza stato di lavorazione,
-- come la generale. Lo stato di lavorazione, se serve, lo si dà dopo il compromesso.
--
-- Le unità che ci sono già non si toccano qui: cambiare lo stato di una commessa fa partire
-- automazioni, notifiche e webhook (trigger su orders). L'elenco commesse mostra già lo stato di
-- vendita al posto di quello di lavorazione (02fee1086).

create or replace function public.generale_unita_nuova_commessa(p_azienda uuid, p_descrizione text, p_importo numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid := gen_random_uuid();
begin
  -- IVA al 10%: la vendita di abitazioni dal costruttore (la prima casa al 4% si cambia sulla commessa).
  -- Nessuno stato di lavorazione: l'unità ha il suo stato di vendita.
  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code, current_status_id, vat_rate)
  values (v_id, p_azienda, auth.uid(), p_descrizione, 'commessa', coalesce(p_importo, 0),
          public.prossimo_numero_commessa(p_azienda), null, 10);
  return v_id;
end;
$function$;
