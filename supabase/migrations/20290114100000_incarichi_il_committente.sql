-- Il committente fra le figure del cantiere (9 novembre 2026).
--
-- L'app genera adempimenti che lo nominano — la notifica preliminare «la
-- trasmette il committente o il responsabile dei lavori», il cartello di
-- cantiere lo vuole scritto — ma non lo sapeva registrare da nessuna parte:
-- né fra le figure dell'impresa (che sono le tue) né fra gli incarichi di
-- cantiere. Chi è il committente andava chiesto a voce ogni volta.
--
-- È il soggetto in cima alla catena: nomina CSP e CSE, fa redigere il PSC e
-- manda la notifica. Senza di lui gli altri incarichi non si spiegano.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.sicurezza_incarichi
  drop constraint if exists sicurezza_incarichi_ruolo_check;

alter table public.sicurezza_incarichi
  add constraint sicurezza_incarichi_ruolo_check check (
    ruolo in (
      'committente',
      'datore_lavoro', 'responsabile_lavori', 'progettista', 'direttore_lavori',
      'csp', 'cse', 'rup', 'direttore_tecnico', 'capocantiere', 'preposto',
      'rspp', 'rls', 'rlst', 'medico_competente', 'addetto_antincendio',
      'addetto_primo_soccorso', 'referente_operativo', 'referente_amministrativo'
    )
  );
