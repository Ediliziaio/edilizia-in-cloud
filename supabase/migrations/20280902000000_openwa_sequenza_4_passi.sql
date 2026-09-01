-- Campagne WhatsApp Locale: sequenza fino a 4 messaggi.
--
-- Il motore conosceva due passi (primo messaggio + un follow-up). Qui la
-- sequenza si allunga a 4, con la stessa regola di sempre: ogni passo parte
-- SOLO verso chi non ha ancora risposto — alla prima risposta il destinatario
-- esce dalla coda, perche' insistere con chi ti ha gia' risposto e' il modo
-- piu' rapido di farsi segnalare.
--
-- I nomi delle colonne restano followup2/followup3 (il primo follow-up tiene
-- le colonne storiche senza numero): rinominare adesso significherebbe toccare
-- ogni punto che gia' le legge, per pura estetica.

-- 1. Testi e attese dei nuovi passi.
alter table public.openwa_campagne
  add column if not exists followup2_messaggio text,
  add column if not exists followup2_dopo_giorni integer not null default 3,
  add column if not exists followup3_messaggio text,
  add column if not exists followup3_dopo_giorni integer not null default 3;

-- 2. Stati e timestamp dei destinatari.
alter table public.openwa_campagna_destinatari
  add column if not exists followup2_inviato_at timestamptz,
  add column if not exists followup3_inviato_at timestamptz;

alter table public.openwa_campagna_destinatari
  drop constraint if exists openwa_campagna_destinatari_stato_check;
alter table public.openwa_campagna_destinatari
  add constraint openwa_campagna_destinatari_stato_check
  check (stato in ('da_inviare','inviato','followup_inviato','followup2_inviato','followup3_inviato','risposto','saltato','fallito'));

-- 3. Il motore: due rami in piu', ognuno conta il tempo dal passo precedente.
create or replace function public.openwa_campagna_prossimi(p_limit integer default 40)
returns table(destinatario_id uuid, campagna_id uuid, contact_id uuid, tipo text, messaggio text, tags_numeri text[])
language sql security definer set search_path = public as $$
  (SELECT d.id, d.campagna_id, d.contact_id, 'primo'::text, c.messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'da_inviare' AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.created_at LIMIT p_limit)
  UNION ALL
  (SELECT d.id, d.campagna_id, d.contact_id, 'followup'::text, c.followup_messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'inviato' AND c.followup_messaggio IS NOT NULL
     AND d.primo_inviato_at < now() - make_interval(days => c.followup_dopo_giorni)
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.primo_inviato_at LIMIT p_limit)
  UNION ALL
  (SELECT d.id, d.campagna_id, d.contact_id, 'followup2'::text, c.followup2_messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'followup_inviato' AND c.followup2_messaggio IS NOT NULL
     AND d.followup_inviato_at < now() - make_interval(days => c.followup2_dopo_giorni)
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.followup_inviato_at LIMIT p_limit)
  UNION ALL
  (SELECT d.id, d.campagna_id, d.contact_id, 'followup3'::text, c.followup3_messaggio, c.tags_numeri
   FROM public.openwa_campagna_destinatari d
   JOIN public.openwa_campagne c ON c.id = d.campagna_id
   JOIN public.marketing_contacts mc ON mc.id = d.contact_id
   WHERE c.stato = 'in_corso' AND (c.parte_il IS NULL OR c.parte_il <= now())
     AND d.stato = 'followup2_inviato' AND c.followup3_messaggio IS NOT NULL
     AND d.followup2_inviato_at < now() - make_interval(days => c.followup3_dopo_giorni)
     AND d.tentativi < 5
     AND mc.optout_whatsapp IS NOT TRUE AND mc.phone IS NOT NULL
   ORDER BY d.followup2_inviato_at LIMIT p_limit);
$$;

-- 4. Una risposta ferma la sequenza da QUALUNQUE passo.
create or replace function public.openwa_campagna_segna_risposta(p_contact_id uuid)
returns integer
language sql security definer set search_path = public as $$
  WITH agg AS (
    UPDATE public.openwa_campagna_destinatari
    SET stato = 'risposto', risposto_at = now()
    WHERE contact_id = p_contact_id
      AND stato IN ('inviato','followup_inviato','followup2_inviato','followup3_inviato')
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$$;

-- 5. Riepilogo: "risollecitati" somma TUTTI i follow-up (stessa firma).
create or replace function public.openwa_campagne_riepilogo()
returns table(id uuid, nome text, stato text, followup_dopo_giorni integer, ha_followup boolean,
              totali bigint, da_inviare bigint, inviati bigint, followup_inviati bigint,
              risposti bigint, saltati bigint, falliti bigint,
              created_at timestamptz, avviata_at timestamptz)
language plpgsql security definer set search_path = public as $$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.nome, c.stato,
           c.followup_dopo_giorni,
           (c.followup_messaggio IS NOT NULL),
           count(d.id),
           count(d.id) FILTER (WHERE d.stato = 'da_inviare'),
           count(d.id) FILTER (WHERE d.stato = 'inviato'),
           count(d.id) FILTER (WHERE d.stato IN ('followup_inviato','followup2_inviato','followup3_inviato')),
           count(d.id) FILTER (WHERE d.stato = 'risposto'),
           count(d.id) FILTER (WHERE d.stato = 'saltato'),
           count(d.id) FILTER (WHERE d.stato = 'fallito'),
           c.created_at, c.avviata_at
    FROM public.openwa_campagne c
    LEFT JOIN public.openwa_campagna_destinatari d ON d.campagna_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC;
END;
$$;

-- 6. Completamento: la campagna e' finita solo quando NESSUN passo e' pendente.
create or replace function public.openwa_campagne_completa_finite()
returns integer
language sql security definer set search_path = public as $$
  WITH agg AS (
    UPDATE public.openwa_campagne c
    SET stato = 'completata', completata_at = now(), updated_at = now()
    WHERE c.stato = 'in_corso'
      AND NOT EXISTS (
        SELECT 1 FROM public.openwa_campagna_destinatari d
        WHERE d.campagna_id = c.id
          AND d.tentativi < 5
          AND (
            d.stato = 'da_inviare'
            OR (d.stato = 'inviato' AND c.followup_messaggio IS NOT NULL)
            OR (d.stato = 'followup_inviato' AND c.followup2_messaggio IS NOT NULL)
            OR (d.stato = 'followup2_inviato' AND c.followup3_messaggio IS NOT NULL)
          )
      )
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer FROM agg;
$$;
