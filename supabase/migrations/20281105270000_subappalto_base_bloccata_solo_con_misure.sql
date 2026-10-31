set local lock_timeout='3s';
set local statement_timeout='60s';
-- Dimora Torino, 31/10/2026: il contratto «Marin» aveva una base lavori di una voce da 1 € (impostata per
-- prova), nessuna misura e nessun SAL, e l'importo non si poteva più cambiare. Una base senza misure né SAL
-- è solo un piano: commessa, ditta, importo e oneri restano modificabili. Si bloccano (e passano dalla
-- variante tracciata) solo quando ci sono misure registrate o SAL.
create or replace function public.subappalto_base_contratto_protetta() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('app.subappalto_variante',true),'')='1' then return new;end if;
 if (new.company_id,new.order_id,new.subappaltatore_id,new.importo_contrattuale,new.oneri_sicurezza)
    is distinct from (old.company_id,old.order_id,old.subappaltatore_id,old.importo_contrattuale,old.oneri_sicurezza)
    and exists(select 1 from public.subappalto_quadri_lavori where contratto_id=old.id)
    and (exists(select 1 from public.subappalto_misure where contratto_id=old.id and stato<>'annullata')
      or exists(select 1 from public.sal_subappaltatori where contratto_id=old.id and stato<>'contestato' and importo_lordo>0))
 then raise exception 'Il contratto ha già misure o SAL registrati: importo e oneri si cambiano con una variante (pulsante «Variante» o direttamente da «Modifica»)' using errcode='23514';end if;
 return new;
end $$;
