-- ════════════════════════════════════════════════════════════════════════════
-- I blocchi del preventivo: le scelte dell'azienda sui testi e sulle foto
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dal 22/09/2026 i preventivi hanno sei pagine nuove prese da una libreria unica
-- (supabase/functions/_shared/blocchiPreventivo.ts): Come funziona, Cosa è
-- compreso, Protezione della casa, Controlli di qualità, Documenti consegnati,
-- Diario fotografico. I testi e le foto di serie cambiano da un settore all'altro;
-- l'azienda li può cambiare dall'editor del modello.
--
-- Qui si salvano SOLO i campi che l'azienda ha cambiato, per blocco:
--   { "protezione": { "titolo": "...", "voci": [...], "foto": [...] }, ... }
-- Il resto resta di serie, anche quando i testi di serie migliorano. Se una pagina
-- esce lo decide l'ordine delle pagine del modello, come per le altre.
--
-- Aggiungere una colonna con un valore fisso non riscrive la tabella.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

do $$
declare
  t text;
begin
  foreach t in array array[
    'rst_template_pdf', 'bgn_template_pdf', 'tet_template_pdf', 'clm_template_pdf',
    'ele_template_pdf', 'idr_template_pdf', 'pav_template_pdf', 'pis_template_pdf',
    'sr_template_pdf', 'fv_template_pdf'
  ] loop
    execute format('alter table public.%I add column if not exists pdf_blocchi jsonb not null default %L::jsonb', t, '{}');
    execute format(
      'comment on column public.%I.pdf_blocchi is %L', t,
      'Blocchi del preventivo (come funziona, cosa è compreso, protezione, controlli, documenti, diario): '
      'solo i campi cambiati dall''azienda, per blocco. Il resto viene dalla libreria di serie (_shared/blocchiPreventivo.ts).'
    );
  end loop;
end $$;
