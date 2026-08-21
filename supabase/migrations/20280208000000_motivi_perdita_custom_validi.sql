-- Il validatore dei motivi di perdita impara i motivi PER AZIENDA.
--
-- Il trigger validate_lost_reason_category accettava SOLO le 7 categorie
-- di prodotto hardcoded: la tabella opportunity_loss_reasons (motivi custom
-- per azienda, con tanto di RLS) esisteva ma il trigger non la guardava.
-- Risultato: ogni motivo aziendale veniva rifiutato con
-- "Invalid lost_reason_category" — il custom era inutilizzabile da sempre.
--
-- Ora: valide le 7 di default OPPURE una voce di opportunity_loss_reasons
-- della STESSA azienda. La spazzatura arbitraria resta rifiutata.

create or replace function public.validate_lost_reason_category()
returns trigger
language plpgsql
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if new.lost_reason_category is not null
     and new.lost_reason_category not in (
       'prezzo', 'concorrente', 'budget_non_disponibile', 'timing',
       'prodotto_non_adatto', 'nessuna_risposta', 'altro'
     )
     and not exists (
       select 1 from public.opportunity_loss_reasons r
       where r.company_id = new.company_id
         and r.label = new.lost_reason_category
     )
  then
    raise exception 'Invalid lost_reason_category: %', new.lost_reason_category;
  end if;
  return new;
end;
$function$;
