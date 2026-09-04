-- Il calendario pubblico non deve raccontare cosa fai.
--
-- google_calendar_busy_slots aveva un ramo di lettura che apriva la tabella a
-- CHIUNQUE (ruolo anon) per ogni proprietario con un calendario di prenotazione
-- pubblico. La tabella non contiene solo gli orari: contiene `summary`, cioe' il
-- titolo dell'evento preso da Google. In produzione erano leggibili dalla rete
-- 29 eventi di 2 persone, con nomi e cellulari di potenziali clienti
-- ("BLUESOLAR ... 34xxxxxxxx") e fatti privati (visite mediche, compleanni).
-- apple_calendar_busy_slots aveva lo stesso ramo: oggi la tabella e' vuota, ma
-- la falla era gia' armata per la prima connessione CalDAV.
--
-- Quel ramo era anche inutile: la pagina pubblica, prima di leggere gli slot,
-- controlla user_calendar_preferences.block_busy_slots, che ad anon non e' mai
-- visibile. La lettura non veniva quindi mai raggiunta dall'applicazione -- solo
-- da chi interrogava la tabella con la chiave pubblicabile.
--
-- Conseguenza collaterale, che questa migrazione affronta a monte: entrambi gli
-- utenti che hanno chiesto di bloccare le fasce occupate venivano offerti come
-- liberi. La regola sta ora sul server, in slot_occupati_pubblici(), che
-- restituisce SOLO gli intervalli, unisce Google e Apple e rispetta la
-- preferenza dell'utente.

-- 1. La fascia occupata, senza il perche'.
create or replace function public.slot_occupati_pubblici(
  p_calendario uuid,
  p_da timestamptz,
  p_a timestamptz
)
returns table (inizio timestamptz, fine timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_owner   uuid;
  v_attivo  boolean;
  v_slug    text;
  v_blocca  boolean;
begin
  if p_calendario is null or p_da is null or p_a is null then
    raise exception 'slot_occupati_pubblici: calendario e intervallo sono obbligatori'
      using errcode = '22023';
  end if;
  if p_a <= p_da then
    raise exception 'slot_occupati_pubblici: l''intervallo finisce prima di iniziare'
      using errcode = '22023';
  end if;
  if p_a - p_da > interval '62 days' then
    raise exception 'slot_occupati_pubblici: intervallo troppo ampio (massimo 62 giorni)'
      using errcode = '22023';
  end if;

  select mc.owner_id, mc.is_active, mc.booking_slug
    into v_owner, v_attivo, v_slug
    from public.marketing_calendars mc
   where mc.id = p_calendario;

  if not found then
    raise exception 'slot_occupati_pubblici: calendario inesistente'
      using errcode = '42704';
  end if;

  -- Un calendario non pubblicato non risponde: meglio un errore esplicito che
  -- una disponibilita' inventata.
  if v_slug is null or coalesce(v_attivo, false) = false or v_owner is null then
    raise exception 'slot_occupati_pubblici: il calendario non e'' pubblico'
      using errcode = '42501';
  end if;

  select coalesce(ucp.block_busy_slots, false)
    into v_blocca
    from public.user_calendar_preferences ucp
   where ucp.user_id = v_owner;

  -- Nessuna preferenza, o blocco disattivato: l'utente ha scelto di restare
  -- prenotabile anche quando e' occupato. Zero righe, non un errore.
  if coalesce(v_blocca, false) = false then
    return;
  end if;

  return query
    select g.start_at, g.end_at
      from public.google_calendar_busy_slots g
     where g.user_id = v_owner and g.start_at < p_a and g.end_at > p_da
    union all
    select a.start_at, a.end_at
      from public.apple_calendar_busy_slots a
     where a.user_id = v_owner and a.start_at < p_a and a.end_at > p_da;
end;
$fn$;

revoke all on function public.slot_occupati_pubblici(uuid, timestamptz, timestamptz) from public;
grant execute on function public.slot_occupati_pubblici(uuid, timestamptz, timestamptz) to anon, authenticated;

comment on function public.slot_occupati_pubblici(uuid, timestamptz, timestamptz) is
  'Fasce occupate del proprietario di un calendario pubblico: solo inizio/fine, mai il titolo. Unisce Google e Apple e rispetta user_calendar_preferences.block_busy_slots. Sostituisce la lettura diretta delle tabelle busy_slots dalla pagina di prenotazione.';

-- 2. Google: via il ramo pubblico, restano proprietario e personale interno.
drop policy if exists "google_calendar_busy_slots_lettura_public" on public.google_calendar_busy_slots;
create policy "google_calendar_busy_slots_lettura_interna"
  on public.google_calendar_busy_slots for select
  using (
    user_id = (select auth.uid())
    or (
      company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = (select auth.uid())
           and ur.role = any (array['super_admin','company_admin','company_staff','salesperson','call_center']::public.app_role[])
      )
    )
  );

-- 3. Apple: stesso taglio, piu' la visibilita' interna che alla tabella mancava.
--    Finora un collega vedeva le fasce Apple solo di rimbalzo, perche' quel
--    proprietario aveva un calendario pubblico; chi non ce l'aveva restava
--    invisibile all'agenda aziendale.
drop policy if exists "apple_calendar_busy_slots_lettura_public" on public.apple_calendar_busy_slots;
create policy "apple_calendar_busy_slots_lettura_interna"
  on public.apple_calendar_busy_slots for select
  using (
    user_id = (select auth.uid())
    or (
      company_id in (select p.company_id from public.profiles p where p.id = (select auth.uid()))
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = (select auth.uid())
           and ur.role = any (array['super_admin','company_admin','company_staff','salesperson','call_center']::public.app_role[])
      )
    )
  );

-- 4. Nessuna policy lascia piu' passare anon: togliamo anche il permesso, cosi'
--    la superficie non resta aperta in attesa della prossima policy distratta.
revoke select on public.google_calendar_busy_slots from anon;
revoke select on public.apple_calendar_busy_slots from anon;
