-- «Domani sei a…»: l'avviso della sera all'operaio (26/11/2026, piano campo completo, punto 1.2).
--
-- Alle 19 chi domani lavora in un cantiere DIVERSO da oggi riceve una notifica con il cantiere e
-- l'indirizzo; toccandola apre la Home, dove il riquadro «Domani» ha mappa, squadra e chi chiamare.
-- Stesso posto di oggi = nessun avviso (niente rumore ogni sera).
--
-- - Spento di default: lo accende l'azienda (campo_avvisi_azienda.avviso_domani), dalle regole dell'area operai.
--   Tabella a parte e non campo_regole_azienda: lì una riga vuol dire «l'azienda ha fatto le sue scelte».
-- - Il programma di domani è quello che la persona vede nell'app: si chiama campo_mia_giornata come lei
--   (stessa logica, nessuna copia da tenere allineata).
-- - Una notifica sola: la nuova sostituisce quella della sera prima (campo_notifica, tipo campo_domani).

create table if not exists public.campo_avvisi_azienda (
  company_id uuid primary key references public.companies(id) on delete cascade,
  avviso_domani boolean not null default false,
  aggiornato_da uuid,
  aggiornato_il timestamptz not null default now()
);
alter table public.campo_avvisi_azienda enable row level security;
-- Si legge e si scrive solo dalle due funzioni qui sotto.
revoke all on public.campo_avvisi_azienda from public, anon, authenticated;

