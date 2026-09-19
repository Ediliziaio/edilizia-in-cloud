-- «Non interessato» a un brand non zittisce gli altri due (18/09/2026).
--
-- L'iscrizione notturna (outreach_arruola_liste) scarta i contatti con
-- outreach_prospect_contacts.stato in ('unsubscribed','bounced','negative'),
-- in due punti: nella scelta dei candidati e nel controllo prima di iscrivere.
-- I primi due stati sono fatti dell'indirizzo — opt-out e casella inesistente —
-- e restano globali. «negative» no: è la risposta data A UN BRAND, e i tre
-- servizi sono distinti (decisione del titolare: «non deve fermarsi anche
-- negli altri brand perché sono distinti»). Ora un «no» esclude solo il brand
-- che l'ha ricevuto, letto dallo storico dell'azienda (brand_history, scritto
-- da outreach_release_brand_lock con esito 'risposta_negativa').
--
-- Si riscrive la sola condizione dentro la funzione viva, senza ricopiarne il
-- corpo: stessa tecnica di 20280918230000_registro_autore_vero.sql. Entrambi i
-- punti stanno dentro il giro per brand, dove v_brand e l'alias pc esistono.
do $$
declare
  v_def text;
  v_old text := 'pc.stato in (''unsubscribed'', ''bounced'', ''negative'')';
  v_sub text := '(pc.stato in (''unsubscribed'', ''bounced'')
                   or (pc.stato = ''negative'' and exists (
                         select 1
                           from outreach_prospect_companies pcc,
                                lateral jsonb_array_elements(coalesce(pcc.brand_history, ''[]''::jsonb)) h
                          where pcc.id = pc.prospect_company_id
                            and h->>''brand_id'' = v_brand.brand_id::text
                            and h->>''esito'' = ''risposta_negativa'')))';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'outreach_arruola_liste';
  if v_def is null or position(v_old in v_def) = 0 then
    raise notice 'outreach_arruola_liste: condizione già aggiornata o assente, niente da fare';
    return;
  end if;
  execute replace(v_def, v_old, v_sub);
end
$$;
