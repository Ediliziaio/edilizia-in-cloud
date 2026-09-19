-- Il titolo automatico degli appuntamenti prende la forma che Il Bagno Group
-- usa già su Google Calendar.
--
-- Ricontrollando (19/09/2026) sui 253 eventi importati dal loro Google
-- Calendar, i titoli scritti a mano dai consulenti hanno una forma precisa:
--
--   Bulgarelli | Il Bagno Group Show-room Lissone - Via Nuova Valassina 27
--
-- mentre il trigger di ieri scriveva «… | Il Bagno Group Via Nuova Valassina
-- 27, Lissone». Stessa informazione, ordine diverso: nel calendario si
-- sarebbero visti due stili mescolati. Ora la sede diventa
-- «Show-room <sede> - <via>». Chi non ha sede (Vincenzo, a domicilio) resta
-- con l'indirizzo scritto nell'appuntamento.

create or replace function public.titolo_appuntamento(
  p_company   uuid,
  p_etichetta text,
  p_contatto  uuid,
  p_assegnato uuid,
  p_indirizzo text,
  p_citta     text
)
returns text
language sql
stable
set search_path to 'public'
as $$
  with contatto as (
    select btrim(concat_ws(' ',
             nullif(btrim(c.last_name), ''),
             nullif(btrim(c.first_name), ''))) as nome
    from marketing_contacts c
    where c.id = p_contatto
  ),
  sede as (
    -- La forma che usano già su Google Calendar:
    -- «Show-room Lissone - Via Nuova Valassina 27».
    select btrim(concat_ws(' - ',
             'Show-room ' || btrim(s.nome),
             nullif(btrim(s.indirizzo), ''))) as dove
    from company_sedi_utenti u
    join company_sedi s on s.id = u.sede_id
    where u.company_id = p_company and u.user_id = p_assegnato and s.attiva
  )
  select case
    when coalesce((select nome from contatto), '') = '' then null
    else btrim(concat_ws(' ',
      (select nome from contatto) || ' | ' || nullif(btrim(coalesce(p_etichetta, '')), ''),
      coalesce(
        nullif((select dove from sede), ''),
        nullif(btrim(concat_ws(', ', nullif(btrim(coalesce(p_indirizzo, '')), ''), nullif(btrim(coalesce(p_citta, '')), ''))), '')
      )))
  end
$$;

revoke all on function public.titolo_appuntamento(uuid, text, uuid, uuid, text, text) from public, anon, authenticated;
