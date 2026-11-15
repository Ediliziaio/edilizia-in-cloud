-- Acconto al subappaltatore e suo recupero nei SAL (area D, 15/11/2026).
--
-- A volte il contratto di subappalto prevede un acconto (anticipazione): il subappaltatore lo
-- fattura prima di qualunque SAL, e poi si recupera nei SAL successivi. Prima non c'era dove
-- scriverlo: la fattura d'acconto risultava «SAL mancante», e nessuno scalava l'acconto dai
-- SAL, così si pagava due volte la stessa parte di lavori.
--
-- Ora:
-- 1. contratti_subappalto.acconto_importo (e acconto_recupero_pct: la quota di ogni SAL che va a
--    recupero; vuota = in proporzione, acconto / valore del contratto).
-- 2. sal_subappaltatori.acconto_recuperato: quanto acconto recupera quel SAL. Lo calcola
--    sal_sub_registra_con_garanzia e il browser non lo cambia (sal_sub_protetto).
--    Si recupera solo l'acconto GIÀ FATTURATO (fatture collegate al contratto senza SAL), mai
--    oltre il residuo; l'ultimo SAL, quello che porta i lavori al valore del contratto,
--    recupera tutto quello che resta. Un SAL contestato non recupera niente.
-- 3. importo_netto (colonna calcolata) = lordo − ritenuta − acconto recuperato: è il netto che
--    il subappaltatore fattura e che si paga. Per i SAL esistenti acconto_recuperato è 0, quindi
--    il netto non cambia.
--
-- Nessun dato esistente cambia valore: le colonne nascono a 0 / vuote.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.contratti_subappalto
  ADD COLUMN IF NOT EXISTS acconto_importo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acconto_recupero_pct numeric(5,2);
