-- Il dispatcher rispetta la programmazione della campagna.
-- Con parte_il valorizzata la campagna puo' essere avviata oggi ma cominciare
-- a spedire piu' avanti: prima "in corso" significava "spedisci subito", quindi
-- l'unico modo di rimandare era ricordarsi di premere Avvia al momento giusto.
create or replace function public.openwa_campagna_prossimi(p_limit integer default 40)
returns table(destinatario_id uuid, campagna_id uuid, contact_id uuid, tipo text, messaggio text, tags_numeri text[])
language sql security definer set search_path = public as $$
  (SELECT d.id, d.campagna_id, d.contact_id, 'primo'::text, c.messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso'
     AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'da_inviare' AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.created_at LIMIT p_limit)
  UNION ALL
  -- Follow-up: solo a chi NON ha risposto (chi risponde passa a 'risposto').
  (SELECT d.id, d.campagna_id, d.contact_id, 'followup'::text, c.followup_messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso'
     AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'inviato' AND c.followup_messaggio IS NOT NULL
     AND d.primo_inviato_at < now() - make_interval(days => c.followup_dopo_giorni)
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.primo_inviato_at LIMIT p_limit);
$$;
