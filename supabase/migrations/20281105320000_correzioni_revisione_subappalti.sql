set local lock_timeout='3s';
set local statement_timeout='60s';
-- Correzioni dalla revisione del 31/10/2026 sulle migrazioni di oggi. Solo CREATE OR REPLACE.
-- 1) Variante: il confronto «sotto i SAL già registrati» usava il lordo dei SAL, che comprende gli oneri:
--    a contratto quasi finito bloccava anche le varianti in aumento. Ora confronta i soli lavori.
-- 2) Contestazione: bloccata anche se il SAL è pagato in parte (stato ancora «verificato»).
-- 3) Scheda della ditta con contratti: il messaggio diceva «risolvi i contratti», che non sblocca nulla.
-- 4) Pagamenti della commessa: in reverse charge l'IVA si mostra a parte (iva_da_versare), non dentro pagato e
--    residuo (alla ditta si paga l'imponibile); la ditta col contratto sparisce solo se il contratto ha SAL;
--    aliquota della riga della ditta; quota dei SAL del cliente con gli stessi stati della scheda SAL;
--    contratto con gli oneri (si confronta col maturato, che li comprende).

create or replace function public.subappalto_variante_registra(p_company uuid,p_contratto uuid,p_importo numeric,p_oneri numeric,p_motivo text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;q public.subappalto_quadri_lavori;delta numeric;sal_lordo numeric;misure integer;v_id uuid:=gen_random_uuid();
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if p_importo is null or p_oneri is null or p_importo<0 or p_oneri<0 or p_importo>999999999 or p_oneri>999999999
 or p_importo<>round(p_importo,2) or p_oneri<>round(p_oneri,2)
 or length(btrim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Scrivi importo, oneri e il motivo della variante' using errcode='22023';end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null or not exists(select 1 from public.orders where id=c.order_id and company_id=p_company and deleted_at is null) then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 if p_importo=c.importo_contrattuale and p_oneri=c.oneri_sicurezza then raise exception 'Importo e oneri sono uguali a quelli del contratto: niente da variare' using errcode='22023';end if;
 delta:=p_importo-c.importo_contrattuale;
 -- Solo i lavori dei SAL: dalla 20281105240000 importo_lordo comprende anche la quota degli oneri.
 select coalesce(sum(importo_lordo-coalesce(oneri_quota,0)),0) into sal_lordo from public.sal_subappaltatori where contratto_id=c.id and stato<>'contestato';
 select count(*) into misure from public.subappalto_misure where contratto_id=c.id and stato<>'annullata';
 if p_importo<sal_lordo then raise exception 'Il nuovo importo (%) è sotto i SAL già registrati (%)',p_importo,sal_lordo using errcode='23514';end if;
 select * into q from public.subappalto_quadri_lavori where contratto_id=c.id order by revisione desc limit 1;
 if q.id is not null and delta<0 and (misure>0 or sal_lordo>0) then raise exception 'Per ridurre l''importo non devono esserci misure né SAL: annulla le misure oppure registra una variante in aumento' using errcode='23514';end if;
 perform set_config('app.subappalto_variante','1',true);
 update public.contratti_subappalto set importo_contrattuale=p_importo,oneri_sicurezza=p_oneri where id=c.id;
 perform set_config('app.subappalto_variante','',true);
 if q.id is not null and delta>0 then
  insert into public.subappalto_quadri_lavori(id,company_id,contratto_id,revisione,voci,maturazione,giorni_pagamento,importo_lavori,contratto_snapshot,motivo,richiesta,created_by)
  values(v_id,p_company,c.id,q.revisione+1,
   q.voci||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'fase_id',null,'descrizione','Variante: '||btrim(p_motivo),'base','corpo','unita','quota','quantita',1,'prezzo',delta,'importo',delta)),
   q.maturazione,q.giorni_pagamento,p_importo,
   jsonb_build_object('numero',c.numero_contratto,'descrizione',c.descrizione_lavori,'importo_lavori',p_importo,'oneri_sicurezza',p_oneri,'modalita_pagamento',c.modalita_pagamento,'firmato_il',c.firmato_il),
   'Variante: '||btrim(p_motivo),jsonb_build_object('variante',true,'id',v_id),auth.uid());
 end if;
 insert into public.subappalto_varianti_contratto(company_id,contratto_id,importo_prima,importo_dopo,oneri_prima,oneri_dopo,motivo,created_by)
 values(p_company,c.id,c.importo_contrattuale,p_importo,c.oneri_sicurezza,p_oneri,btrim(p_motivo),auth.uid());
 return jsonb_build_object('importo',p_importo,'oneri',p_oneri,'quadro_da_riscrivere',(q.id is not null and delta<0));
end $$;

create or replace function public.subappalto_sal_contestazione_misure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.stato='contestato' and old.stato is distinct from 'contestato' then
  if exists(select 1 from public.subappalto_misure where sal_id=old.id) then
   -- Anche un pagamento parziale (lo stato resta «verificato»): liberare le misure le farebbe pagare due volte.
   if old.stato='pagato' or coalesce(old.pagato_registrato,0)>0 then raise exception 'SAL già pagato, anche in parte: non si contesta. Registra una rettifica con il subappaltatore' using errcode='23514';end if;
   update public.subappalto_misure set sal_id=null,revisione=revisione+1 where sal_id=old.id;
  end if;
 elsif old.stato='contestato' and new.stato is distinct from 'contestato' then
  if exists(select 1 from public.subappalto_quadri_lavori where contratto_id=old.contratto_id)
     and not exists(select 1 from public.subappalto_misure where sal_id=old.id) then
   raise exception 'Alla contestazione le misure di questo SAL sono state liberate: prepara un SAL nuovo da Lavori e quantità' using errcode='23514';
  end if;
 end if;
 return new;
end $$;

create or replace function public.subappaltatore_scheda_con_contratti() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and exists(select 1 from public.contratti_subappalto where subappaltatore_id=old.id) then
  raise exception 'Questa ditta ha contratti di subappalto (anche risolti o completati): la scheda non si elimina. Disattiva la ditta, oppure elimina prima i contratti che non servono.' using errcode='23503';
 end if;
 return old;
end $$;

