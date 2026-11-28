-- La guardia della modalità non scattava: `current_user` dentro una funzione definer è il proprietario
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, dalla prova con un utente vero della 20290630180000.
--
-- `orders_modalita_lavoro_coerente` doveva rifiutare il cambio di modalità su una commessa che ha
-- già documenti emessi. Provata con `demo2@azienda.srl` su una commessa con una fattura emessa:
-- **l'update passava**. La riga colpevole era copiata da `public.sottofase_guardia()`:
--
--     if current_user not in ('authenticated', 'anon') then return new; end if;
--
-- Là funziona perché quella guardia **non** è SECURITY DEFINER: `current_user` è l'utente della
-- sessione, cioè `authenticated`. Qui la funzione è definer (le serve leggere `sal_records`,
-- `appalto_sal` e `documenti_fiscali` attraverso due funzioni chiuse), e dentro una funzione definer
-- `current_user` è il **proprietario** della funzione: la condizione era sempre vera e la guardia
-- usciva al primo `return` per tutti, compreso il browser.
--
-- Chi scrive si riconosce dal JWT, non dal ruolo di esecuzione: `auth.role()` legge
-- `request.jwt.claims`, che una funzione definer non cambia. Dall'app vale 'authenticated' o 'anon';
-- da una migrazione è NULL; dal service role è 'service_role'. Quelli passano, come prima.
--
-- Da ricordare per le prossime guardie: una funzione di trigger definer non può usare
-- `current_user` per sapere chi sta scrivendo.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.orders_modalita_lavoro_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.modalita_lavoro is not distinct from old.modalita_lavoro then
    return new;
  end if;
  -- Le migrazioni e il service role passano; dall'app no.
  if coalesce((select auth.role()), '') not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'UPDATE' and private.commessa_ha_documenti_emessi(new.id) then
    raise exception 'La commessa ha già documenti emessi: come si misura e si fattura non si cambia più.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.orders_modalita_lavoro_coerente() from public, anon, authenticated;
