-- ============================================================================
-- Prova a schermo del 11/11/2026: una quota scritta a 12,345 € compariva come
-- 12,35 € ma il totale usava 12,345 (1.481,40 € invece di 1.482,00 €), e il
-- contratto poi prendeva 12,35. Il contratto vuole i centesimi
-- (20290216150000): il prezzo delle voci affidate si arrotonda al centesimo
-- quando entra, da qualunque parte arrivi (a mano o dal listino a 4 decimali).
-- ============================================================================

set local lock_timeout = '3s';

create or replace function public.affidamento_prezzo_al_centesimo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.prezzo_unitario is not null then
    new.prezzo_unitario := round(new.prezzo_unitario, 2);
  end if;
  return new;
end;
$$;
revoke all on function public.affidamento_prezzo_al_centesimo() from public, anon, authenticated;

drop trigger if exists affidamento_prezzo_al_centesimo on public.subappalto_affidamenti;
create trigger affidamento_prezzo_al_centesimo
  before insert or update of prezzo_unitario on public.subappalto_affidamenti
  for each row execute function public.affidamento_prezzo_al_centesimo();

-- Le quote già scritte con più decimali (solo quote in bozza, fuori contratto).
update public.subappalto_affidamenti
   set prezzo_unitario = round(prezzo_unitario, 2)
 where prezzo_unitario <> round(prezzo_unitario, 2) and contratto_id is null;
