-- Recovered from the production migration journal, already applied there.
-- The registered version predates the native general-project schema in Git.
-- Fresh databases defer the original SQL until 20290313155500; production does not rerun it.
create schema if not exists private;
create table if not exists private.commesse_recovered_patches(id text primary key);
alter table private.commesse_recovered_patches enable row level security;
revoke all on private.commesse_recovered_patches from public,anon,authenticated,service_role;

DO $defer_commesse_1$ BEGIN
IF to_regclass('public.unita_movimenti') IS NOT NULL AND to_regclass('public.generale_piano_voci') IS NOT NULL THEN
-- Follow-up: cashbook reversals, historical fiscal linkage and unit cash in collection history.

create or replace function public.generale_unita_incasso_contabilizza(p_movimento_id uuid,p_importo_cassa numeric,p_prima_nota_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; u public.unita_immobiliari;
begin
  select * into m from public.unita_movimenti where id=p_movimento_id;
  select * into u from public.unita_immobiliari where id=m.unita_id;
  perform public.generale_unita_puo_incassare(u.order_id);
  perform 1 from public.documenti_fiscali d where d.id=(select gf.documento_id from public.generale_fatture gf where gf.movimento_id=m.id) for update;
  perform 1 from public.unita_immobiliari where id=u.id for update;
  select * into m from public.unita_movimenti where id=p_movimento_id for update;
  if m.stornato_at is not null then raise exception 'Pagamento già stornato.' using errcode='22023'; end if;
  if m.prima_nota_id is not null then
    if m.importo_cassa is distinct from p_importo_cassa then raise exception 'Incasso già registrato con un importo diverso.' using errcode='22023'; end if;
  else
    if p_importo_cassa is null or p_importo_cassa<=0 or p_importo_cassa::text in ('NaN','Infinity','-Infinity') then raise exception 'Importo effettivo non valido.' using errcode='22023'; end if;
    update public.unita_movimenti set importo_cassa=round(p_importo_cassa,2) where id=m.id;
  end if;
  perform public.generale_unita_scrivi_prima_nota(m.id,p_prima_nota_id);
  perform public.generale_unita_incasso_collega_documento(gf.documento_id) from public.generale_fatture gf where gf.movimento_id=m.id;
  return (select prima_nota_id from public.unita_movimenti where id=m.id);
end $$;

create or replace function public.generale_unita_movimento_elimina(p_movimento_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; u public.unita_immobiliari; pn public.prima_nota_entries; rev uuid;
begin
  select * into m from public.unita_movimenti where id=p_movimento_id;
  select * into u from public.unita_immobiliari where id=m.unita_id;
  perform public.generale_unita_puo_incassare(u.order_id);
  perform 1 from public.documenti_fiscali where id=(select documento_fiscale_id from public.prima_nota_entries where id=m.prima_nota_id) for update;
  perform 1 from public.unita_immobiliari where id=u.id for update;
  select * into m from public.unita_movimenti where id=p_movimento_id for update;
  if m.stornato_at is not null then return; end if;
  select * into pn from public.prima_nota_entries where id=m.prima_nota_id for update;
  if pn.id is not null then
    insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,
      order_id,is_auto,auto_source,created_by,reversal_of,reference_number)
    values(m.company_id,'uscita','storno_incasso','Storno incasso unità '||u.sigla,pn.amount,
      (now() at time zone 'Europe/Rome')::date,u.order_id,true,'unita_storno',auth.uid(),pn.id,'EIC:UNITA:'||m.id::text)
    on conflict(reversal_of) where reversal_of is not null do nothing returning id into rev;
    if rev is null then select id into rev from public.prima_nota_entries where reversal_of=pn.id; end if;
  end if;
  update public.unita_movimenti set stornato_at=now(),stornato_da=auth.uid(),storno_prima_nota_id=rev where id=m.id;
  if pn.movimento_id is not null and exists(select 1 from public.movimenti_cassa_native where id=pn.movimento_id) then
    -- Mark the origin reversed before native cash callbacks run; they must not repost it.
    update public.prima_nota_entries set movimento_id=null where id=pn.id;
    perform public.storna_incasso_atomico(m.company_id,pn.movimento_id);
  end if;
end $$;

create or replace function public.generale_unita_prima_nota_guardia()
returns trigger language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; oid uuid; originale public.prima_nota_entries;
begin
  if tg_op='DELETE' then
    if (old.unita_movimento_id is not null or exists(select 1 from public.prima_nota_entries p where p.id=old.reversal_of and p.unita_movimento_id is not null)) and public.azienda_ancora_esiste(old.company_id) then raise exception 'Storna questo incasso dalla scheda dell''unità; originale e contropartita si conservano.' using errcode='22023'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and not public.azienda_ancora_esiste(old.company_id) then return new; end if;
  if tg_op='UPDATE' and exists(select 1 from public.prima_nota_entries p where p.id=old.reversal_of and p.unita_movimento_id is not null)
    and (new.reversal_of,new.company_id,new.order_id,new.amount,new.direction,new.entry_date) is distinct from (old.reversal_of,old.company_id,old.order_id,old.amount,old.direction,old.entry_date) then
    raise exception 'La contropartita di storno dell''unità è protetta.' using errcode='22023';
  end if;
  if new.reversal_of is not null then
    select * into originale from public.prima_nota_entries where id=new.reversal_of and unita_movimento_id is not null;
    if originale.id is not null then
      perform public.generale_unita_puo_incassare(originale.order_id);
      if (new.company_id,new.order_id,new.amount,new.direction) is distinct from (originale.company_id,originale.order_id,originale.amount,'uscita'::text) then
        raise exception 'Lo storno deve corrispondere all''incasso originale dell''unità.' using errcode='22023';
      end if;
    end if;
  end if;
  if tg_op='UPDATE' and old.unita_movimento_id is not null and
    (new.unita_movimento_id,new.company_id,new.order_id,new.amount,new.direction,new.entry_date,new.reversal_of)
      is distinct from (old.unita_movimento_id,old.company_id,old.order_id,old.amount,old.direction,old.entry_date,old.reversal_of) then
    raise exception 'Importo e origine dell''incasso unità sono protetti: usa lo storno.' using errcode='22023';
  end if;
  if new.unita_movimento_id is not null then
    select * into m from public.unita_movimenti where id=new.unita_movimento_id;
    select order_id into oid from public.unita_immobiliari where id=m.unita_id;
    if m.id is null or new.company_id is distinct from m.company_id or new.order_id is distinct from oid
       or new.direction<>'entrata' or new.amount is distinct from m.importo_cassa or new.entry_date<>m.data
       or new.reversal_of is not null then raise exception 'La prima nota non corrisponde al pagamento dell''unità.' using errcode='22023'; end if;
  end if;
  return new;
end $$;

create or replace function public.generale_unita_storno_da_prima_nota()
returns trigger language plpgsql security definer set search_path='' as $$
declare pn public.prima_nota_entries; m public.unita_movimenti;
begin
  select * into pn from public.prima_nota_entries where id=new.reversal_of and unita_movimento_id is not null;
  if pn.id is null then return new; end if;
  perform public.generale_unita_puo_incassare(pn.order_id);
  perform 1 from public.documenti_fiscali where id=pn.documento_fiscale_id for update;
  perform 1 from public.unita_immobiliari where order_id=pn.order_id for update;
  select * into m from public.unita_movimenti where id=pn.unita_movimento_id for update;
  update public.unita_movimenti set stornato_at=now(),stornato_da=auth.uid(),storno_prima_nota_id=new.id where id=m.id and stornato_at is null;
  if pn.movimento_id is not null then
    update public.prima_nota_entries set movimento_id=null where id=pn.id;
    perform public.storna_incasso_atomico(pn.company_id,pn.movimento_id);
  end if;
  return new;
end $$;

CREATE OR REPLACE FUNCTION public.rate_incassi(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, data date, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (select x.* from public.rate_importi(p_company) x join public.orders o on o.id=x.order_id where not (o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura') and not exists(select 1 from public.unita_immobiliari u where u.order_id=o.id)),
  mv as (
    select m.documento_id, m.data_movimento, m.importo
      from public.movimenti_cassa_native m
     where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
  ),
  tot as (select mv.documento_id, sum(mv.importo) as t, max(mv.data_movimento) as ultima from mv group by mv.documento_id)
  select r.order_id, r.installment_id, coalesce(r.paid_date, r.expected_date), r.importo
    from r where r.is_paid and r.documento_fiscale_id is null
  union all
  select r.order_id, r.installment_id, mv.data_movimento, mv.importo
    from r join mv on mv.documento_id = r.documento_fiscale_id
  union all
  select r.order_id, r.installment_id, coalesce(r.paid_date, t.ultima), r.importo - t.t
    from r join tot t on t.documento_id = r.documento_fiscale_id
   where r.is_paid and r.importo <> t.t and abs(r.importo - t.t) <= 0.011
  union all
  select d.order_id,coalesce(d.documento_id,d.invoice_id),coalesce(d.pagato_il,d.scadenza),d.pagato_lordo
    from public.commessa_documenti_credito(p_company) d join public.orders o on o.id=d.order_id
   where o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura' and d.pagato_lordo>0
  union all
  select pn.order_id,pn.id,pn.entry_date,pn.amount
    from public.prima_nota_entries pn join public.unita_immobiliari u on u.order_id=pn.order_id and u.company_id=pn.company_id
    join public.orders o on o.id=u.order_id and o.deleted_at is null
   where pn.company_id=p_company and pn.direction='entrata' and pn.reversal_of is null
     and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=pn.id)
$function$;

revoke all on function public.generale_unita_storno_da_prima_nota() from public,anon,authenticated;
drop trigger if exists z_unita_storno_da_prima_nota on public.prima_nota_entries;
create trigger z_unita_storno_da_prima_nota after insert on public.prima_nota_entries
for each row when (new.reversal_of is not null) execute function public.generale_unita_storno_da_prima_nota();

ELSE INSERT INTO private.commesse_recovered_patches(id) VALUES ('20261111165814_commesse_cassa_unita_coerenza.sql') ON CONFLICT DO NOTHING;
END IF; END $defer_commesse_1$;
