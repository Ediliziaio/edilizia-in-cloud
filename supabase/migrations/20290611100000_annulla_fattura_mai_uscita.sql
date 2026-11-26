-- Annullare una fattura emessa ma mai uscita (26/11/2026, Impresa Vulcano).
--
-- Vulcano ha salvato ed EMESSO la fattura 1/242 senza mandarla allo SDI: niente
-- trasmissione, niente XML, nessun incasso, nessuna email al cliente. Per l'Agenzia
-- quella fattura non esiste, quindi non c'e' niente da stornare con una nota di
-- credito — eppure non si poteva ne' eliminare ne' annullare, e il numero 242
-- restava bruciato in cima alla serie.
--
-- Dal 16/11/2026 il guardiano (documenti_fiscali_proteggi_emessi) sa gia' che una
-- emessa mai uscita si CORREGGE tenendo numero e data (v_mai_uscita). Mancava il
-- resto: annullarla e ridare il numero alla serie. L'unico campo che il guardiano
-- rifiutava era proprio `numero`, cioe' il segnaposto «Bozza …» su cui si regge il
-- rientro del contatore.
--
-- Qui:
--   1. la regola «mai uscita» finisce in una funzione sola, documento_fattura_mai_uscita,
--      che guardiano e annullamento leggono dallo stesso posto;
--   2. il guardiano accetta il segnaposto al posto del numero, ma solo dentro
--      documento_elimina_bozza (set_config fatturazione.annullamento);
--   3. documento_elimina_bozza accetta una emessa mai uscita e le fa la stessa strada
--      di una bozza: cestino, segnaposto, contatore al piu' alto ancora in uso.
--      Prima controlla che non ci sia contabilita' appesa (incassi, rate, prima nota,
--      banca, SAL, generale, archivio sostitutivo): in quel caso si stacca prima.
--
-- Una emessa e' uscita appena ha un id di trasmissione, uno stato SDI, un incasso,
-- una nota che la cita o un'email consegnata al cliente: da li' in poi solo nota di
-- credito, come prima.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 0 ── Il guardiano e l'eliminazione devono essere quelli che questa migrazione ha letto.
do $guardia$
declare
  v_trig text := pg_get_functiondef('public.documenti_fiscali_proteggi_emessi()'::regprocedure);
  v_eli  text := pg_get_functiondef('public.documento_elimina_bozza(uuid)'::regprocedure);
begin
  if position('documento_fattura_mai_uscita' in v_trig) > 0
     and position('fatturazione.annullamento' in v_eli) > 0 then
    raise notice 'annulla_fattura_mai_uscita: gia'' applicata, le funzioni vengono riscritte identiche';
    return;
  end if;
  -- Non si confronta il testo esatto delle due funzioni. Ricostruendo il database dai soli
  -- file (il controllo «Complete offline database reconstruction») arrivano qui in una forma
  -- diversa da quella di produzione, dove un centinaio di migrazioni applicate non ha un file
  -- nel repository: un confronto per byte fallirebbe sempre, e non direbbe niente di utile.
  -- Si controlla invece che ci sia ancora cio' su cui questa migrazione si appoggia: se
  -- qualcuno le ha ristrutturate, qui si ferma invece di cancellargli il lavoro.
  if position('v_mai_uscita' in v_trig) = 0
     or position('documento_fiscale_campi_modificabili' in v_trig) = 0
     or position('v_fissi_scartata' in v_trig) = 0 then
    raise exception 'documenti_fiscali_proteggi_emessi non e'' piu'' quella che questa migrazione riscrive: rivedere 20290611100000';
  end if;
  if position('ultimo_numero_fattura' in v_eli) = 0
     or position('Bozza ' in v_eli) = 0
     or position('puo_gestire_documento_fiscale' in v_eli) = 0 then
    raise exception 'documento_elimina_bozza non e'' piu'' quella che questa migrazione riscrive: rivedere 20290611100000';
  end if;
end
$guardia$;