ALTER TABLE public.sal_subappaltatori
  ADD COLUMN IF NOT EXISTS acconto_recuperato numeric(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratti_subappalto_acconto_check') THEN
    ALTER TABLE public.contratti_subappalto ADD CONSTRAINT contratti_subappalto_acconto_check
      CHECK (acconto_importo >= 0 AND (acconto_recupero_pct IS NULL OR (acconto_recupero_pct > 0 AND acconto_recupero_pct <= 100)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sal_subappaltatori_acconto_recuperato_check') THEN
    ALTER TABLE public.sal_subappaltatori ADD CONSTRAINT sal_subappaltatori_acconto_recuperato_check
      CHECK (acconto_recuperato >= 0 AND acconto_recuperato <= importo_lordo);
  END IF;
  IF position('acconto_recuperato' in (
       SELECT pg_get_expr(d.adbin, d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = 'public.sal_subappaltatori'::regclass AND a.attname = 'importo_netto')) = 0 THEN
    ALTER TABLE public.sal_subappaltatori ALTER COLUMN importo_netto
      SET EXPRESSION AS (importo_lordo - round(importo_lordo * ritenuta_pct / 100, 2) - acconto_recuperato);
  END IF;
END $$;

COMMENT ON COLUMN public.contratti_subappalto.acconto_importo IS
  'Acconto (anticipazione) previsto dal contratto: si fattura senza SAL e si recupera nei SAL.';
COMMENT ON COLUMN public.contratti_subappalto.acconto_recupero_pct IS
  'Quota di ogni SAL che recupera l''acconto, in percentuale. Vuota = acconto / valore del contratto.';
COMMENT ON COLUMN public.sal_subappaltatori.acconto_recuperato IS
  'Acconto recuperato da questo SAL (lo calcola sal_sub_registra_con_garanzia). Il netto è già al netto di questo.';

-- Il browser non cambia il recupero dell'acconto (come lordo, ritenuta e oneri).
CREATE OR REPLACE FUNCTION public.sal_sub_protetto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.stato = 'pagato' or coalesce(old.pagato_registrato, 0) > 0 then
      raise exception using errcode = '23514', message = 'Il SAL ha già un pagamento: non si elimina.';
    end if;
    return old;
  end if;

  if new.stato is distinct from old.stato and (new.stato = 'pagato' or old.stato = 'pagato') then
    raise exception using errcode = '23514',
      message = 'Lo stato «pagato» lo mette e lo toglie solo la registrazione del pagamento.';
  end if;
  if new.pagato_registrato is distinct from old.pagato_registrato
     or new.data_pagamento is distinct from old.data_pagamento
     or new.importo_lordo is distinct from old.importo_lordo
     or new.ritenuta_pct is distinct from old.ritenuta_pct
     or new.oneri_quota is distinct from old.oneri_quota
     or new.acconto_recuperato is distinct from old.acconto_recuperato
     or new.numero_sal is distinct from old.numero_sal
     or new.contratto_id is distinct from old.contratto_id
     or new.company_id is distinct from old.company_id then
    raise exception using errcode = '23514',
      message = 'Importi, numero e pagamenti del SAL si cambiano solo dalle registrazioni dedicate.';
  end if;
  return new;
end;
$function$;

-- La registrazione del SAL calcola anche il recupero dell'acconto.
CREATE OR REPLACE FUNCTION public.sal_sub_registra_con_garanzia(p_company uuid, p_contratto uuid, p_id uuid, p_numero integer, p_data date, p_lordo numeric, p_ritenuta numeric, p_stato text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.contratti_subappalto; s public.sal_subappaltatori; rid uuid; trattenuta numeric;
  v_valore numeric; v_cumulato numeric; v_acc_fatturato numeric; v_gia numeric; v_residuo numeric; v_pct numeric; v_recupero numeric := 0;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false)
 then raise exception 'Registrazione SAL non autorizzata' using errcode='42501'; end if;
 if p_id is null or p_numero is null or p_numero<1 or p_data is null or p_data<date '2000-01-01' or p_data>(now() at time zone 'Europe/Rome')::date
 or p_lordo is null or p_lordo<=0 or p_lordo>9999999999.99 or p_lordo<>round(p_lordo,2)
 or p_ritenuta is null or p_ritenuta<0 or p_ritenuta>100 or p_ritenuta<>round(p_ritenuta,2)
 or p_stato is null or p_stato not in ('ricevuto','verificato','contestato') or length(coalesce(p_note,''))>6000
 then raise exception 'Dati SAL non validi: il pagamento si registra separatamente' using errcode='22023'; end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null or not exists(select 1 from public.orders where id=c.order_id and company_id=p_company and deleted_at is null)
 or not exists(select 1 from public.subappaltatori_sicurezza where id=c.subappaltatore_id and company_id=p_company)
 then raise exception 'Contratto non disponibile per questa azienda' using errcode='42501'; end if;
 -- Lock del contratto serializza numero e ritentativi anche tra sessioni diverse.
 select * into s from public.sal_subappaltatori where id=p_id;
 if s.id is not null then
  if (s.company_id,s.contratto_id,s.numero_sal,s.data_emissione,s.importo_lordo,s.ritenuta_pct,s.stato,s.note)
    is distinct from (p_company,p_contratto,p_numero,p_data,p_lordo,p_ritenuta,p_stato,nullif(btrim(p_note),'')) then
    raise exception 'Richiesta già usata con dati diversi: rileggi i SAL prima di riprovare' using errcode='23505'; end if;
  return jsonb_build_object('id',s.id,'gia_registrato',true);
 end if;
  -- Il totale dei SAL non supera importo + oneri del contratto (10/11/2026).
 select coalesce(sum(x.importo_lordo),0) into v_cumulato from public.sal_subappaltatori x where x.contratto_id=c.id and x.stato<>'contestato';
 v_valore := coalesce(c.importo_contrattuale,0) + coalesce(c.oneri_sicurezza,0);
 if coalesce(c.importo_contrattuale,0) > 0 and p_stato <> 'contestato' and v_cumulato + p_lordo > v_valore + 0.01 then
  raise exception 'Il SAL porta il totale oltre l''importo del contratto: serve prima una variante' using errcode='23514'; end if;
 if exists(select 1 from public.sal_subappaltatori where contratto_id=p_contratto and numero_sal=p_numero) then
  raise exception 'Numero SAL già presente nel contratto: aggiorna la numerazione' using errcode='23505'; end if;
 trattenuta:=round(p_lordo*p_ritenuta/100,2);

 -- Recupero dell'acconto (15/11/2026): solo quello già fatturato, mai oltre il residuo né il netto.
 if coalesce(c.acconto_importo,0) > 0 and p_stato <> 'contestato' then
  select coalesce(sum(case when f.tipo_documento = 'TD04' then -abs(coalesce(f.imponibile_totale, f.totale_documento, 0))
                           else coalesce(f.imponibile_totale, f.totale_documento, 0) end), 0)
    into v_acc_fatturato
    from public.fatture_ricevute f
   where f.company_id = p_company and f.contratto_subappalto_id = c.id and f.sal_subappaltatore_id is null
     and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata');
  select coalesce(sum(x.acconto_recuperato),0) into v_gia from public.sal_subappaltatori x where x.contratto_id=c.id and x.stato<>'contestato';
  v_residuo := greatest(least(c.acconto_importo, v_acc_fatturato) - v_gia, 0);
  v_pct := coalesce(c.acconto_recupero_pct, case when v_valore > 0 then c.acconto_importo / v_valore * 100 end, 100);
  v_recupero := least(v_residuo, round(p_lordo * v_pct / 100, 2));
  if v_valore > 0 and v_cumulato + p_lordo >= v_valore - 0.01 then v_recupero := v_residuo; end if;
  v_recupero := greatest(least(v_recupero, p_lordo - trattenuta), 0);
 end if;

 if trattenuta>0 then perform public.fiscalita_verifica_scrittura(p_company); end if;
 insert into public.sal_subappaltatori(id,company_id,contratto_id,subappaltatore_id,order_id,numero_sal,data_emissione,importo_lordo,ritenuta_pct,stato,note,acconto_recuperato)
 values(p_id,p_company,c.id,c.subappaltatore_id,c.order_id,p_numero,p_data,p_lordo,p_ritenuta,p_stato,nullif(btrim(p_note),''),v_recupero) returning * into s;
 if trattenuta>0 then
  insert into public.ritenute_garanzia(company_id,contratto_id,sal_id,importo,stato,percentuale_applicata,direzione,note)
  values(p_company,c.id,s.id,s.ritenuta_importo,'trattenuta',p_ritenuta,'passiva','Garanzia collegata al SAL n. '||p_numero) returning id into rid;
  if p_stato='contestato' then
   update public.ritenute_garanzia set stato='annullata',note='SAL n. '||p_numero||' contestato alla registrazione: garanzia esclusa dal riconosciuto' where id=rid;
  end if;
 end if;
 return jsonb_build_object('id',s.id,'ritenuta_id',rid,'gia_registrato',false,'acconto_recuperato',v_recupero);
end $function$;
