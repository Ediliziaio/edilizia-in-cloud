-- ════════════════════════════════════════════════════════════════════════════
-- Modulo di recesso: una scelta del modello, spenta di serie
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dal 21/09/2026 i preventivi allegavano il modulo di recesso ogni volta che le
-- condizioni parlavano di recesso. Il modulo serve quando si firma con un
-- privato a casa sua o a distanza (Codice del Consumo, artt. 49 e 52-54): lì, se
-- manca, il cliente rischia di poter recedere fino a 12 mesi dopo. A chi vende
-- ad aziende o firma in sede non serve, e un foglio che spiega come disdire il
-- contratto non va consegnato a chi non ne ha diritto.
--
-- Deciso il 21/09/2026: ogni azienda lo accende dal suo modello, spento di serie.
-- Stessa colonna nei modelli degli otto moduli edili, dei Serramenti, del
-- Fotovoltaico e del preventivo generico (quote_templates).
--
-- Aggiungere una colonna con un valore fisso non riscrive la tabella: il lock è
-- di un istante. Il limite serve solo a non restare in coda dietro a qualcuno.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';

do $$
declare
  t text;
begin
  foreach t in array array[
    'rst_template_pdf', 'bgn_template_pdf', 'tet_template_pdf', 'clm_template_pdf',
    'ele_template_pdf', 'idr_template_pdf', 'pav_template_pdf', 'pis_template_pdf',
    'sr_template_pdf', 'fv_template_pdf', 'quote_templates'
  ] loop
    execute format('alter table public.%I add column if not exists modulo_recesso_attivo boolean not null default false', t);
    execute format(
      'comment on column public.%I.modulo_recesso_attivo is %L', t,
      'Allega al preventivo il modulo di recesso (Codice del Consumo, allegato I parte B). '
      'Serve quando si firma con un privato a casa sua o a distanza. Spento di serie dal 21/09/2026.'
    );
  end loop;
end $$;