-- 1 ── «Mai uscita»: una regola, un posto.
create or replace function public.documento_fattura_mai_uscita(p_doc public.documenti_fiscali)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    p_doc.tipo = any (array['fattura','fattura_pa','nota_credito','nota_debito','autofattura',
                            'fattura_riepilogativa','reverse_charge_interno','integrazione_servizi_estero',
                            'integrazione_beni_ue','integrazione_beni_extra_ue'])
    and p_doc.stato = 'emessa'
    and p_doc.sdi_id_trasmissione is null
    and coalesce(p_doc.sdi_stato, '') = ''
    and p_doc.sdi_identificativo is null
    and coalesce(p_doc.importo_pagato, 0) = 0
    and p_doc.pagato_at is null
    and not exists (select 1 from public.documenti_fiscali n
                     where n.documento_correlato_id = p_doc.id and n.deleted_at is null
                       and n.stato <> 'annullata')
    and not exists (select 1 from public.billing_sync_log l
                     where l.company_id = p_doc.company_id and l.provider = 'email' and l.status = 'success'
                       and (l.documento_fiscale_id = p_doc.id or l.invoice_id = p_doc.id))
    and not exists (select 1 from public.email_delivery_log l
                     where l.company_id = p_doc.company_id and l.template_type = 'documento_send'
                       and l.metadata->>'documento_id' = p_doc.id::text
                       and l.status in ('sent','delivered','bounced'))
    and not exists (select 1 from private.documento_email_richieste r
                     where r.company_id = p_doc.company_id and r.documento_id = p_doc.id
                       and r.stato = 'inviato'),
    false);
$function$;

comment on function public.documento_fattura_mai_uscita(public.documenti_fiscali) is
  'Una fattura emessa che non e'' mai uscita di qui: niente SDI, niente incassi, nessuna nota che la cita, nessuna email consegnata. Si corregge tenendo numero e data, e si annulla ridando il numero alla serie.';

revoke all on function public.documento_fattura_mai_uscita(public.documenti_fiscali) from public, anon;

