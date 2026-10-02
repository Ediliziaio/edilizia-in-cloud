-- Le note interne scritte nel dialogo dell'appuntamento restavano solo su
-- appointments.internal_notes e non comparivano negli «Appunti» della scheda
-- cliente (marketing_contact_notes). Il frontend ora le riporta al salvataggio;
-- qui si recuperano quelle già scritte (una trentina, solo con contatto).
-- L'autore resta vuoto se il suo profilo non esiste più (chiave esterna).
-- Idempotente: salta le note già presenti con lo stesso testo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

insert into public.marketing_contact_notes (contact_id, company_id, content, created_by, created_at, opportunity_id, automatica)
select a.contact_id,
       a.company_id,
       'Nota dall''appuntamento «' || coalesce(nullif(btrim(a.title), ''), 'Appuntamento') || '» del '
         || to_char(a.appointment_date, 'DD/MM/YYYY') || ' alle ' || to_char(a.appointment_time, 'HH24:MI')
         || E':\n' || btrim(a.internal_notes),
       (select p.id from public.profiles p where p.id = a.created_by),
       a.created_at,
       a.opportunity_id,
       false
from public.appointments a
where a.contact_id is not null
  and btrim(coalesce(a.internal_notes, '')) <> ''
  and not exists (
    select 1 from public.marketing_contact_notes n
    where n.contact_id = a.contact_id
      and n.content like '%' || btrim(a.internal_notes) || '%'
  );
