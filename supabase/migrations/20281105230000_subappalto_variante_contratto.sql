set local lock_timeout='3s';
set local statement_timeout='60s';
-- La «variante tracciata» di cui parlava l'errore «Base lavori già registrata»: finora non esisteva
-- nessun modo per crearla. Cambia importo e oneri di un contratto con base lavori registrata,
-- lasciando la storia (prima, dopo, motivo, chi, quando) e senza toccare misure e SAL già fatti.
create table if not exists public.subappalto_varianti_contratto (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 contratto_id uuid not null references public.contratti_subappalto(id),
 importo_prima numeric(12,2) not null,importo_dopo numeric(12,2) not null,
 oneri_prima numeric(12,2) not null,oneri_dopo numeric(12,2) not null,
 motivo text not null,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create index if not exists subappalto_varianti_contratto_idx on public.subappalto_varianti_contratto(company_id,contratto_id,created_at);
alter table public.subappalto_varianti_contratto enable row level security;
-- Policy creata solo se manca (senza DROP: l'MCP chiede una conferma che in sessione remota non arriva).
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='subappalto_varianti_contratto' and policyname='subappalto_varianti_leggi') then
  create policy subappalto_varianti_leggi on public.subappalto_varianti_contratto for select to authenticated
   using(auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id) and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id));
 end if;
end $$;

-- Il blocco sulla base registrata si apre solo dentro la RPC della variante.
create or replace function public.subappalto_base_contratto_protetta() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('app.subappalto_variante',true),'')='1' then return new;end if;
 if (new.company_id,new.order_id,new.subappaltatore_id,new.importo_contrattuale,new.oneri_sicurezza)
    is distinct from (old.company_id,old.order_id,old.subappaltatore_id,old.importo_contrattuale,old.oneri_sicurezza)
    and exists(select 1 from public.subappalto_quadri_lavori where contratto_id=old.id)
 then raise exception 'Base lavori già registrata: soggetti, importo e oneri richiedono una variante tracciata; non modificare il contratto originario' using errcode='23514';end if;
 return new;
end $$;

-- Importo in aumento: il quadro riceve una nuova revisione con una voce «Variante» a corpo per la differenza,
-- così totale voci = importo e le misure già registrate restano valide. Importo in riduzione: solo se non ci sono
-- misure né SAL (poi si riscrive il quadro da «Lavori e quantità»). Non si scende mai sotto il già contabilizzato.
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
 select coalesce(sum(importo_lordo),0) into sal_lordo from public.sal_subappaltatori where contratto_id=c.id and stato<>'contestato';
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
grant execute on function public.subappalto_variante_registra(uuid,uuid,numeric,numeric,text) to authenticated;
-- Permessi (REVOKE) nella migrazione successiva 20281105230100_subappalto_variante_contratto_permessi.
