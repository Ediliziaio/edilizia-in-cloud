-- Il formato del numero valeva solo per la serie delle fatture.
--
-- `anagrafica_azienda.formato_numero` è il modello del numero («{prefisso}/{n}»,
-- «{prefisso} {n}/{yy}»…). Fin dal 27/09/2026 si applicava alla serie delle
-- fatture e, quando `nc_serie_condivisa`, anche alla nota di credito che segue
-- quella serie. Ma l'azienda che tiene le note di credito su una serie PROPRIA
-- (sezionale a parte, com'è normale in edilizia: «1/216» le fatture, «2/14» le
-- note) non aveva modo di dare un formato a quella serie: la nota usciva col
-- modello predefinito «NC-2026-0015» mentre le fatture erano «1/217».
--
-- Qui il modello si applica anche alla serie propria delle note, col prefisso
-- delle note. Per chi non ha un formato (`formato_numero` null) non cambia
-- niente: `formatta_numero_documento` ricade sul predefinito
-- «{prefisso}-{yyyy}-{nnnn}». L'unica azienda che oggi ha un formato lo usa già
-- con la serie condivisa, quindi nessun numero in uso cambia forma.
--
-- Il resto del corpo è identico alla versione in produzione del 19/10/2026
-- (reset annuale della serie note compreso).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.genera_numero_documento_native(p_company_id uuid, p_tipo text, p_anno integer default (extract(year from now()))::integer)
returns text language plpgsql set search_path to 'public' as $function$
declare
  v_prefisso text; v_contatore integer; v_ana public.anagrafica_azienda%rowtype; v_condivisa boolean; v_formato text;
begin
  select * into v_ana from public.anagrafica_azienda where company_id = p_company_id for update;
  if not found then raise exception 'Anagrafica azienda non trovata per company_id: %', p_company_id; end if;
  v_condivisa := (p_tipo = 'nota_credito' and coalesce(v_ana.nc_serie_condivisa, false));
  case p_tipo
    when 'fattura', 'fattura_pa', 'autofattura', 'nota_debito', 'fattura_riepilogativa',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' then
      v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
      if coalesce(v_ana.anno_corrente_fattura, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_fattura = 1, anno_corrente_fattura = p_anno where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1 where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
      end if;
    when 'nota_credito' then
      if v_condivisa then
        v_prefisso := coalesce(v_ana.prefisso_fattura, 'FT');
        if coalesce(v_ana.anno_corrente_fattura, 0) < p_anno then
          update public.anagrafica_azienda set ultimo_numero_fattura = 1, anno_corrente_fattura = p_anno where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
        else
          update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1 where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
        end if;
      else
        v_prefisso := coalesce(v_ana.prefisso_nc, 'NC');
        -- come le fatture: a inizio anno la serie delle note riparte da 1
        if coalesce(v_ana.anno_corrente_nc, 0) < p_anno then
          update public.anagrafica_azienda set ultimo_numero_nc = 1, anno_corrente_nc = p_anno where company_id = p_company_id returning ultimo_numero_nc into v_contatore;
        else
          update public.anagrafica_azienda set ultimo_numero_nc = coalesce(ultimo_numero_nc, 0) + 1 where company_id = p_company_id returning ultimo_numero_nc into v_contatore;
        end if;
      end if;
    when 'ddt' then
      v_prefisso := coalesce(v_ana.prefisso_ddt, 'DDT');
      update public.anagrafica_azienda set ultimo_numero_ddt = ultimo_numero_ddt + 1 where company_id = p_company_id returning ultimo_numero_ddt into v_contatore;
    when 'preventivo' then
      v_prefisso := coalesce(v_ana.prefisso_preventivo, 'PRV');
      if coalesce(v_ana.anno_corrente_preventivo, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_preventivo = 1, anno_corrente_preventivo = p_anno where company_id = p_company_id returning ultimo_numero_preventivo into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_preventivo = ultimo_numero_preventivo + 1 where company_id = p_company_id returning ultimo_numero_preventivo into v_contatore;
      end if;
    when 'proforma' then
      v_prefisso := coalesce(v_ana.prefisso_proforma, 'PF');
      if coalesce(v_ana.anno_corrente_proforma, 0) < p_anno then
        update public.anagrafica_azienda set ultimo_numero_proforma = 1, anno_corrente_proforma = p_anno where company_id = p_company_id returning ultimo_numero_proforma into v_contatore;
      else
        update public.anagrafica_azienda set ultimo_numero_proforma = ultimo_numero_proforma + 1 where company_id = p_company_id returning ultimo_numero_proforma into v_contatore;
      end if;
    else
      v_prefisso := 'DOC';
      update public.anagrafica_azienda set ultimo_numero_fattura = ultimo_numero_fattura + 1 where company_id = p_company_id returning ultimo_numero_fattura into v_contatore;
  end case;
  -- Il modello vale per la serie delle fatture E per quella delle note di credito
  -- (sia condivisa sia propria). DDT, preventivi e proforma restano al predefinito.
  if p_tipo in ('fattura','fattura_pa','autofattura','nota_debito','fattura_riepilogativa',
                'integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue',
                'nota_credito') then
    v_formato := v_ana.formato_numero;
  end if;
  return public.formatta_numero_documento(v_formato, v_prefisso, v_contatore, p_anno);
end;
$function$;
