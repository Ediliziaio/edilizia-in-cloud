-- L'avviso sulle integrazioni conta i controlli falliti, non le ore (14/11/2026)
--
-- IL GUASTO
-- ---------
-- Il 13/11/2026 è arrivata l'email «Integrazione cloudflare in errore da 13
-- ore». Non era in errore: il sito rispondeva 200 e l'API di Cloudflare pure.
-- Era andato lento UN solo controllo — la verifica del token aveva impiegato
-- 2.691 ms invece dei soliti 250, e la chiamata a Pages aveva sbattuto contro
-- il limite di 5 secondi.
--
-- Le «13 ore» erano un'illusione aritmetica. La guardia diceva:
--
--     AND COALESCE(s.sano_il, ...) < now() - interval '6 hours'
--
-- cioè «avvisa se l'ultima risposta sana è più vecchia di 6 ore». Ma
-- check-api-health gira DUE VOLTE AL GIORNO (cron `20 6,18 * * *`): qualunque
-- singolo fallimento ha per forza l'ultimo sano a 12 ore di distanza, e supera
-- sempre la soglia. Quella guardia doveva distinguere il singhiozzo dal guasto
-- e invece lasciava passare tutto come guasto di mezza giornata.
--
-- Peggio: il testo poi affermava «un errore che dura più di qualche ora non è
-- un singhiozzo del fornitore: di solito è un token scaduto o un permesso
-- tolto». Il controllo stesso aveva scritto «Token valido». L'email mandava a
-- cercare un problema che non c'era.
--
-- LA CORREZIONE
-- -------------
-- Si contano i controlli falliti DI FILA dopo l'ultimo sano, e si avvisa dal
-- secondo. Non dipende più dalla cadenza del controllo: se un giorno si
-- passasse a ogni ora o a una volta al giorno, la regola continua a valere.
-- Un singhiozzo isolato non sveglia nessuno; due di fila sì.
--
-- E il testo dice quello che sa: quanti controlli sono falliti, da quando, e
-- quale errore ha risposto — senza decidere al posto di chi legge se la colpa
-- è del token o del fornitore.

create or replace function public.integrazioni_avvisa()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  r         RECORD;
  v_dest    text[];
  v_html    text;
  v_quante  int := 0;
  v_nomi    text[] := '{}';
  v_oggetto text;
  v_sano    text;
  v_da      text;
BEGIN
  SELECT array_agg(DISTINCT p.email) INTO v_dest
    FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
   WHERE (ur.role::text = 'super_admin' OR ur.role::text LIKE 'platform%') AND p.email IS NOT NULL;

  FOR r IN
    WITH ultimo AS (
      SELECT DISTINCT ON (integration_name) integration_name, status, error_message, checked_at
        FROM public.integration_health_log
       ORDER BY integration_name, checked_at DESC
    ), ultimo_sano AS (
      SELECT integration_name, max(checked_at) AS sano_il
        FROM public.integration_health_log
       WHERE status IN ('healthy', 'ok')
       GROUP BY integration_name
    ), falliti AS (
      -- Quanti controlli sono andati male DOPO l'ultimo sano, e da quando.
      -- Sono per costruzione consecutivi: tutto ciò che sta dopo l'ultimo sano
      -- non è sano.
      SELECT l.integration_name,
             count(*)          AS quanti,
             min(l.checked_at) AS primo_fallito
        FROM public.integration_health_log l
        LEFT JOIN ultimo_sano s ON s.integration_name = l.integration_name
       WHERE l.status NOT IN ('healthy', 'ok', 'unconfigured')
         AND (s.sano_il IS NULL OR l.checked_at > s.sano_il)
       GROUP BY l.integration_name
    )
    SELECT u.integration_name, u.status, u.error_message, u.checked_at,
           s.sano_il, f.quanti, f.primo_fallito
      FROM ultimo u
      JOIN falliti f ON f.integration_name = u.integration_name
      LEFT JOIN ultimo_sano s ON s.integration_name = u.integration_name
     WHERE u.status NOT IN ('healthy', 'ok', 'unconfigured')
       -- Solo i controlli ancora vivi: un nome fermo da più di due giorni è un
       -- controllo spento o rinominato, non un guasto.
       AND u.checked_at > now() - interval '48 hours'
       -- IL PUNTO: due fallimenti di fila, non un conteggio di ore. Un solo
       -- controllo storto è un singhiozzo e non si avvisa.
       AND f.quanti >= 2
       AND NOT EXISTS (SELECT 1 FROM public.integrazioni_avvisi a
                        WHERE a.integration_name = u.integration_name
                          AND a.avvisato_il > now() - interval '24 hours')
  LOOP
    v_oggetto := 'Integrazione ' || r.integration_name || ': ' || r.quanti || ' controlli falliti di fila';

    v_sano := CASE
      WHEN r.sano_il IS NULL THEN 'mai, da quando esiste questo controllo'
      ELSE to_char(r.sano_il AT TIME ZONE 'Europe/Rome', 'DD/MM HH24:MI') || ' (ora italiana)'
    END;
    v_da := to_char(r.primo_fallito AT TIME ZONE 'Europe/Rome', 'DD/MM HH24:MI');

    v_html :=
      '<div style="max-width:560px;margin:0 auto;padding:24px;font-family:sans-serif;color:#111827;">'
      || '<h2 style="font-size:18px;margin:0 0 12px;">' || v_oggetto || '</h2>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Ultimo controllo: <strong>' || COALESCE(r.status, '?')
      || '</strong>' || COALESCE(' — ' || left(r.error_message, 400), '') || '</p>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Primo controllo fallito: ' || v_da
      || '. Ultima risposta sana: ' || v_sano || '.</p>'
      || '<p style="font-size:14px;color:#374151;margin:0 0 12px;">Questo avviso parte solo dopo due controlli falliti di fila, '
      || 'quindi non è un rallentamento di un attimo. Guarda l''errore qui sopra: se parla di token, permessi o credenziali '
      || 'è una cosa da sistemare da noi; se parla di timeout, rete o nessuna risposta, di solito è il fornitore.</p>'
      || '<p style="font-size:12px;color:#9ca3af;margin-top:20px;">Questo avviso non si ripete per 24 ore. Il dettaglio è nella pagina Connessioni del SuperAdmin.</p></div>';

    INSERT INTO public.integrazioni_avvisi (integration_name, stato, errore, guasto_da)
    VALUES (r.integration_name, r.status, left(r.error_message, 500), COALESCE(r.sano_il, r.primo_fallito));

    PERFORM public.battito_invia_email(v_dest, v_oggetto, v_html);
    v_quante := v_quante + 1;
    v_nomi := v_nomi || r.integration_name;
  END LOOP;

  RETURN jsonb_build_object('avvisi', v_quante, 'integrazioni', v_nomi);
END; $function$;

-- Resta chiusa: la chiama solo il cron `integrazioni-avviso-orario`.
revoke all on function public.integrazioni_avvisa() from public, anon;

-- Rete di sicurezza: se il cron che la chiama non c'è più, questa correzione
-- non serve a niente e tanto vale saperlo subito.
do $verifica$
begin
  if not exists (select 1 from cron.job where command ilike '%integrazioni_avvisa%' and active) then
    raise exception 'il cron che chiama integrazioni_avvisa non è attivo: l''avviso non partirebbe comunque';
  end if;
end $verifica$;
