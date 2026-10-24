-- Il modello del preventivo in bozza si aggiorna anche in Tetti e Serramenti (24/10/2026).
--
-- Come per gli altri preventivatori (20281023150000 e 20281023160000): il modello congelato
-- si può rinnovare con quello di adesso, o collegare a un preventivo che non l'aveva, finché
-- il preventivo è in bozza, per la stessa azienda e lo stesso intervento. Fuori dalla bozza
-- resta fermo.
set local lock_timeout = '3s';

create or replace function public.tet_preserve_quote_model_snapshot()
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

create or replace function public.sr_preserve_quote_model_snapshot()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    if old.stato::text = 'bozza' and new.stato::text = 'bozza'
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
