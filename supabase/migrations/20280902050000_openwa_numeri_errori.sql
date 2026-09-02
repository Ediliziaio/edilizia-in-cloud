-- Un invio fallito deve pesare sul numero: senza traccia, un numero con la
-- sessione morta ma "connected" nel DB restava sempre il meno carico, veniva
-- scelto a ogni giro e bruciava i tentativi di decine di destinatari.
alter table public.openwa_numbers
  add column if not exists errori_consecutivi integer not null default 0,
  add column if not exists ultimo_errore text;
comment on column public.openwa_numbers.errori_consecutivi is
  'Invii falliti di fila; a 3 il numero esce dalla rotazione finche'' un invio non riesce.';
