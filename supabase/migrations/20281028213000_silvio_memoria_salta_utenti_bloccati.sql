-- silvio-memory-extract: la coda non chiama più gli utenti bloccati.
--
-- Il 28/10/2026 alle 04:08 la funzione ha scritto 49 righe di errore, una per
-- utente. La causa: `silvio_users_needing_memory_extract` restituiva 50 bersagli
-- e 47 erano utenti con `profiles.is_blocked = true`; per ognuno
-- `silvio_claim_memory_batch` → `silvio_context_actor_roles` alza
-- «Actor unavailable» (ERRCODE 42501, 47 righe di pari passo in postgres_logs).
-- Il lavoro vero — tre utenti — finiva sepolto sotto gli errori.
--
-- La coda applica ora la stessa condizione dell'attore: profilo esistente e non
-- bloccato. Nessun altro cambio di semantica (p_lookback_hours resta inutilizzato
-- come prima). Solo DDL: niente lock su tabelle grandi.
CREATE OR REPLACE FUNCTION public.silvio_users_needing_memory_extract(p_lookback_hours integer DEFAULT 24, p_min_messages integer DEFAULT 4)
 RETURNS TABLE(user_id uuid, company_id uuid, channel_id uuid, messages_count bigint, last_message_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT cm.user_id, c.company_id, c.id, count(m.id), max(m.created_at)
    FROM public.internal_chat_channels c
    JOIN public.internal_chat_members cm ON cm.channel_id = c.id AND cm.company_id = c.company_id
    -- Un utente senza profilo o bloccato non ha un attore valido: chiamarlo
    -- è un errore garantito, non un lavoro da fare.
    JOIN public.profiles p ON p.id = cm.user_id AND NOT COALESCE(p.is_blocked, false)
    JOIN public.internal_chat_messages m ON m.channel_id = c.id AND m.company_id = c.company_id
    LEFT JOIN public.silvio_memory_checkpoints cp ON cp.company_id = c.company_id
      AND cp.user_id = cm.user_id AND cp.channel_id = c.id
    WHERE c.name = 'silvio-ai' AND c.is_dm AND m.message_type = 'text'
      AND cm.user_id <> '00000000-0000-0000-0000-000000000002'::uuid
      AND ((m.created_at, m.id) > (COALESCE(cp.processed_through, '-infinity'::timestamptz),
        COALESCE(cp.processed_message_id, '00000000-0000-0000-0000-000000000000'::uuid))
        OR (cp.processed_offset > 0 AND m.id = cp.processed_message_id))
      AND (cp.lease_until IS NULL OR cp.lease_until <= now())
    GROUP BY cm.user_id, c.company_id, c.id
    HAVING count(m.id) >= GREATEST(p_min_messages, 1) OR bool_or(cp.processed_offset > 0)
    ORDER BY max(m.created_at) LIMIT 100;
END;
$function$;

REVOKE ALL ON FUNCTION public.silvio_users_needing_memory_extract(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_users_needing_memory_extract(integer, integer) TO service_role;
