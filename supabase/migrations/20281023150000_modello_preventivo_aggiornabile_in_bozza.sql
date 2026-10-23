-- Il modello di un preventivo in bozza si può aggiornare (23/10/2026).
--
-- Ogni preventivo dei preventivatori edili congela il modello dell'azienda alla creazione
-- (modello_snapshot), perché il PDF già mandato al cliente resti quello. Chi modificava il
-- modello dopo aver creato il preventivo non vedeva le modifiche nel PDF, e non aveva modo di
-- portarle dentro. Ora la copia si può sostituire finché il preventivo è in bozza, con lo
-- stesso intervento e della stessa azienda; uscito dalla bozza il modello resta fermo.
set local lock_timeout = '3s';

create or replace function public.preventivo_modello_immutabile()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    if old.stato = 'bozza' and new.stato = 'bozza'
       and old.modello_snapshot is not null and new.modello_snapshot is not null
       and new.modello_snapshot->>'modelId' = old.modello_snapshot->>'modelId'
       and new.modello_snapshot->>'companyId' = old.modello_snapshot->>'companyId'
       and new.modello_snapshot->>'companyId' = new.company_id::text then
      return new;
    end if;
    raise exception 'Il modello di un preventivo già inviato non può essere sostituito. Crea una nuova offerta.';
  end if;
  return new;
end;
$$;
