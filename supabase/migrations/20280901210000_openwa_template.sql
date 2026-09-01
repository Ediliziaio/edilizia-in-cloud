-- Template WhatsApp Locale: un solo archivio per inbox e campagne.
--
-- Le "risposte pronte" dell'inbox e i "template" delle campagne sono la stessa
-- cosa — un testo salvato con le sue variabili. Tenerne due archivi separati
-- significherebbe scrivere due volte la stessa frase e vederle divergere.
-- Qui la tabella esistente diventa l'archivio unico, con una categoria per
-- filtrare dove ha senso usarla.

alter table public.openwa_risposte_rapide
  add column if not exists categoria text not null default 'risposta'
    check (categoria in ('risposta', 'campagna', 'entrambi'));

comment on column public.openwa_risposte_rapide.categoria is
  'risposta = suggerita nell''inbox; campagna = nel builder campagne; entrambi = ovunque.';

-- Quante volte e' stato usato: serve a far salire in cima cio' che funziona
-- davvero, invece di un elenco alfabetico che invecchia male.
alter table public.openwa_risposte_rapide
  add column if not exists usi integer not null default 0;

create index if not exists openwa_risposte_categoria_idx
  on public.openwa_risposte_rapide (categoria, usi desc);

-- Incremento atomico: due operatori che usano lo stesso template nello stesso
-- momento non devono perdere un conteggio (read-modify-write lo perderebbe).
create or replace function public.openwa_template_usato(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.openwa_risposte_rapide set usi = usi + 1 where id = p_id;
$$;

grant execute on function public.openwa_template_usato to authenticated;
