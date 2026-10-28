-- Keep the already published direct revision flow compatible during rollout.
-- The new atomic RPC explicitly enables controls v2; legacy clients keep their existing version.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.pos_guardia_revisioni()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='DELETE' then
  if coalesce(old.document_type,'pos')='pos' and old.status='approvato' then raise exception 'Un POS approvato si conserva nello storico'; end if;
  return old;
 end if;
 if coalesce(old.document_type,'pos')<>'pos' then return new; end if;
 if (new.company_id,new.order_id,new.document_type) is distinct from (old.company_id,old.order_id,old.document_type) then
  raise exception 'Non si cambia azienda o cantiere di un POS esistente';
 end if;
 if old.status='approvato' and new.status='approvato' and
   (new.contenuto,new.revisione,new.approvato_da,new.approvato_da_nome,new.approvato_il) is distinct from
   (old.contenuto,old.revisione,old.approvato_da,old.approvato_da_nome,old.approvato_il) then
  raise exception 'Contenuto e approvazione si conservano: apri una nuova revisione';
 end if;
 if old.status='approvato' and new.status<>'approvato' then
  if new.status<>'bozza' or new.revisione is distinct from coalesce(old.revisione,0)+1 or coalesce(new.iter,'{}'::jsonb)<>'{}'::jsonb or new.approvato_il is not null or new.approvato_da is not null then
   raise exception 'Apri una nuova revisione in bozza senza ereditare firme o approvazioni';
  end if;
 elsif new.revisione is distinct from old.revisione then
  raise exception 'Il numero revisione cambia solo aprendo una nuova bozza da un POS approvato';
 end if;
 return new;
end $$;
revoke all on function public.pos_guardia_revisioni() from public,anon,authenticated;
notify pgrst,'reload schema';
