-- A chi è stata mandata una pagina firmata del giornale: direzione lavori, CSE, committente, altro.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.giornale_invii_dl
  add column if not exists ruolo text not null default 'direzione_lavori';

alter table public.giornale_invii_dl drop constraint if exists giornale_invii_dl_ruolo_check;
alter table public.giornale_invii_dl
  add constraint giornale_invii_dl_ruolo_check
  check (ruolo in ('direzione_lavori', 'cse', 'committente', 'altro'));
