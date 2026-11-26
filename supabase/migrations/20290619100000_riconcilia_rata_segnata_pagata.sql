-- Riconciliare una rata segnata pagata senza pagamento registrato (26/11/2026, segnalato da un'azienda).
--
-- La migrazione 20290616100000 ha rimesso fra i candidati della riconciliazione le rate
-- segnate «pagata» che hanno ancora un residuo scoperto (il 4/11 un UPDATE in blocco ha
-- acceso `company_costs.is_paid` su centinaia di costi senza registrare nessun pagamento),
-- con l'etichetta «Segnata pagata · pagamento non registrato». Il suo commento prometteva:
-- «attaccarci il movimento sistema lo stato invece di aggirarlo».
--
-- Ma `fornitore_registra_quota_banca` non era stata adeguata: appena il titolare attacca il
-- movimento, ribatte «La rata del fornitore richiede una verifica (stato pagata)». La rata
-- compare in riconciliazione ma non ci si può fare niente: prima bisogna andare in Fatture
-- ricevute e cliccare «Riapri». Buco che qui si chiude.
--
-- Soluzione: nel ramo della rata, quando la rata è segnata pagata ma il costo è `is_paid`
-- senza pagamento registrato (residuo scoperto), la si RIAPRE come fa `riapri_pagamenti_segnati`
-- — `is_paid = false`, e il trigger `costo_allinea_rate_fornitori` riporta rata e fattura a
-- «da pagare» — poi si prosegue normalmente. Attaccare il movimento vero sistema lo stato.
-- I blocchi veri restano: stornata, da_bloccare, richiamata, e il costo annullato.
--
-- Questo NON rimpiazza l'avviso «Riapri» in Fatture ricevute: quello è il modo di CAPIRE
-- cos'è successo e correggerlo a mano (vale anche per chi la banca non ce l'ha). Qui si fa
-- in modo che chi riconcilia dalla banca non debba fare il giro.

create or replace function private.fornitore_registra_quota_banca(p_company uuid, p_tx uuid, p_tipo text, p_documento uuid, p_importo numeric, p_data date, p_nota text)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  r public.rate_fornitori%rowtype;
  f public.fatture_ricevute%rowtype;
  fattura uuid;
  residuo numeric;
  chiude boolean;
  fattura_segnata boolean:=false;
  costo_segnato boolean:=false;
  stato_prima text;
  stato_il timestamptz;
  titolo text;
