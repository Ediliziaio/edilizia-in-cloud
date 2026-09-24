-- Portale clienti: anche il link con token vale solo col portale acceso e col
-- cliente sbloccato (24/09/2026, seguito di 20280924110000).
--
-- Oltre all'account con password, il portale ha un secondo ingresso: il «magic
-- link» di `portale_clienti_tokens`, verificato da `valida_portale_token` (aperta
-- ad anon di proposito, perché si chiama prima che esista una sessione). La
-- verifica guardava solo che il token esistesse e non fosse scaduto: un token
-- creato per un cliente di un'azienda col portale spento, o per un cliente
-- bloccato, avrebbe aperto lo stesso l'assistente AI del portale
-- (`cliente-ai-assistente`) con i dati del cliente.
--
-- Al 24/09/2026 i token sono zero e l'app non ne crea: nessuno perde nulla. Da
-- qui in avanti un token vale solo se l'azienda ha il portale acceso E il
-- cliente è sbloccato, la stessa regola degli account.

create or replace function public.valida_portale_token(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
DECLARE
  v_record RECORD;
BEGIN
  SELECT t.*, p.first_name, p.last_name, p.email, c.name AS company_name
  INTO v_record
  FROM public.portale_clienti_tokens t
  JOIN public.profiles p ON p.id = t.cliente_id
  JOIN public.companies c ON c.id = t.company_id
  WHERE t.token = p_token
    AND t.expires_at > now()
    -- Portale acceso dall'azienda (lo decide EdiliziaInCloud) e cliente sbloccato.
    AND coalesce(c.customer_portal_enabled, false)
    AND NOT coalesce(p.is_blocked, false)
    AND NOT coalesce(p.portal_disabled, false);

  IF NOT FOUND THEN
    RETURN json_build_object('valido', false, 'motivo', 'Token non valido o scaduto');
  END IF;

  -- Aggiorna ultimo accesso
  UPDATE public.portale_clienti_tokens
  SET ultimo_accesso = now()
  WHERE token = p_token;

  RETURN json_build_object(
    'valido', true,
    'cliente_id', v_record.cliente_id,
    'company_id', v_record.company_id,
    'first_name', v_record.first_name,
    'last_name', v_record.last_name,
    'email', v_record.email,
    'company_name', v_record.company_name,
    'expires_at', v_record.expires_at
  );
END;
$function$;
