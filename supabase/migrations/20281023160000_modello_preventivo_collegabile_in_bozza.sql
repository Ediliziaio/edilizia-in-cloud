-- Un preventivo in bozza nato senza modello può prenderne uno della libreria (23/10/2026).
--
-- I preventivi creati senza scegliere l'intervento non hanno modello_snapshot e il PDF usa
-- il modello base dell'azienda: le modifiche ai modelli della libreria non entravano mai.
-- Ora, finché è in bozza, gli si può collegare un modello (della stessa azienda); per chi
-- ce l'ha già vale la regola di 20281023150000 (stesso intervento). Fuori dalla bozza il
-- modello resta fermo.
set local lock_timeout = '3s';

create or replace function public.preventivo_modello_immutabile()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    if old.stato = 'bozza' and new.stato = 'bozza'
       and new.modello_snapshot is not null
       and new.modello_snapshot->>'companyId' = new.company_id::text
       and (old.modello_snapshot is null
            or (new.modello_snapshot->>'modelId' = old.modello_snapshot->>'modelId'
                and new.modello_snapshot->>'companyId' = old.modello_snapshot->>'companyId')) then
      return new;
    end if;
    raise exception 'Il modello di un preventivo già inviato non può essere sostituito. Crea una nuova offerta.';
  end if;
  return new;
end;
$$;
