-- Da quale modello vengono le condizioni di QUESTO documento (07/11/2026).
--
-- Dal 27/10 un preventivo può avere condizioni sue (`condizioni_testo`). Mancava la cosa che le lega
-- all'archivio: da quale modello e da quale versione sono partite, chi le ha riscritte e quando. Senza,
-- un preventivo con le sue condizioni si racconta solo come «personalizzato», e nessuno sa più da dove
-- veniva né se il modello nel frattempo è cambiato.
--
-- La forma del contenuto la decide il codice (`OrigineCondizioni` in src/lib/condizioni/archivio.ts):
--   { modello_id, modello_nome, versione, congelate_il, clausole_riscritte[], riscritte_da, riscritte_il }
--
-- Solo una colonna in più, su undici tabelle: nessuna riga viene scritta, quindi è istantanea e non
-- prende lock di scrittura. Niente default e niente NOT NULL, per non riscrivere le tabelle.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare t text;
begin
  foreach t in array array[
    'quotes', 'bgn_progetti', 'clm_progetti', 'ele_progetti', 'fv_progetti', 'idr_progetti',
    'pav_progetti', 'pis_progetti', 'rst_progetti', 'sr_progetti', 'tet_progetti'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists condizioni_origine jsonb', t);
      execute format(
        'comment on column public.%I.condizioni_origine is %L', t,
        'Da dove vengono le condizioni di questo documento: modello dell''archivio, versione, quando sono state fissate e chi le ha riscritte. Il documento non cambia più se cambia il modello.');
    end if;
  end loop;
end $$;
