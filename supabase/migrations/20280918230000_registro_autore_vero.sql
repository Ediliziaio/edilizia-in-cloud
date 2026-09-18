-- Registro attività: un'azione del sistema non è del venditore.
--
-- I trigger che scrivono in marketing_contact_activities usavano
-- «coalesce(auth.uid(), new.assigned_to)» come autore: quando a muovere la
-- scheda è un'automazione (o un aggiornamento di servizio) auth.uid() è vuoto,
-- e il registro attribuiva l'azione al venditore assegnato. Il 18/09/2026,
-- spostando 125 schede ferme di BeMade, il registro le ha segnate come fatte da
-- Tito Falcone: non è vero, e in una discussione su «chi ha spostato cosa» è la
-- peggiore delle risposte.
--
-- Ora l'autore è solo auth.uid(): vuoto quando agisce il sistema, e il registro
-- scrive «Automazione» (col nome del flusso quando la nota lo dice). Resta
-- «deleted_by» come ripiego per il cestino, dove l'utente c'è davvero.
do $$
declare
  r record;
  v_def text;
  v_nuova text;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('log_contact_assigned', 'log_contact_created', 'log_opportunity_created', 'log_opportunity_updates')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nuova := replace(v_def, 'COALESCE(auth.uid(), NEW.deleted_by, NEW.assigned_to)', 'COALESCE(auth.uid(), NEW.deleted_by)');
    v_nuova := replace(v_nuova, 'COALESCE(auth.uid(), NEW.assigned_to)', 'auth.uid()');
    if v_nuova <> v_def then
      execute v_nuova;
    end if;
  end loop;
end
$$;
