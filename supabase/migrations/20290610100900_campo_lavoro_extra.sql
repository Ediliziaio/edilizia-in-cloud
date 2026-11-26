-- Lavoro extra segnalato dal cantiere (26/11/2026, piano campo completo, punto 2.1).
--
-- Il cliente in cantiere chiede «già che ci siete, fate anche…»: finora restava a voce e spesso non si
-- fatturava. Ora chi lavora sul cantiere lo segnala dall'app e nasce subito una BOZZA di ordine di variazione
-- (ordini_variazione, status «bozza») nella commessa: cosa, chi l'ha chiesto, quanti giorni in più se li sa.
-- L'ufficio la ritrova in «Dal cantiere, da approvare», mette il prezzo e la manda al cliente in firma con
-- il flusso di sempre (documento + link). Il prezzo dal cantiere non si scrive: lo decide l'ufficio.
--
-- Può segnalarlo chi è assegnato al cantiere (order_campo_assignments). Numero progressivo della commessa
-- sotto lock sull'ordine, come fanno le altre varianti.

create or replace function public.campo_lavoro_extra_crea(
  p_order_id uuid, p_titolo text, p_descrizione text, p_richiesto_da text, p_giorni integer default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_numero integer;
  v_id uuid;
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select o.company_id into v_company from public.orders o
   where o.id = p_order_id and o.deleted_at is null for update;
  if v_company is null or v_company is distinct from public.get_my_company_id()
     or not exists (select 1 from public.order_campo_assignments a
                     where a.order_id = p_order_id and a.company_id = v_company and a.user_id = v_uid) then
    raise exception 'Non lavori su questo cantiere.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_titolo, ''))) not between 3 and 160 then
    raise exception 'Scrivi in breve che lavoro è (da 3 a 160 caratteri).' using errcode = '22023';
  end if;
  if p_giorni is not null and (p_giorni < 0 or p_giorni > 365) then
    raise exception 'I giorni in più vanno da 0 a 365.' using errcode = '22023';
  end if;
  select coalesce(max(numero_odv), 0) + 1 into v_numero from public.ordini_variazione where order_id = p_order_id;
  insert into public.ordini_variazione (company_id, order_id, numero_odv, titolo, descrizione, motivazione,
                                        impatto_giorni, status, richiesto_da, richiesto_il, created_by, note_interne)
  values (v_company, p_order_id, v_numero, btrim(p_titolo),
          coalesce(nullif(btrim(p_descrizione), ''), btrim(p_titolo)),
          'Richiesto dal cliente in cantiere', p_giorni, 'bozza',
          nullif(btrim(coalesce(p_richiesto_da, '')), ''), now(), v_uid,
          'Segnalato dall''app di cantiere: manca il prezzo, poi va mandato al cliente in firma.')
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.campo_lavoro_extra_crea(uuid, text, text, text, integer) from public, anon;
grant execute on function public.campo_lavoro_extra_crea(uuid, text, text, text, integer) to authenticated;

-- «Da approvare»: anche i lavori extra arrivati dal cantiere e ancora in bozza, a chi modifica le commesse.
create or replace function public.ufficio_altre_approvazioni()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  v_admin boolean;
  v_magazzino boolean;
  v_commesse boolean;
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato() then
    raise exception 'Non puoi vedere le approvazioni di questa azienda' using errcode = '42501';
  end if;
  v_admin := coalesce(public.e_amministratore_di(v_company), false);
  v_magazzino := coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_company), false);
  v_commesse := coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false);
  return jsonb_build_object(
    'spese', case when v_admin then
      (select count(*) from public.campo_spese s where s.company_id = v_company and s.stato = 'inviata') else 0 end,
    'ferie', case when v_admin then
      (select count(*) from public.hr_richieste r where r.company_id = v_company and r.stato = 'in_attesa') else 0 end,
    'ritiri', case when v_magazzino then
      (select count(*) from public.prelievi_campo p where p.company_id = v_company and p.stato = 'richiesto') else 0 end,
    'extra', case when v_commesse then
      (select count(*) from public.ordini_variazione v join public.orders o on o.id = v.order_id and o.deleted_at is null
        where v.company_id = v_company and v.status = 'bozza' and v.motivazione = 'Richiesto dal cliente in cantiere') else 0 end,
    'extra_ordine', case when v_commesse then
      (select v.order_id from public.ordini_variazione v join public.orders o on o.id = v.order_id and o.deleted_at is null
        where v.company_id = v_company and v.status = 'bozza' and v.motivazione = 'Richiesto dal cliente in cantiere'
        order by v.created_at limit 1) else null end
  );
end;
$function$;
