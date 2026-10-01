-- Allegati del preventivo: li aggiunge e li toglie chi può modificare il preventivo (26/09/2026).
--
-- Le schede tecniche allegate (quote_pdf_attachments) finiscono nel PDF che il
-- cliente riceve e firma. qpa_ins e qpa_del chiedevano solo che il preventivo
-- fosse dell'azienda: uno staff che vede i preventivi col solo permesso delle
-- Commesse (can_view_orders), senza poterli modificare, aggiungeva e toglieva le
-- schede di qualsiasi preventivo della sua azienda.
--
-- Ora vale la regola delle righe del preventivo (quote_items, migrazione
-- 20280926084500), cioè quella di q_upd_preventivi: il super admin, oppure
-- l'azienda fra quelle col permesso di modificare i Preventivi (il titolare e gli
-- accessi multi-azienda da amministratore ci sono già), e il preventivo fra
-- quelli che lo staff vede (chi vede solo gli assegnati, solo i suoi). Mai il
-- cliente esterno del portale.
--
-- qpa_sel resta com'è: legge chi vede il preventivo (QuoteDetail). Il bloccato
-- lo ferma la RESTRICTIVE della tabella e il materiale di un'altra azienda il
-- trigger, tutti e due da 20280926120000. Le funzioni del server e il service
-- role non passano dalla RLS.
--
-- Provato il 26/09 dal guardiano degli accessi con utenti veri, in transazioni
-- annullate: 70 casi, nessun uso legittimo bloccato (QuoteBuilder,
-- OpportunityQuotesTab e la copia dei preventivi rifatti passo per passo). Perde
-- la scrittura, come voluto, chi vede i preventivi senza poterli modificare.

set local lock_timeout = '3s';

drop policy if exists qpa_ins on public.quote_pdf_attachments;
create policy qpa_ins on public.quote_pdf_attachments
  for insert to authenticated
  with check (not (select public.utente_e_cliente_esterno())
              and exists (select 1 from public.quotes q
                           where q.id = quote_pdf_attachments.quote_id
                             and q.company_id = (select public.get_my_company_id())
                             and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                                  or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                             and public.check_staff_visibility((select auth.uid()), q.assigned_to)));

drop policy if exists qpa_del on public.quote_pdf_attachments;
create policy qpa_del on public.quote_pdf_attachments
  for delete to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q
                      where q.id = quote_pdf_attachments.quote_id
                        and q.company_id = (select public.get_my_company_id())
                        and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                             or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                        and public.check_staff_visibility((select auth.uid()), q.assigned_to)));
