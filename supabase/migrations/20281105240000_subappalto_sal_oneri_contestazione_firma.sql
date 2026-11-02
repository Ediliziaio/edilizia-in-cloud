set local lock_timeout='3s';
set local statement_timeout='60s';
-- Tre vicoli ciechi dei subappalti (audit del 31/10/2026). Niente DROP: idempotente con CREATE OR REPLACE e IF NOT EXISTS.
--
-- 1) SAL contestato: le misure restavano agganciate al SAL (sal_id) e non si potevano né annullare né rimettere
--    in un altro SAL. Ora contestare un SAL «a misure» le libera; togliere la contestazione a un SAL che le ha
--    perse è vietato con un messaggio chiaro (si rifà il SAL da Lavori e quantità). Un SAL a misure già pagato
--    non si contesta: si rischierebbe di pagare due volte le stesse quantità.
-- 2) Oneri della sicurezza: il SAL a misure valeva solo le misure, gli oneri non entravano mai in un SAL e
--    l'avanzamento non arrivava al 100%. Ora ogni SAL a misure porta la sua quota di oneri, in proporzione ai
--    lavori; il SAL che completa i lavori porta il residuo. La quota sta in sal_subappaltatori.oneri_quota.
-- 3) Firma elettronica in attesa: non si poteva annullare, e il reinvio lasciava viva la richiesta vecchia
--    (che blocca anche il caricamento della copia cartacea). subappalto_firma_annulla la annulla.

alter table public.sal_subappaltatori add column if not exists oneri_quota numeric(12,2) not null default 0;

create or replace function public.subappalto_sal_misure_coerenti() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sal_subappaltatori;totale numeric;quante integer;
begin
 select * into s from public.sal_subappaltatori where id=new.id;
 if s.id is null or not exists(select 1 from public.subappalto_quadri_lavori where contratto_id=s.contratto_id) then return null;end if;
 -- Un SAL contestato ha restituito le sue misure: non ha più fonti da confrontare.
 if s.stato='contestato' then return null;end if;
 select count(*),coalesce(sum(importo_riconosciuto),0) into quante,totale from public.subappalto_misure where sal_id=s.id;
 if quante=0 or totale<>s.importo_lordo-coalesce(s.oneri_quota,0) or exists(select 1 from public.subappalto_misure m where m.sal_id=s.id and (m.company_id<>s.company_id or m.contratto_id<>s.contratto_id or m.stato<>'riconosciuta'))
 then raise exception 'Questo contratto usa i lavori misurati: prepara il SAL da Lavori e quantità. Importo e fonti devono coincidere' using errcode='23514';end if;
 return null;
end $$;

create or replace function public.subappalto_sal_contestazione_misure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.stato='contestato' and old.stato is distinct from 'contestato' then
  if exists(select 1 from public.subappalto_misure where sal_id=old.id) then
   if old.stato='pagato' then raise exception 'SAL già pagato: non si contesta. Registra una rettifica con il subappaltatore' using errcode='23514';end if;
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
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='subappalto_sal_contestazione_misure' and tgrelid='public.sal_subappaltatori'::regclass) then
  create trigger subappalto_sal_contestazione_misure before update of stato on public.sal_subappaltatori
   for each row execute function public.subappalto_sal_contestazione_misure();
 end if;
end $$;

create or replace function public.subappalto_sal_da_misure(p_company uuid, p_contratto uuid, p_id uuid, p_misure uuid[], p_data date, p_ritenuta numeric, p_note text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;s public.sal_subappaltatori;m public.subappalto_misure;totale numeric:=0;n integer;v jsonb;conteggio integer:=0;
 lavori_prec numeric;oneri_prec numeric;quota numeric:=0;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if p_id is null or cardinality(p_misure) not between 1 and 100 or cardinality(p_misure)<>(select count(distinct x) from unnest(p_misure) x) then raise exception 'Seleziona misure distinte per questo SAL' using errcode='22023';end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 select * into s from public.sal_subappaltatori where id=p_id;
 for m in select * from public.subappalto_misure where id=any(p_misure) and company_id=p_company and contratto_id=c.id order by id for update loop
  if m.stato<>'riconosciuta' or (m.sal_id is not null and m.sal_id<>p_id) or (s.id is not null and m.sal_id is distinct from p_id) or m.data_rilievo>p_data then raise exception 'Misura non riconosciuta, già contabilizzata o successiva alla data SAL';end if;
  totale:=totale+m.importo_riconosciuto;conteggio:=conteggio+1;
 end loop;
 if conteggio<>cardinality(p_misure) or totale<=0 then raise exception 'Misure estranee o totale SAL non positivo' using errcode='23514';end if;
 if s.id is not null and exists(select 1 from public.subappalto_misure where sal_id=p_id and not(id=any(p_misure))) then raise exception 'Richiesta SAL già usata per altre misure';end if;
 -- Quota degli oneri della sicurezza: proporzionale ai lavori del SAL; chi completa i lavori prende il residuo.
 if coalesce(c.oneri_sicurezza,0)>0 then
  select coalesce(sum(importo_lordo-coalesce(oneri_quota,0)),0),coalesce(sum(oneri_quota),0) into lavori_prec,oneri_prec
   from public.sal_subappaltatori where contratto_id=c.id and stato<>'contestato' and id<>p_id;
  if c.importo_contrattuale<=0 or lavori_prec+totale>=c.importo_contrattuale then quota:=c.oneri_sicurezza-oneri_prec;
  else quota:=least(round(c.oneri_sicurezza*totale/c.importo_contrattuale,2),c.oneri_sicurezza-oneri_prec);end if;
  quota:=greatest(quota,0);
 end if;
 n:=s.numero_sal;
 if n is null then select coalesce(max(numero_sal),0)+1 into n from public.sal_subappaltatori where contratto_id=c.id;end if;
 v:=public.sal_sub_registra_con_garanzia(p_company,c.id,p_id,n,p_data,totale+quota,p_ritenuta,'verificato',p_note);
 update public.sal_subappaltatori set oneri_quota=quota where id=p_id and oneri_quota is distinct from quota;
 update public.subappalto_misure set sal_id=p_id,revisione=revisione+1 where id=any(p_misure) and sal_id is null;
 return v||jsonb_build_object('numero_sal',n,'importo_lordo',totale+quota,'importo_lavori',totale,'oneri_quota',quota);
end $$;

create or replace function public.subappalto_firma_annulla(p_company uuid, p_contratto uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare quante integer;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if not exists(select 1 from public.contratti_subappalto where id=p_contratto and company_id=p_company) then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 update public.signature_requests set status='cancelled',updated_at=now()
  where contratto_subappalto_id=p_contratto and company_id=p_company and status in('pending','otp_verified');
 get diagnostics quante=row_count;
 return jsonb_build_object('id',p_contratto,'annullate',quante);
end $$;
grant execute on function public.subappalto_firma_annulla(uuid,uuid) to authenticated;
