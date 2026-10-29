-- ════════════════════════════════════════════════════════════════════════════
-- La commessa in appalto: a corpo o a misura, e il contratto che la governa
-- ════════════════════════════════════════════════════════════════════════════
-- Fino a oggi un lavoro in appalto (`orders.order_type='appaltatore_lavoro'`,
-- 28/12/2026) portava UN importo e lo dava per certo. Ma i due casi veri sono
-- diversi e vanno dichiarati alla nascita, non dedotti:
--
--   a_corpo   l'importo e' concordato prima: `total_amount` E' il contratto, e
--             le rate ci si appendono come in una commessa privata.
--   a_misura  l'importo si sa alla fine: `total_amount` e' una STIMA e il dovuto
--             nasce dalla rendicontazione per le tariffe del committente.
--
-- Il rischio della seconda e' lavorare oltre l'accordo senza accorgersene:
-- `tetto_importo` e' la cifra oltre la quale il rendicontato deve avvisare.
--
-- `appalto_contratto_id` lega la commessa al contratto del committente, da cui
-- scendono listino e condizioni. Il contratto porta con se' i PREZZI: un
-- trigger pretende che sia della stessa azienda E dello stesso committente,
-- altrimenti una commessa potrebbe fatturare col listino di un altro. Lo stesso
-- trigger impedisce di appiccicare un contratto d'appalto a un ordine cliente.
--
-- Dati: le DUE commesse d'appalto esistenti (dimostrative, aprile 2026, importo
-- fisso di 18.500 euro) sono a corpo e vengono marcate tali. Due righe su 766:
-- nessun lotto, nessun lock da temere. Il vincolo si aggiunge NOT VALID e poi si
-- valida, per prendere un lock piu' debole.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.orders
  add column if not exists appalto_contratto_id uuid references public.appalto_contratti(id) on delete set null,
  add column if not exists valorizzazione text,
  add column if not exists tetto_importo numeric(14,2),
  add column if not exists riferimento_committente text;

comment on column public.orders.appalto_contratto_id is
  'Contratto d''appalto (appalto_contratti) da cui la commessa prende listino e condizioni. Solo per order_type=appaltatore_lavoro.';
comment on column public.orders.valorizzazione is
  '"a_corpo" = importo concordato prima, total_amount e'' il valore del contratto. "a_misura" = importo noto alla fine, total_amount e'' una STIMA e il dovuto nasce dalla rendicontazione. Obbligatorio per order_type=appaltatore_lavoro.';
comment on column public.orders.tetto_importo is
  'Tetto concordato: oltre questa cifra il rendicontato avvisa. Serve soprattutto alle commesse a misura, dove si puo'' lavorare oltre l''accordo senza accorgersene.';
comment on column public.orders.riferimento_committente is
  'Il numero d''ordine del committente per questa commessa: va in testa alla fattura, e senza di esso molti committenti non pagano.';

alter table public.orders drop constraint if exists orders_valorizzazione_valori;
alter table public.orders add constraint orders_valorizzazione_valori
  check (valorizzazione is null or valorizzazione in ('a_corpo', 'a_misura')) not valid;
alter table public.orders validate constraint orders_valorizzazione_valori;

alter table public.orders drop constraint if exists orders_tetto_importo_positivo;
alter table public.orders add constraint orders_tetto_importo_positivo
  check (tetto_importo is null or tetto_importo >= 0) not valid;
alter table public.orders validate constraint orders_tetto_importo_positivo;

-- Le due commesse d'appalto che esistono (dimostrative, aprile 2026) nascono
-- con un importo fisso di 18.500 euro: sono a corpo. Due righe, niente lotti.
update public.orders
   set valorizzazione = 'a_corpo'
 where order_type = 'appaltatore_lavoro' and valorizzazione is null;

-- Una commessa d'appalto senza modo di valorizzazione e' una commessa di cui
-- non si sa se l'importo e' concordato o da rendicontare: il resto del modulo
-- non saprebbe cosa farne.
alter table public.orders drop constraint if exists orders_appalto_valorizzazione;
alter table public.orders add constraint orders_appalto_valorizzazione
  check (order_type <> 'appaltatore_lavoro' or valorizzazione is not null) not valid;
alter table public.orders validate constraint orders_appalto_valorizzazione;

create index if not exists orders_appalto_contratto_idx
  on public.orders(appalto_contratto_id) where appalto_contratto_id is not null;

-- Il contratto agganciato porta con se' i prezzi concordati: deve essere della
-- stessa azienda E dello stesso committente della commessa, altrimenti una
-- commessa potrebbe fatturare col listino di un altro.
create or replace function public.orders_appalto_contratto_coerente()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v public.appalto_contratti%rowtype;
begin
  if new.appalto_contratto_id is null then
    return new;
  end if;
  if new.order_type is distinct from 'appaltatore_lavoro' then
    raise exception 'Solo un lavoro in appalto puo'' avere un contratto d''appalto' using errcode = '23514';
  end if;
  select * into v from public.appalto_contratti where id = new.appalto_contratto_id;
  if not found then
    raise exception 'Contratto d''appalto inesistente' using errcode = '23514';
  end if;
  if v.company_id is distinct from new.company_id then
    raise exception 'Il contratto d''appalto e'' di un''altra azienda' using errcode = '23514';
  end if;
  if v.committente_id is distinct from new.customer_id then
    raise exception 'Il contratto d''appalto e'' di un altro committente' using errcode = '23514';
  end if;
  return new;
end;
$fn$;
revoke all on function public.orders_appalto_contratto_coerente() from public, anon, authenticated;

drop trigger if exists trg_orders_appalto_contratto on public.orders;
create trigger trg_orders_appalto_contratto
  before insert or update of appalto_contratto_id, company_id, customer_id, order_type on public.orders
  for each row execute function public.orders_appalto_contratto_coerente();