-- 2 ── Il guardiano: la regola arriva da la', e il segnaposto e' ammesso nell'annullamento.
CREATE OR REPLACE FUNCTION public.documenti_fiscali_proteggi_emessi()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_consentiti text[] := public.documento_fiscale_campi_modificabili();
  -- Ciò che identifica una fattura scartata: per rimandarla resta com'era.
  v_fissi_scartata text[] := ARRAY['id', 'company_id', 'tipo', 'numero', 'numero_progressivo',
                                   'anno', 'serie', 'data_emissione', 'created_at'];
  v_scartata   boolean := false;
  -- Emessa ma mai uscita: si corregge come una scartata (16/11/2026).
  v_mai_uscita boolean := false;
  v_correggibile boolean := false;
  v_prima      jsonb;
  v_dopo       jsonb;
  v_campo      text;
  v_violati    text[] := '{}';
  v_toccati    text[] := '{}';
  v_diff       jsonb  := '{}'::jsonb;
  v_motivo     text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
      -- Il consiglio dipende dallo stato: a un documento gia' annullato non
      -- si puo' dire "annullalo".
      IF OLD.stato = 'annullata' THEN
        v_motivo := format(
          'Un documento %s annullato non si cancella: la conservazione è obbligatoria anche per i documenti annullati. Resta nello storico.',
          OLD.tipo);
      ELSE
        v_motivo := format(
          'Un documento %s in stato "%s" non si cancella: la conservazione è obbligatoria. Se non vale più, annullalo: resterà nello storico come annullato.',
          OLD.tipo, OLD.stato);
      END IF;
      RAISE LOG 'documenti_fiscali: DELETE rifiutata su % (% %) da % / %',
        OLD.id, OLD.tipo, OLD.stato, coalesce(auth.uid()::text,'—'), current_user;
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- L'esito dello SDI lo scrivono solo le funzioni del sistema (invia-sdi,
  -- sdi-stato-tick, sdi-webhook, con la chiave di servizio), mai un utente:
  -- è l'esito a dire se una fattura è stata scartata, e quindi se si può
  -- correggere. Senza questo, scrivere «NS» a mano bastava a riaprire una
  -- fattura consegnata.
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon')
     AND (NEW.sdi_stato IS DISTINCT FROM OLD.sdi_stato
          OR NEW.sdi_id_trasmissione IS DISTINCT FROM OLD.sdi_id_trasmissione
          OR NEW.sdi_identificativo IS DISTINCT FROM OLD.sdi_identificativo
          OR NEW.sdi_notifica_tipo IS DISTINCT FROM OLD.sdi_notifica_tipo
          OR NEW.sdi_data_consegna IS DISTINCT FROM OLD.sdi_data_consegna) THEN
    RAISE EXCEPTION 'Lo stato della fattura allo SDI lo aggiorna il sistema, non si scrive a mano.'
      USING ERRCODE = '42501';
  END IF;

  -- Bozza di un documento che va allo SDI (24/09/2026): stato e numero li
  -- cambia solo documento_emetti, che controlla date e numerazione. Eliminarla
  -- (annullata) resta possibile. Prima bastava una patch qualunque.
  IF OLD.stato = 'bozza'
     AND OLD.tipo IN ('fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa','reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue')
     AND coalesce(current_setting('fatturazione.emissione', true), '') <> 'on' THEN
    IF NEW.stato NOT IN ('bozza', 'annullata') THEN
      RAISE EXCEPTION 'Per emettere il documento usa «Emetti»: il numero e i controlli sulla data si fanno lì. Se il pulsante non c''è, ricarica la pagina.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.numero_progressivo IS DISTINCT FROM OLD.numero_progressivo
       OR NEW.anno IS DISTINCT FROM OLD.anno THEN
      RAISE EXCEPTION 'Il numero di una fattura lo assegna l''emissione, non si scrive a mano.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Una bozza finita nel cestino torna bozza: lo fa solo documento_ripristina.
  IF OLD.stato = 'annullata' AND NEW.stato = 'bozza'
     AND coalesce(current_setting('fatturazione.ripristino', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
    RETURN NEW;
  END IF;

  -- Scartata dallo SDI (NS): per l'Agenzia non è mai stata emessa, si corregge
  -- e si rimanda con lo stesso numero e la stessa data (circ. 13/E/2018).
  v_scartata := upper(coalesce(OLD.sdi_stato, '')) = 'NS'
                AND OLD.stato NOT IN ('annullata', 'stornata');
  -- Emessa e mai uscita di qui: niente SDI, niente incassi, nessuna nota che la cita,
  -- nessuna email al cliente. Si corregge tenendo numero e data (16/11/2026).
  v_mai_uscita := public.documento_fattura_mai_uscita(OLD);
  v_correggibile := v_scartata OR v_mai_uscita;

  -- Annullarla (26/11/2026): il numero torna alla serie, quindi al suo posto va il
  -- segnaposto «Bozza …». E' l'unico campo in piu' che si apre, e solo dentro
  -- documento_elimina_bozza: stato e deleted_at sono gia' modificabili.
  IF v_mai_uscita
     AND coalesce(current_setting('fatturazione.annullamento', true), '') = 'on'
     AND NEW.stato = 'annullata'
     AND NEW.deleted_at IS NOT NULL
     AND NEW.numero LIKE 'Bozza %' THEN
    v_consentiti := v_consentiti || 'numero'::text;
  END IF;

  v_prima := to_jsonb(OLD);
  v_dopo  := to_jsonb(NEW);

  FOR v_campo IN SELECT jsonb_object_keys(v_dopo) LOOP
    IF v_prima -> v_campo IS DISTINCT FROM v_dopo -> v_campo THEN
      v_toccati := v_toccati || v_campo;
      v_diff := v_diff || jsonb_build_object(v_campo, jsonb_build_object(
        'prima', left(coalesce(v_prima ->> v_campo, ''), 500),
        'dopo',  left(coalesce(v_dopo  ->> v_campo, ''), 500)
      ));
      IF NOT (v_campo = ANY(v_consentiti))
         AND NOT (v_correggibile AND NOT (v_campo = ANY(v_fissi_scartata))) THEN
        v_violati := v_violati || v_campo;
      END IF;
    END IF;
  END LOOP;

  IF NEW.stato = 'bozza' AND OLD.stato IS DISTINCT FROM 'bozza' THEN
    -- ::text obbligatorio: `text[] || 'letterale'` viene risolto come
    -- concatenazione fra array, il letterale viene letto come array literal e
    -- salta fuori un 22P02 al posto del messaggio giusto.
    v_violati := v_violati || 'stato→bozza'::text;
  END IF;

  IF cardinality(v_violati) > 0 THEN
    IF v_mai_uscita THEN
      v_motivo := format(
        'Fattura n. %s: non è ancora uscita, quindi il contenuto si corregge — ma numero e data restano quelli (%s).',
        OLD.numero, array_to_string(v_violati, ', '));
    ELSIF v_scartata THEN
      v_motivo := format(
        'Fattura n. %s scartata dallo SDI: si corregge e si rimanda con lo stesso numero e la stessa data (circolare 13/E del 2018), quindi non si possono cambiare %s.',
        OLD.numero, array_to_string(v_violati, ', '));
    ELSE
      v_motivo := format(
        'Documento %s n. %s in stato "%s": non si possono modificare %s. Per correggerlo emetti una nota di credito.',
        OLD.tipo, OLD.numero, OLD.stato, array_to_string(v_violati, ', '));
    END IF;

    RAISE LOG 'documenti_fiscali: UPDATE rifiutata su % (% n.% %) campi=% da % / %',
      OLD.id, OLD.tipo, OLD.numero, OLD.stato,
      array_to_string(v_violati, ','), coalesce(auth.uid()::text,'—'), current_user;

    RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
  END IF;

  IF cardinality(v_toccati) > 0
     AND v_toccati <> ARRAY['updated_at']::text[] THEN
    INSERT INTO public.documenti_fiscali_storico (
      documento_id, company_id, operazione, esito,
      stato_prima, stato_dopo, campi, differenze
    ) VALUES (
      OLD.id, OLD.company_id, 'update', 'applicata',
      OLD.stato, NEW.stato, v_toccati, v_diff
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 3 ── Eliminare: una emessa mai uscita fa la strada della bozza.
create or replace function public.documento_elimina_bozza(p_documento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c_fiscali constant text[] := array['fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa','reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  c_serie_ft constant text[] := array['fattura','fattura_pa','nota_debito','autofattura','fattura_riepilogativa','reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'];
  v_doc      public.documenti_fiscali%rowtype;
  v_ana      public.anagrafica_azienda%rowtype;
  v_serie    text[];
  v_massimo  integer;
  v_ora      timestamptz := now();
  v_liberato boolean := false;
  v_mai_uscita boolean := false;
begin
  if auth.uid() is null then
    raise exception 'documento_elimina_bozza: serve un utente autenticato' using errcode = '42501';
  end if;
  select * into v_doc from public.documenti_fiscali where id = p_documento_id for update;
  if not found then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_doc.company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if not public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) then
    raise exception 'Non hai il permesso di gestire i documenti fiscali (serve «Fatturazione»).' using errcode = '42501';
  end if;

  -- Emessa ma mai uscita di qui (26/11/2026): per l'Agenzia non esiste, non c'e' niente
  -- da stornare. Si annulla e il numero torna alla serie, come per una bozza.
  v_mai_uscita := public.documento_fattura_mai_uscita(v_doc);

  if v_doc.stato <> 'bozza' and v_doc.stato <> 'annullata' and not v_mai_uscita then
    raise exception 'I documenti emessi non possono essere eliminati. Emetti una nota di credito per stornare la fattura.'
      using errcode = '22023';
  end if;

  if v_mai_uscita then
    -- Niente contabilita' appesa: se c'e', prima si stacca da li'.
    if exists (select 1 from public.movimenti_cassa_native m where m.documento_id = v_doc.id)
       or exists (select 1 from public.order_installments oi where oi.documento_fiscale_id = v_doc.id)
       or exists (select 1 from public.prima_nota_entries p where p.documento_fiscale_id = v_doc.id)
       or exists (select 1 from public.bank_reconciliations b where b.documento_id = v_doc.id)
       or exists (select 1 from public.appalto_sal a where a.documento_fiscale_id = v_doc.id)
       or exists (select 1 from public.generale_fatture g where g.documento_id = v_doc.id)
       or exists (select 1 from public.ritenute_bonifici rb where rb.documento_id = v_doc.id)
       or exists (select 1 from public.archivio_sostitutivo ar where ar.documento_id = v_doc.id) then
      raise exception 'La fattura % è collegata a incassi, rate, prima nota, banca o SAL: prima si staccano quei collegamenti, poi si annulla.', v_doc.numero
        using errcode = '22023';
    end if;
    perform set_config('fatturazione.annullamento', 'on', true);
  end if;

  perform set_config('fatturazione.emissione', 'on', true);
  if v_doc.tipo = any (c_fiscali) and v_doc.numero not like 'Bozza %' then
    update public.documenti_fiscali
       set stato = 'annullata', deleted_at = coalesce(deleted_at, v_ora), updated_at = v_ora,
           numero = 'Bozza ' || upper(left(replace(id::text, '-', ''), 8))
     where id = v_doc.id;

    select * into v_ana from public.anagrafica_azienda a where a.company_id = v_doc.company_id for update;
    if found and (v_doc.tipo = any (c_serie_ft) or (v_doc.tipo = 'nota_credito' and coalesce(v_ana.nc_serie_condivisa, false))) then
      v_serie := c_serie_ft || case when coalesce(v_ana.nc_serie_condivisa, false) then array['nota_credito'] else array[]::text[] end;
      if v_ana.anno_corrente_fattura = v_doc.anno then
        select coalesce(max(d.numero_progressivo), 0) into v_massimo
          from public.documenti_fiscali d
         where d.company_id = v_doc.company_id and d.anno = v_doc.anno
           and d.tipo = any (v_serie) and d.numero not like 'Bozza %';
        if v_massimo < coalesce(v_ana.ultimo_numero_fattura, 0) then
          update public.anagrafica_azienda set ultimo_numero_fattura = v_massimo where company_id = v_doc.company_id;
          v_liberato := true;
        end if;
      end if;
    elsif found and v_doc.tipo = 'nota_credito' and coalesce(v_ana.anno_corrente_nc, 0) = v_doc.anno then
      -- serie delle note di credito a parte: anche lei riprende il numero liberato
      select coalesce(max(d.numero_progressivo), 0) into v_massimo
        from public.documenti_fiscali d
       where d.company_id = v_doc.company_id and d.anno = v_doc.anno
         and d.tipo = 'nota_credito' and d.numero not like 'Bozza %';
      if v_massimo < coalesce(v_ana.ultimo_numero_nc, 0) then
        update public.anagrafica_azienda set ultimo_numero_nc = v_massimo where company_id = v_doc.company_id;
        v_liberato := true;
      end if;
    end if;
  else
    update public.documenti_fiscali
       set stato = 'annullata', deleted_at = coalesce(deleted_at, v_ora), updated_at = v_ora
     where id = v_doc.id;
  end if;
  perform set_config('fatturazione.emissione', 'off', true);
  perform set_config('fatturazione.annullamento', 'off', true);

  return jsonb_build_object('id', v_doc.id, 'numero_liberato', v_liberato, 'era_emessa', v_mai_uscita);
end;
$function$;

revoke all on function public.documento_elimina_bozza(uuid) from public, anon;
grant execute on function public.documento_elimina_bozza(uuid) to authenticated;
