-- Controllo reale precedente alla correzione di annullamento; solo per test isolati.
CREATE OR REPLACE FUNCTION public.campo_rapportino_verifica_flusso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid(); v_regola text; v_ruolo jsonb;
  v_ufficio boolean; v_ditta boolean; v_cliente boolean;
begin
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id)
  then raise exception 'Commessa e azienda non corrispondono' using errcode = '42501'; end if;
  v_ufficio := coalesce(auth.role() = 'service_role', false)
    or coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', new.company_id), false);
  -- L'approvazione la dà l'ufficio, e non al proprio rapportino (salvo il titolare). Il servizio
  -- (WhatsApp, Silvio) passa: ha già i suoi controlli.
  if v_ufficio and not coalesce(auth.role() = 'service_role', false)
     and (new.approvato or new.stato = 'approvato'
          or (tg_op = 'UPDATE' and old.stato = 'inviato' and new.stato = 'rifiutato'))
     and (tg_op = 'INSERT' or new.approvato is distinct from old.approvato or new.stato is distinct from old.stato)
     and (not coalesce(public.campo_e_ufficio(new.company_id), false)
          or (new.user_id = v_uid and not coalesce(public.e_amministratore_di(new.company_id), false))) then
    raise exception 'Il rapportino lo approva o lo rimanda indietro l’ufficio, e non il proprio' using errcode = '42501';
  end if;
  if v_ufficio then return new; end if;
  -- Costo, presenze registrate e approvazione li scrive solo l'ufficio: dall'app di cantiere restano come sono.
  if (tg_op = 'INSERT' and (new.costo_manodopera is not null or new.costo_registrato_at is not null
        or new.presenze_registrate is not null or new.approvato_da is not null or new.approvato_at is not null
        or new.ufficio_employee_id is not null or new.ufficio_created_by is not null))
     or (tg_op = 'UPDATE' and (new.costo_manodopera, new.costo_registrato_at, new.presenze_registrate, new.approvato_da,
          new.approvato_at, new.ufficio_employee_id, new.ufficio_created_by) is distinct from
         (old.costo_manodopera, old.costo_registrato_at, old.presenze_registrate, old.approvato_da,
          old.approvato_at, old.ufficio_employee_id, old.ufficio_created_by)) then
    raise exception 'Costi e approvazione del rapportino li registra l’ufficio' using errcode = '42501';
  end if;
  -- PDF e motivo del rifiuto: dall'app di cantiere si possono solo svuotare.
  if (tg_op = 'INSERT' and (new.pdf_url is not null or new.motivo_rifiuto is not null))
     or (tg_op = 'UPDATE' and ((new.pdf_url is distinct from old.pdf_url and new.pdf_url is not null)
                              or (new.motivo_rifiuto is distinct from old.motivo_rifiuto and new.motivo_rifiuto is not null))) then
    raise exception 'PDF e motivo del rifiuto li scrive l’ufficio' using errcode = '42501';
  end if;
  if v_uid is null or new.user_id <> v_uid
    or not exists (select 1 from public.profiles p where p.id = v_uid and p.company_id = new.company_id)
    or not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id)
    or not coalesce(public.campo_lavoro_su_commessa(new.order_id), false)
  then raise exception 'Rapportino fuori dal proprio cantiere o azienda' using errcode = '42501'; end if;
  if (new.approvato or new.stato = 'approvato') and (tg_op = 'INSERT'
      or new.approvato is distinct from old.approvato or new.stato is distinct from old.stato) then
    raise exception 'L’approvazione spetta all’ufficio' using errcode = '42501';
  end if;
  v_cliente := coalesce(new.lavoro_completato, false) or nullif(btrim(new.firma_cliente_url), '') is not null;
  if tg_op = 'UPDATE' then
    if (new.company_id, new.user_id, new.order_id, new.data_lavoro) is distinct from
       (old.company_id, old.user_id, old.order_id, old.data_lavoro)
       or v_cliente is distinct from (coalesce(old.lavoro_completato, false) or nullif(btrim(old.firma_cliente_url), '') is not null)
    then raise exception 'Non si cambia identità, giorno o tipo di un rapporto esistente' using errcode = '22023'; end if;
    if (new.descrizione_lavori, new.ore_lavorate, new.ore_straordinario, new.presenze, new.materiali_usati,
        new.foto_urls, new.fasi_lavorate, new.percentuale_avanzamento, new.firma_cliente_url, new.firma_cliente_nome, new.stato) is not distinct from
       (old.descrizione_lavori, old.ore_lavorate, old.ore_straordinario, old.presenze, old.materiali_usati,
        old.foto_urls, old.fasi_lavorate, old.percentuale_avanzamento, old.firma_cliente_url, old.firma_cliente_nome, old.stato)
    then return new; end if;
    if old.stato not in ('bozza', 'rifiutato') then
      raise exception 'Un rapporto già inviato si corregge solo se l’ufficio lo rimanda indietro' using errcode = '42501';
    end if;
  end if;
  v_ruolo := public.campo_mio_ruolo(new.order_id);
  v_ditta := exists (select 1 from public.user_roles ur where ur.user_id = v_uid and ur.role = 'subcontractor');
  if v_cliente then
    if coalesce((v_ruolo->>'esiste_capo')::boolean, false) and not coalesce((v_ruolo->>'capocantiere')::boolean, false)
    then raise exception 'La conferma cliente spetta al capocantiere' using errcode = '42501'; end if;
    if nullif(btrim(new.descrizione_lavori), '') is null or nullif(btrim(new.firma_cliente_url), '') is null
       or nullif(btrim(new.firma_cliente_nome), '') is null
    then raise exception 'Servono lavori, nome cliente e firma' using errcode = '22023'; end if;
    if (tg_op = 'INSERT' or (new.ore_lavorate, new.ore_straordinario, new.presenze,
        new.materiali_usati, new.fasi_lavorate, new.percentuale_avanzamento) is distinct from
        (old.ore_lavorate, old.ore_straordinario, old.presenze,
         old.materiali_usati, old.fasi_lavorate, old.percentuale_avanzamento))
       and (coalesce(new.ore_lavorate, 0) <> 0 or coalesce(new.ore_straordinario, 0) <> 0
       or coalesce(new.presenze, '[]'::jsonb) <> '[]'::jsonb or coalesce(new.materiali_usati, '[]'::jsonb) <> '[]'::jsonb
       or coalesce(new.fasi_lavorate, '[]'::jsonb) <> '[]'::jsonb or coalesce(new.percentuale_avanzamento, 0) <> 0)
    then raise exception 'Il rapporto cliente non aggiunge ore, presenze o consumi' using errcode = '22023'; end if;
    return new;
  end if;
  if (tg_op = 'INSERT' or (new.ore_lavorate, new.ore_straordinario) is distinct from
                         (old.ore_lavorate, old.ore_straordinario))
    and (coalesce(new.ore_lavorate, 0) > 0 or coalesce(new.ore_straordinario, 0) > 0)
    and exists(select 1 from public.campo_rapportini r
      where r.company_id = new.company_id and r.user_id = new.user_id and r.order_id = new.order_id
        and r.data_lavoro = new.data_lavoro and r.stato in ('inviato','approvato')
        and (coalesce(r.lavoro_completato,false) or nullif(btrim(r.firma_cliente_url),'') is not null)
        and (coalesce(r.ore_lavorate,0) > 0 or coalesce(r.ore_straordinario,0) > 0))
  then raise exception 'Ore già presenti nel rapporto cliente storico: verifica con l’ufficio, non registrarle di nuovo' using errcode = '22023'; end if;
  if new.data_lavoro > (now() at time zone 'Europe/Rome')::date
     or (new.data_lavoro < public.campo_primo_giorno_ammesso(new.company_id)
         and not (tg_op = 'UPDATE' and old.stato in ('rifiutato', 'bozza')))
  then raise exception 'Questa giornata è troppo indietro per l’app: chiedi all’ufficio' using errcode = '22023'; end if;
  select r.chi_compila into v_regola from public.campo_regole_azienda r where r.company_id = new.company_id;
  if not v_ditta and coalesce((v_ruolo->>'esiste_capo')::boolean, false) then
    if v_regola = 'capo' and not coalesce((v_ruolo->>'capocantiere')::boolean, false)
       and not coalesce((v_ruolo->>'caposquadra')::boolean, false)
       and not (tg_op = 'UPDATE' and old.stato in ('rifiutato', 'bozza'))
    then raise exception 'Il giornaliero lo invia il responsabile' using errcode = '42501'; end if;
    if v_regola = 'ore_proprie' and coalesce(new.presenze, '[]'::jsonb) <> '[]'::jsonb
    then raise exception 'Nel flusso misto ogni persona conferma solo le proprie ore' using errcode = '22023'; end if;
  end if;
  return new;
end $function$
