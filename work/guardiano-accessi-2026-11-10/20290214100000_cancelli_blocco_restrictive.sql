-- Tre cancelli d'accesso creati PERMISSIVE invece che RESTRICTIVE.
--
-- COSA SI POTEVA FARE PRIMA
-- In Postgres le policy PERMISSIVE si sommano in OR, le RESTRICTIVE in AND.
-- Un cancello come «l'utente bloccato non fa niente», se nasce PERMISSIVE
-- FOR ALL, non vieta: CONCEDE tutto a chiunque non sia bloccato, e si somma
-- alle policy per azienda rendendole inutili.
--
-- Tre tabelle con company_id hanno questo errore:
--   cg_rimanenze_lavori        blocco_utente_bloccato + permessi_solo_ufficio
--                              (nessuna RESTRICTIVE: le 4 policy per azienda
--                              di 20290116150000 non filtravano piu niente)
--   warehouse_rincari          warehouse_rincari_blocco_utente_bloccato
--                              (duplicato: la RESTRICTIVE corretta c'e' gia')
--   articoli_native_documenti  and_blocco_utente_bloccato
--                              (duplicato: la RESTRICTIVE corretta c'e' gia')
--
-- Nelle prime due il GRANT a authenticated comprende insert/update/delete,
-- quindi lo staff di un'altra azienda poteva leggere, modificare, cancellare e
-- inserire righe intestate a un'azienda non sua.
--
-- PROVATO COME
-- Blocco DO prima/dopo (una riga finta per un'azienda demo, utenti veri presi
-- al momento con una query, tutto annullato con RAISE EXCEPTION): staff di
-- un'altra azienda passava da 1/1/1/1 a 0/0/0/neg su lettura, modifica,
-- cancellazione e inserimento, e i casi legittimi restavano a posto.
--
-- CHI DEVE CONTINUARE A FUNZIONARE
--   - il membro dell'azienda, con le policy cg_rimanenze_select/insert/update/
--     delete (company_id = get_my_company_id());
--   - il super admin;
--   - le funzioni del server: cg_registra_rimanenza_lavori() scrive le
--     rimanenze e magazzino_annota_rincaro() i rincari, entrambe
--     SECURITY DEFINER di proprieta' di postgres, quindi non passano da RLS;
--   - il service role (edge function), che ha BYPASSRLS;
--   - la pagina delle schede tecniche fotovoltaico, che scrive
--     articoli_native_documenti dal browser con la policy and_scrittura.
--     ATTENZIONE: and_scrittura chiede uno tra can_edit_settings_pricing,
--     can_view_billing, can_edit_marketing_opportunities. Finche' il cancello
--     sbagliato era PERMISSIVE scriveva chiunque non fosse bloccato: dopo la
--     correzione vale il permesso, com'era inteso.

set local lock_timeout = '3s';

-- 1) cg_rimanenze_lavori: i due cancelli vanno rifatti RESTRICTIVE.
drop policy if exists blocco_utente_bloccato on public.cg_rimanenze_lavori;
create policy blocco_utente_bloccato on public.cg_rimanenze_lavori
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists permessi_solo_ufficio on public.cg_rimanenze_lavori;
create policy permessi_solo_ufficio on public.cg_rimanenze_lavori
  as restrictive for all to authenticated
  using (not (select public.e_solo_campo()))
  with check (not (select public.e_solo_campo()));

-- 2) warehouse_rincari: il cancello giusto (RESTRICTIVE blocco_utente_bloccato)
--    c'e' gia'; qui si butta solo il duplicato PERMISSIVE.
drop policy if exists warehouse_rincari_blocco_utente_bloccato on public.warehouse_rincari;

-- 3) articoli_native_documenti: idem, duplicato PERMISSIVE aperto a PUBLIC.
drop policy if exists and_blocco_utente_bloccato on public.articoli_native_documenti;

-- Rete di sicurezza: se una delle tre tabelle resta senza il cancello
-- RESTRICTIVE, o con una PERMISSIVE FOR ALL che non guarda l'azienda, la
-- migrazione si ferma invece di dichiararsi riuscita.
do $verifica$
declare
  v_tab text;
  v_aperte int;
  v_cancello int;
begin
  foreach v_tab in array array['cg_rimanenze_lavori', 'warehouse_rincari', 'articoli_native_documenti'] loop
    select count(*) into v_aperte
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class k on k.oid = p.polrelid
     where k.relnamespace = 'public'::pg_catalog.regnamespace
       and k.relname = v_tab
       and p.polpermissive and p.polcmd = '*'
       and coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') !~ 'company_id';
    if v_aperte > 0 then
      raise exception 'su %: restano % policy PERMISSIVE FOR ALL che non guardano company_id', v_tab, v_aperte;
    end if;

    select count(*) into v_cancello
      from pg_catalog.pg_policy p
      join pg_catalog.pg_class k on k.oid = p.polrelid
     where k.relnamespace = 'public'::pg_catalog.regnamespace
       and k.relname = v_tab
       and not p.polpermissive
       and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ~ 'utente_bloccato';
    if v_cancello = 0 then
      raise exception 'su %: manca la RESTRICTIVE del blocco utente', v_tab;
    end if;
  end loop;
end $verifica$;