create or replace function public.campo_avvisi_azienda_leggi(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  return jsonb_build_object('avviso_domani',
    coalesce((select a.avviso_domani from public.campo_avvisi_azienda a where a.company_id = p_company_id), false));
end;
$function$;

create or replace function public.campo_avvisi_azienda_salva(p_company_id uuid, p_avviso_domani boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  insert into public.campo_avvisi_azienda (company_id, avviso_domani, aggiornato_da, aggiornato_il)
  values (p_company_id, coalesce(p_avviso_domani, false), auth.uid(), now())
  on conflict (company_id) do update
    set avviso_domani = excluded.avviso_domani, aggiornato_da = excluded.aggiornato_da, aggiornato_il = now();
  return jsonb_build_object('avviso_domani', coalesce(p_avviso_domani, false));
end;
$function$;

revoke all on function public.campo_avvisi_azienda_leggi(uuid) from public, anon;
revoke all on function public.campo_avvisi_azienda_salva(uuid, boolean) from public, anon;
grant execute on function public.campo_avvisi_azienda_leggi(uuid) to authenticated;
grant execute on function public.campo_avvisi_azienda_salva(uuid, boolean) to authenticated;

-- L'avviso di domani, come il riepilogo dei rapportini, sostituisce il precedente.
CREATE OR REPLACE FUNCTION public.campo_notifica(p_company_id uuid, p_user_id uuid, p_type text, p_title text, p_body text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_action_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN NULL; END IF;
  -- Stesso avviso allo stesso utente nelle ultime 12 ore: non lo ripetiamo.
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.type = p_type AND n.title = p_title
      AND coalesce(n.entity_id::text, '') = coalesce(p_entity_id::text, '')
      AND n.created_at > now() - interval '12 hours'
  ) THEN RETURN NULL; END IF;
  -- Riepilogo dei rapportini e avviso di domani sono uno stato, non un evento: il nuovo prende il posto dei vecchi.
  IF p_type IN ('campo_digest', 'campo_domani') THEN
    DELETE FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.company_id = p_company_id AND n.type = p_type;
  END IF;
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  VALUES (p_company_id, p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.campo_promemoria(p_slot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ora  text := to_char(now() AT TIME ZONE 'Europe/Rome', 'HH24:MI');
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_slot text := p_slot;
  v_n int := 0; r record;
  v_claims text; v_g jsonb; v_oggi_c jsonb; v_domani_c jsonb; v_primo jsonb; v_titolo text;
BEGIN
  IF v_slot IS NULL THEN
    v_slot := CASE
      WHEN v_ora BETWEEN '17:30' AND '17:59' THEN 'uscita'
      WHEN v_ora BETWEEN '18:30' AND '18:59' THEN 'rapportino'
      WHEN v_ora BETWEEN '19:00' AND '19:29' THEN 'domani'
      WHEN v_ora BETWEEN '07:30' AND '07:59' THEN 'digest'
      ELSE NULL END;
  END IF;
  IF v_slot IS NULL THEN RETURN jsonb_build_object('slot', null, 'ora', v_ora); END IF;

  IF v_slot = 'uscita' THEN
    -- Entrata oggi senza uscita successiva
    FOR r IN
      SELECT t.company_id, t.user_id, min(t.timestamp_evento) AS entrata
      FROM public.campo_timbrature t
      WHERE t.tipo = 'entrata' AND (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_timbrature u WHERE u.user_id = t.user_id AND u.tipo = 'uscita' AND u.timestamp_evento > t.timestamp_evento)
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Non hai timbrato l''uscita',
           'Sei entrato alle ' || to_char(r.entrata AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Se hai finito, timbra l''uscita.',
           'campo_timbratura', NULL, '/campo/timbratura') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'rapportino' THEN
    -- Ha timbrato oggi ma non ha mandato il rapportino di oggi
    FOR r IN
      SELECT t.company_id, t.user_id,
             (array_agg(t.order_id ORDER BY t.timestamp_evento DESC) FILTER (WHERE t.order_id IS NOT NULL))[1] AS order_id
      FROM public.campo_timbrature t
      WHERE (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_rapportini cr WHERE cr.user_id = t.user_id AND cr.data_lavoro = v_oggi)
        -- già nelle presenze di un rapportino di squadra del giorno
        AND NOT EXISTS (SELECT 1 FROM public.campo_rapportini cr2
                          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(cr2.presenze) = 'array' THEN cr2.presenze ELSE '[]'::jsonb END) pz
                          JOIN public.employees e ON e.id::text = pz->>'employee_id'
                         WHERE e.user_id = t.user_id AND cr2.company_id = t.company_id
                           AND cr2.data_lavoro = v_oggi AND cr2.stato <> 'rifiutato')
        -- con «lo compila il capo» il promemoria va solo ai capicantiere
        AND (coalesce((SELECT ra.chi_compila FROM public.campo_regole_azienda ra WHERE ra.company_id = t.company_id), 'ognuno') <> 'capo'
             OR EXISTS (SELECT 1 FROM public.order_campo_assignments oca
                         WHERE oca.user_id = t.user_id AND oca.order_id = t.order_id
                           AND (oca.is_capocantiere OR oca.role_type = 'subcontractor'))
             OR NOT EXISTS (SELECT 1 FROM public.order_campo_assignments oc2
                             WHERE oc2.order_id = t.order_id AND oc2.is_capocantiere))
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Manca il rapportino di oggi',
           'Due minuti: cosa hai fatto, quante ore, una foto. Anche a voce.',
           'campo_rapportino', NULL,
           CASE WHEN r.order_id IS NOT NULL THEN '/campo/lavoro/' || r.order_id::text || '/rapportino' ELSE '/campo' END) IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'domani' THEN
    -- Chi domani lavora in un cantiere diverso da oggi, nelle aziende che l'hanno acceso.
    v_claims := current_setting('request.jwt.claims', true);
    FOR r IN
      SELECT DISTINCT a.company_id, a.user_id
      FROM public.order_campo_assignments a
      JOIN public.campo_avvisi_azienda av ON av.company_id = a.company_id AND av.avviso_domani
      WHERE a.user_id IS NOT NULL
    LOOP
      -- Il programma come lo vede la persona nell'app (campo_mia_giornata legge auth.uid()).
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
      v_g := public.campo_mia_giornata(v_oggi, 2);
      v_oggi_c := coalesce(v_g->'giorni'->0->'cantieri', '[]'::jsonb);
      v_domani_c := coalesce(v_g->'giorni'->1->'cantieri', '[]'::jsonb);
      CONTINUE WHEN jsonb_array_length(v_domani_c) = 0;
      CONTINUE WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_domani_c) d
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_oggi_c) o WHERE o->>'order_id' = d->>'order_id'));
      v_primo := v_domani_c->0;
      v_titolo := coalesce(nullif(concat_ws(' · ', nullif(v_primo->>'codice', ''), nullif(v_primo->>'titolo', '')), ''), 'un cantiere');
      IF jsonb_array_length(v_domani_c) > 1 THEN
        v_titolo := v_titolo || ' +' || (jsonb_array_length(v_domani_c) - 1);
      END IF;
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_domani', 'Domani sei a ' || v_titolo,
           coalesce(nullif(v_primo->>'indirizzo', ''), 'Apri l''app per i dettagli.'),
           'campo_domani', NULL, '/campo') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;
    PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);

  ELSIF v_slot = 'digest' THEN
    -- All'ufficio: quanti rapportini aspettano l'approvazione
    FOR r IN
      SELECT cr.company_id, count(*) AS n, p.id AS admin_id
      FROM public.campo_rapportini cr
      JOIN public.profiles p ON p.company_id = cr.company_id
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('company_admin', 'company_staff')
      WHERE cr.stato = 'inviato'
      GROUP BY cr.company_id, p.id
    LOOP
      IF public.campo_notifica(r.company_id, r.admin_id, 'campo_digest',
           r.n || CASE WHEN r.n = 1 THEN ' rapportino da approvare' ELSE ' rapportini da approvare' END,
           'Gli operai aspettano l''esito: ore e fasi passano in commessa solo dopo l''approvazione.',
           'campo_rapportino', NULL, '/azienda/ordini') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('slot', v_slot, 'ora', v_ora, 'notifiche', v_n);
END $function$;

-- Ogni sera dalla domenica al venerdì (per il giorno dopo, lunedì–sabato), alle 19:08 di Roma.
-- Le ore del cron sono UTC: 17 e 18 coprono ora solare e legale; fuori finestra la funzione non fa niente.
select cron.unschedule('campo-promemoria-domani') where exists (select 1 from cron.job where jobname = 'campo-promemoria-domani');
select cron.schedule('campo-promemoria-domani', '8 17,18 * * 0-5', 'select public.campo_promemoria()');
