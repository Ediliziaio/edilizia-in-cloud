-- La vista `cedolini` (area personale del dipendente, scheda Cedolini) espone
-- anche il documento caricato dal consulente: se c'è, si apre il PDF vero
-- (e l'apertura conta come consegna) invece di quello generato dal gestionale.
create or replace view public.cedolini with (security_invoker = true) as
 SELECT c.id,
    c.company_id,
    c.employee_id,
    btrim(((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))) AS employee_name,
    c.mese,
    c.anno,
    c.lordo,
    c.contributi_dipendente,
    c.contributi_datore,
    c.ritenute_irpef,
    c.netto,
    c.stato,
    c.note,
    c.created_at,
    c.pdf_url,
    c.data_emissione,
    c.data_pagamento,
    c.documento_id
   FROM (hr_cedolini c
     LEFT JOIN employees e ON ((e.id = c.employee_id)));
