-- Le condizioni generali di contratto mancavano in sette moduli su dieci.
--
-- Ristrutturazione, Serramenti e Fotovoltaico avevano il campo; bagni, tetti,
-- climatizzazione, elettrico, termoidraulico, pavimenti e piscine no: il loro
-- preventivo usciva senza condizioni, quindi senza niente di scritto su tempi,
-- varianti, garanzie, pagamenti e recesso. Un preventivo firmato è il contratto:
-- senza condizioni quel contratto è muto.
--
-- Solo due colonne, come negli altri tre moduli. Il testo lo scrive l'azienda
-- nell'editor del modello (parte dal testo di base del settore).

do $$
declare t text;
begin
  foreach t in array array[
    'bgn_template_pdf', 'tet_template_pdf', 'clm_template_pdf', 'ele_template_pdf',
    'idr_template_pdf', 'pav_template_pdf', 'pis_template_pdf'
  ] loop
    execute format('alter table public.%I add column if not exists condizioni_legali_testo text', t);
    execute format('alter table public.%I add column if not exists condizioni_legali_attivo boolean not null default true', t);
    execute format(
      'comment on column public.%I.condizioni_legali_testo is %L', t,
      'Condizioni generali di contratto in markdown povero (# sezione, ## articolo, - elenco). Vuoto = il PDF non stampa la pagina delle condizioni.');
  end loop;
end $$;
