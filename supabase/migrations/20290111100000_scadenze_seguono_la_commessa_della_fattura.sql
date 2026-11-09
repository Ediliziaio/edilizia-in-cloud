-- La scadenza e la prima nota seguono la commessa della fattura, anche quando arriva dopo.
--
-- `auto_create_scadenza_from_invoice` copia già `order_id` sulla scadenza, ma solo
-- nel momento in cui la crea. All'import di uno storico la fattura non ha ancora la
-- commessa — gliela si assegna più tardi, a mano o riconoscendo il cantiere — e la
-- scadenza resta senza. Da lì il buco si propaga: `mark_scadenza_paid_con_richiesta`
-- prende la commessa DALLA SCADENZA, quindi la riga di prima nota nasce senza commessa,
-- e i tre punti che filtrano la prima nota per `order_id` non vedono quell'incasso:
-- l'esposizione di cassa della commessa (`useEsposizioneCommessa`), il rendiconto di
-- cassa (`useRendicontoCassa`) e il riquadro incassi della scheda commessa.
--
-- Misurato il 09/11/2026: 244 scadenze in 3 aziende senza commessa su fatture che la
-- hanno, e 27 righe di prima nota già scritte. Su una sola azienda erano 128 scadenze
-- per 2.868.894 € e 478.834 € di incassi che la commessa non vedeva.
--
-- Qui non si tocca la funzione che genera le scadenze (è grossa e sta sulla strada dei
-- pagamenti): basta un trigger dedicato che allinei quando la commessa della fattura
-- cambia, più un riallineamento una volta sola di quelle rimaste indietro.

create or replace function public.scadenze_seguono_commessa_fattura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo le scadenze nate dalla fattura: una scadenza creata a mano su un'altra
  -- commessa non va spostata.
  update public.scadenze
     set order_id = new.order_id, updated_at = now()
   where invoice_id = new.id
     and auto_source = 'invoice'
     and order_id is distinct from new.order_id;

  -- Le righe di prima nota scritte automaticamente da quella fattura: il giornale di
  -- cassa resta coerente con la commessa anche se l'incasso era già stato registrato.
  update public.prima_nota_entries
     set order_id = new.order_id
   where invoice_id = new.id
     and is_auto
     and order_id is distinct from new.order_id;

  return new;
end
$$;

revoke all on function public.scadenze_seguono_commessa_fattura() from public;
revoke all on function public.scadenze_seguono_commessa_fattura() from anon;

-- Una funzione di trigger non ha bisogno di alcun EXECUTE: il privilegio non viene
-- controllato allo scatto.
drop trigger if exists trg_scadenze_seguono_commessa_fattura on public.invoices;
create trigger trg_scadenze_seguono_commessa_fattura
  after update of order_id on public.invoices
  for each row
  when (new.order_id is distinct from old.order_id)
  execute function public.scadenze_seguono_commessa_fattura();

-- ── Riallineamento di quelle rimaste indietro ────────────────────────────────
-- Idempotente: tocca solo le righe ancora senza commessa, quindi rilanciarlo non fa
-- niente. Le tabelle sono piccole (scadenze 6.388 righe, prima nota 1.603) e le righe
-- da scrivere sono 244 e 27, ma i limiti restano: meglio fallire che bloccare.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.scadenze s
   set order_id = i.order_id, updated_at = now()
  from public.invoices i
 where i.id = s.invoice_id
   and s.order_id is null
   and i.order_id is not null;

update public.prima_nota_entries pn
   set order_id = i.order_id
  from public.invoices i
 where i.id = pn.invoice_id
   and pn.order_id is null
   and i.order_id is not null
   and pn.is_auto;
