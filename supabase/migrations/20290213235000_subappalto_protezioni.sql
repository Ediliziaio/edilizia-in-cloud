-- ============================================================================
-- Collaudo dei subappalti (10/11/2026): protezioni nel database per quello che
-- prima era controllato solo dall'interfaccia. Trovato da due revisioni
-- indipendenti con prove in transazioni annullate.
--
-- Le funzioni del sistema (SECURITY DEFINER: variante, pagamento SAL, firma,
-- registrazione SAL) girano come proprietario, le edge function come
-- service_role: restano libere. Le regole valgono per le scritture DIRETTE dal
-- browser (current_user = authenticated).
--
-- 1. Contratto firmato: importo, oneri, commessa, ditta, ritenuta %, numero,
--    testi contrattuali, elenco lavori, clausole, PDF e firma non si cambiano
--    più dal browser (si cambiano con la variante). Stato, date di lavoro e
--    note restano libere.
-- 2. Un contratto firmato, o con SAL, ritenute o fatture, non si elimina (prima
--    l'eliminazione portava via i SAL a cascata). La commessa di un contratto
--    con SAL o ritenute non si cambia (SAL e ritenute restavano sulla vecchia).
-- 3. SAL: «pagato», l'importo pagato e gli importi del SAL li scrive solo la
--    registrazione del pagamento / del SAL. Un SAL pagato non si elimina. Dal
--    browser restano approva / contesta fra ricevuto, verificato, contestato.
-- 4. sal_sub_registra_con_garanzia: un SAL che porterebbe il totale oltre
--    importo + oneri del contratto è rifiutato («serve una variante»). I
--    contratti senza importo (0) restano liberi.
-- 5. Ditte sulla fase (order_external_teams): le scrive anche chi ha i
--    permessi commesse + costi dell'azienda, come già assegna_alle_fasi; prima
--    solo l'amministratore, e per gli altri «Assegna ditte e costi» non salvava
--    (in un caso diceva anche di aver salvato). Solo ditte della stessa azienda,
--    niente utenti bloccati o in sola lettura.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 + 2 ---------------------------------------------------------------------------
create or replace function public.contratto_subappalto_protetto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.firmato_il is not null then
      raise exception using errcode = '23514',
        message = 'Il contratto è firmato: non si elimina. Segnalo come «Risolto» dallo stato lavori.';
    end if;
    if exists (select 1 from public.sal_subappaltatori s where s.contratto_id = old.id)
       or exists (select 1 from public.ritenute_garanzia r where r.contratto_id = old.id)
       or exists (select 1 from public.fatture_ricevute f where f.contratto_subappalto_id = old.id) then
      raise exception using errcode = '23514',
        message = 'Ci sono SAL, ritenute o fatture collegati: il contratto non si elimina. Segnalo come «Risolto» dallo stato lavori.';
    end if;
    return old;
  end if;

  if old.firmato_il is not null and (
       new.firmato_il is distinct from old.firmato_il or new.firmato_da is distinct from old.firmato_da
    or new.company_id is distinct from old.company_id or new.order_id is distinct from old.order_id
    or new.subappaltatore_id is distinct from old.subappaltatore_id
    or new.importo_contrattuale is distinct from old.importo_contrattuale
    or new.oneri_sicurezza is distinct from old.oneri_sicurezza
    or new.ritenuta_garanzia_pct is distinct from old.ritenuta_garanzia_pct
    or new.numero_contratto is distinct from old.numero_contratto
    or new.data_stipula is distinct from old.data_stipula
    or new.descrizione_lavori is distinct from old.descrizione_lavori
    or new.obblighi is distinct from old.obblighi
    or new.modalita_pagamento is distinct from old.modalita_pagamento
    or new.penali is distinct from old.penali
    or new.garanzie is distinct from old.garanzie
    or new.durata_garanzia_mesi is distinct from old.durata_garanzia_mesi
    or new.elenco_lavori is distinct from old.elenco_lavori
    or new.articoli_personalizzati is distinct from old.articoli_personalizzati
    or new.pdf_path is distinct from old.pdf_path
    or new.firma_richiesta_id is distinct from old.firma_richiesta_id) then
    raise exception using errcode = '23514',
      message = 'Il contratto è firmato: importo, condizioni e firma si cambiano solo con una variante.';
  end if;

  if new.order_id is distinct from old.order_id
     and (exists (select 1 from public.sal_subappaltatori s where s.contratto_id = old.id)
          or exists (select 1 from public.ritenute_garanzia r where r.contratto_id = old.id)) then
    raise exception using errcode = '23514',
      message = 'Il contratto ha già SAL o ritenute su questa commessa: la commessa non si cambia.';
  end if;

  return new;
end;
$$;
revoke all on function public.contratto_subappalto_protetto() from public, anon, authenticated;

drop trigger if exists contratto_subappalto_protetto on public.contratti_subappalto;
create trigger contratto_subappalto_protetto
  before update or delete on public.contratti_subappalto
  for each row execute function public.contratto_subappalto_protetto();

-- 3 ---------------------------------------------------------------------------------
create or replace function public.sal_sub_protetto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
     or new.numero_sal is distinct from old.numero_sal
     or new.contratto_id is distinct from old.contratto_id
     or new.company_id is distinct from old.company_id then
    raise exception using errcode = '23514',
      message = 'Importi, numero e pagamenti del SAL si cambiano solo dalle registrazioni dedicate.';
  end if;
  return new;
end;
$$;
revoke all on function public.sal_sub_protetto() from public, anon, authenticated;

drop trigger if exists sal_sub_protetto on public.sal_subappaltatori;
create trigger sal_sub_protetto
  before update or delete on public.sal_subappaltatori
  for each row execute function public.sal_sub_protetto();

-- 4 ---------------------------------------------------------------------------------
do $$
declare
  def text;
  nuovo text;
  ancora text := 'if exists(select 1 from public.sal_subappaltatori where contratto_id=p_contratto and numero_sal=p_numero) then';
begin
  def := pg_get_functiondef('public.sal_sub_registra_con_garanzia(uuid,uuid,uuid,integer,date,numeric,numeric,text,text)'::regprocedure);
  if position('serve prima una variante' in def) > 0 then
    return;  -- già fatto
  end if;
  if position(ancora in def) = 0 then
    raise exception 'sal_sub_registra_con_garanzia: testo atteso non trovato';
  end if;
  nuovo := replace(def, ancora,
    ' -- Il totale dei SAL non supera importo + oneri del contratto (10/11/2026).
 if coalesce(c.importo_contrattuale,0) > 0 and p_stato <> ''contestato''
    and (select coalesce(sum(x.importo_lordo),0) from public.sal_subappaltatori x where x.contratto_id=c.id and x.stato<>''contestato'') + p_lordo
        > coalesce(c.importo_contrattuale,0) + coalesce(c.oneri_sicurezza,0) + 0.01 then
  raise exception ''Il SAL porta il totale oltre l''''importo del contratto: serve prima una variante'' using errcode=''23514''; end if;
 ' || ancora);
  execute nuovo;
end $$;

-- 5 ---------------------------------------------------------------------------------
drop policy if exists oet_scrittura_ufficio on public.order_external_teams;
create policy oet_scrittura_ufficio on public.order_external_teams
  for all to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_external_teams.order_id
         and o.company_id in (select unnest(public.aziende_con_permesso('can_edit_orders')))
         and o.company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
         and not public.utente_sola_lettura(o.company_id))
    and not (select public.utente_bloccato())
  )
  with check (
    exists (
      select 1 from public.orders o
       where o.id = order_external_teams.order_id
         and o.company_id in (select unnest(public.aziende_con_permesso('can_edit_orders')))
         and o.company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
         and not public.utente_sola_lettura(o.company_id)
         and (order_external_teams.external_team_id is null
              or exists (select 1 from public.external_teams e
                          where e.id = order_external_teams.external_team_id and e.company_id = o.company_id)))
    and not (select public.utente_bloccato())
  );
