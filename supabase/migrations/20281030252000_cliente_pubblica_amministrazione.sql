-- Il cliente di un preventivo può essere anche una Pubblica Amministrazione (30/10/2026).
-- Ha il codice fiscale dell'ente (11 cifre) e il codice univoco ufficio della
-- fattura elettronica (6 caratteri): lo stesso passo Cliente dei moduli lo chiede
-- quando si sceglie «Pubblica Amministrazione», sopra nome e cognome.
-- Segue 20281030245000_dati_fiscali_cliente_moduli: allarga il vincolo del tipo e
-- aggiunge una colonna, istantanea, nessuna riga riscritta.

set local lock_timeout = '3s';

do $migrazione$
declare
  t text;
begin
  foreach t in array array['rst_progetti', 'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
                           'idr_progetti', 'pav_progetti', 'pis_progetti', 'fv_progetti', 'sr_progetti']
  loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_cliente_tipo_check');
    execute format('alter table public.%I add constraint %I check (cliente_tipo in (%L, %L, %L))', t, t || '_cliente_tipo_check', 'privato', 'azienda', 'pa');
    execute format('alter table public.%I add column if not exists cliente_codice_univoco text', t);
    execute format('comment on column public.%I.cliente_codice_univoco is %L', t, 'Pubblica Amministrazione: codice univoco ufficio della fattura elettronica (6 caratteri).');
  end loop;
end
$migrazione$;
