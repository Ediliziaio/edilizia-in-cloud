-- Una sonda che mentiva, e la vista che aveva nascosto.
-- Avevo concluso che nessuna vista rispondeva ad anon. Falso: la sonda
-- raccoglieva i risultati in una tabella temporanea non concessa ad anon, e ogni
-- inserimento falliva per permessi dentro un exception-when-others-then-null.
-- Zero risultati significava "non ho potuto scrivere niente".
-- Rifatta: rispondono quattro viste. Tre sono pubbliche per progetto
-- (public_appointment_slots, ai_personas_public, public_calendar_owner_prefs).
-- La quarta e' il cruscotto costi delle missioni AI di piattaforma: oggi da'
-- zeri perche' le RLS reggono, ma e' un aggregato senza GROUP BY e una riga la
-- restituisce sempre. La leggono solo due pagine /admin autenticate.

revoke select on public.v_silvio_agent_mission_health from anon;

comment on view public.v_silvio_agent_mission_health is
  'Salute delle missioni agente: attive, in attesa di approvazione, fallite a 7 giorni, durata media, costo e token. Solo per le pagine /admin autenticate: anon revocato, perche e un aggregato senza GROUP BY e una riga la restituisce sempre.';