begin
  if p_tipo='rata_fornitore' then
    select x.fattura_ricevuta_id into fattura from public.rate_fornitori x where x.id=p_documento and x.company_id=p_company;
  else
    fattura:=p_documento;
  end if;
  if fattura is not null then
    select * into f from public.fatture_ricevute where id=fattura and company_id=p_company for update;
    if not found or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento)
      or f.stato in ('annullata','scartata','rifiutata','eliminata') then
      raise exception 'Fattura del fornitore da verificare.' using errcode='22023';
    end if;
  end if;

  if p_tipo='rata_fornitore' then
    select * into r from public.rate_fornitori where id=p_documento and company_id=p_company for update;
    if not found then raise exception 'Rata del fornitore non trovata.' using errcode='P0002'; end if;
    if r.fattura_ricevuta_id is distinct from fattura then raise exception 'La rata è cambiata.' using errcode='PT409'; end if;

    -- Segnata pagata senza pagamento registrato (vedi 20290616100000): la rata dice «pagata»
    -- ma c'è ancora un residuo scoperto perché il costo è is_paid senza una scrittura di
    -- prima nota. Non la si rifiuta: la si riapre come fa riapri_pagamenti_segnati
    -- (is_paid=false → il trigger costo_allinea_rate_fornitori riapre rata e fattura) e si
    -- prosegue. Attaccare il movimento vero sistema lo stato, come promette la lista candidati.
    if r.stato='pagata'
       and private.fornitore_residuo_rata(r) > 0.005
       and exists(select 1 from public.company_costs c where c.id=r.company_cost_id and c.company_id=p_company
         and coalesce(c.is_paid,false) and c.annullato_il is null) then
      update public.company_costs set is_paid=false, paid_date=null, updated_at=now()
      where id=r.company_cost_id and company_id=p_company;
      select * into r from public.rate_fornitori where id=p_documento and company_id=p_company for update;
      if fattura is not null then
        select * into f from public.fatture_ricevute where id=fattura and company_id=p_company for update;
      end if;
    end if;

    if r.stato in ('pagata','stornata','da_bloccare','richiamata') then
      raise exception 'La rata del fornitore richiede una verifica (stato %).',r.stato using errcode='22023';
    end if;
    if exists(select 1 from public.company_costs c where c.id=r.company_cost_id and c.company_id=p_company
      and (c.annullato_il is not null or c.is_paid)) then
      raise exception 'Verifica lo stato del costo collegato alla rata.' using errcode='22023';
    end if;
    residuo:=private.fornitore_residuo_rata(r);
    stato_prima:=r.stato;
    titolo:='Rata fornitore n. '||r.numero;
  else
    if f.pagata_il is not null then
      raise exception 'La fattura è già pagata: collega il movimento come prova.' using errcode='22023';
    end if;
    if exists(select 1 from public.rate_fornitori x where x.company_id=p_company and x.fattura_ricevuta_id=f.id and x.stato<>'stornata') then
      raise exception 'La fattura è a rate: scegli la rata del fornitore.' using errcode='22023';
    end if;
    select s.residuo into residuo from private.fatture_ricevute_calcola_saldi(p_company,null,f.id) s;
    titolo:='Fattura fornitore n. '||f.numero_fattura;
  end if;
  if exists(select 1 from public.scadenze x where x.company_id=p_company
    and x.cost_id=coalesce(r.company_cost_id,f.company_cost_id) and x.direction='uscita'
    and x.status in ('da_pagare','parziale') and not coalesce(x.is_previsionale,false)) then
    raise exception 'Scegli la scadenza aperta per registrare il pagamento.' using errcode='22023';
  end if;
  if exists(select 1 from public.bank_reconciliations x where x.company_id=p_company and x.transaction_id=p_tx
    and x.unmatched_at is null and ((r.id is not null and x.rata_fornitore_id=r.id)
      or (r.id is null and x.rata_fornitore_id is null and x.fattura_ricevuta_id=f.id))) then
    raise exception 'Questo documento è già su questo movimento.' using errcode='23505';
  end if;
  if residuo is null or residuo<=0 or p_importo>residuo then
    raise exception 'Controlla il residuo verso il fornitore (% €).',residuo using errcode='22023';
  end if;

  chiude:=p_importo=residuo;
  if chiude and r.id is not null then
    update public.rate_fornitori set stato='pagata',pagata_il=p_data
    where id=r.id and company_id=p_company returning stato_cambiato_il into stato_il;
  end if;
  if chiude and f.id is not null and not exists(
    select 1 from public.rate_fornitori x where x.company_id=p_company and x.fattura_ricevuta_id=f.id
      and x.stato not in ('pagata','stornata')) then
    update public.fatture_ricevute set pagata_il=p_data,pagamento_segnato_da=auth.uid(),pagamento_segnato_at=now()
    where id=f.id and company_id=p_company and pagata_il is null;
    fattura_segnata:=found;
    if fattura_segnata and r.id is null and f.company_cost_id is not null
      and not exists(select 1 from public.fatture_ricevute altra where altra.company_id=p_company
        and altra.company_cost_id=f.company_cost_id and altra.id<>f.id
        and altra.stato not in ('annullata','scartata','rifiutata','eliminata'))
      and not exists(select 1 from public.scadenze x where x.company_id=p_company
        and x.cost_id=f.company_cost_id and x.direction='uscita' and x.status in ('da_pagare','parziale')) then
      update public.company_costs set is_paid=true,paid_date=p_data,updated_at=now()
      where id=f.company_cost_id and company_id=p_company and not coalesce(is_paid,false);
      costo_segnato:=found;
    end if;
  end if;
  insert into public.bank_reconciliations(company_id,transaction_id,rata_fornitore_id,fattura_ricevuta_id,matched_amount,
    match_type,matched_at,matched_by,notes,ripartita,payment_source)
  values(p_company,p_tx,r.id,f.id,p_importo,'manual',now(),auth.uid(),concat_ws(' · ',titolo,p_nota),true,
    jsonb_strip_nulls(jsonb_build_object('tipo','quota_fornitore','chiude',chiude,'stato_prima',stato_prima,
      'stato_rata_il',stato_il,'data',p_data,'fattura_segnata',fattura_segnata,'costo_segnato',costo_segnato)));
end
$function$;
revoke all on function private.fornitore_registra_quota_banca(uuid,uuid,text,uuid,numeric,date,text) from public,anon,authenticated,service_role;
