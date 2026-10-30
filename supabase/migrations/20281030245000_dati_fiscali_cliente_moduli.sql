-- I dati fiscali del cliente nei preventivi dei moduli (30/10/2026).
-- Il cliente di un preventivo edile, del fotovoltaico o dei serramenti aveva
-- nome, cognome, email e telefono: niente codice fiscale per un privato, niente
-- ragione sociale e partita IVA per un'azienda. Il preventivo firmato è il
-- contratto, e non diceva a chi era intestato davvero.
--
-- Quattro colonne in ogni tabella dei progetti: tipo di cliente (privato o
-- azienda), ragione sociale, codice fiscale, partita IVA. Si riempiono dal
-- contatto del CRM quando lo si sceglie, o si scrivono nel passo Cliente.
-- Colonne nuove senza valore da calcolare: istantanee, nessuna riga riscritta.
-- Le tabelle hanno i permessi a livello di tabella: le colonne nuove li seguono.

-- Ogni ALTER prende un lock breve: meglio fallire che fermare chi sta salvando un preventivo.
set local lock_timeout = '3s';

do $migrazione$
declare
  t text;
begin
  foreach t in array array['rst_progetti', 'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
                           'idr_progetti', 'pav_progetti', 'pis_progetti', 'fv_progetti', 'sr_progetti']
  loop
    execute format('alter table public.%I add column if not exists cliente_tipo text not null default %L', t, 'privato');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_cliente_tipo_check');
    execute format('alter table public.%I add constraint %I check (cliente_tipo in (%L, %L))', t, t || '_cliente_tipo_check', 'privato', 'azienda');
    execute format('alter table public.%I add column if not exists cliente_ragione_sociale text', t);
    execute format('alter table public.%I add column if not exists cliente_codice_fiscale text', t);
    execute format('alter table public.%I add column if not exists cliente_partita_iva text', t);
    execute format('comment on column public.%I.cliente_tipo is %L', t, 'Privato o azienda: il privato ha il codice fiscale, l''azienda ragione sociale e partita IVA.');
  end loop;
end
$migrazione$;
