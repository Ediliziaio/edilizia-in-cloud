-- Ogni nota scritta da una persona porta il suo nome.
--
-- Chi legge una nota deve sapere chi l'ha scritta e quando. La data c'è sempre
-- (created_at); l'autore dipendeva da chi inseriva la riga: le schermate
-- dell'app lo passano, ma basta un punto che se ne dimentica perché la nota
-- resti anonima. Negli ultimi 30 giorni: 1.203 note senza autore, 100 con.
--
-- Qui l'autore lo mette il database: se chi inserisce è un utente e non l'ha
-- indicato, la nota è sua. Le note scritte dal sistema (import, controllo
-- doppioni dei moduli Facebook) arrivano senza utente e restano senza autore:
-- l'interfaccia le mostra come «Importata o automatica».
create or replace function public.nota_con_autore()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.nota_con_autore() from public, anon;

drop trigger if exists trg_nota_con_autore on public.marketing_contact_notes;
create trigger trg_nota_con_autore
  before insert on public.marketing_contact_notes
  for each row execute function public.nota_con_autore();
