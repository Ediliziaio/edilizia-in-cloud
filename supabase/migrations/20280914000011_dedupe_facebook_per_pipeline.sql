-- Il trigger anti-doppioni scartava in silenzio (RETURN NULL) una nuova
-- opportunità Facebook se il contatto ne aveva già un'altra aperta — in
-- QUALSIASI pipeline. Serve a non duplicare lo stesso lead quando Meta lo
-- rimanda; ma un'azienda con due imbuti (BeMade: «Nuovo» e «Restauro», due
-- moduli Facebook distinti) perdeva così ogni richiesta di restauro da chi
-- aveva già chiesto un divano nuovo. Nessun errore, nessuna traccia: la riga
-- non veniva scritta. Con 17.879 opportunità del Nuovo importate l'11/09/2026
-- sarebbe stato quasi ogni lead di restauro da un cliente già noto.
--
-- Il doppione è tale solo nella STESSA pipeline.
create or replace function public.dedupe_fb_open_opportunity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.contact_id is not null
     and coalesce(new.status, 'open') = 'open'
     and (new.source ilike 'facebook%' or new.source ilike '%meta%')
     and exists (
       select 1 from public.marketing_opportunities o
       where o.company_id = new.company_id
         and o.contact_id = new.contact_id
         and o.pipeline_id is not distinct from new.pipeline_id
         and o.status = 'open'
         and (o.source ilike 'facebook%' or o.source ilike '%meta%')
     )
  then
    return null;
  end if;
  return new;
end; $function$;
