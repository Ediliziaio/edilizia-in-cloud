-- Numeri delle dashboard (get_metric, e quindi resolve_dashboard): ogni
-- categoria di metriche chiede il permesso delle pagine che mostrano quei dati.
--
-- Trovato il 25/09/2026 nell'audit dei permessi: get_metric (SECURITY
-- DEFINER) controllava solo l'azienda, e il ruolo per una metrica sola
-- (margin_total). Chiunque interno, venditori compresi, leggeva via API
-- fatturato, incassi, saldo di cassa, crediti scaduti e previsione di cassa.
-- La pagina /dashboards chiede già «Cruscotto» (companyRoutes): con quello si
-- vedono tutte le categorie, come prima. Senza, ognuno vede quelle del suo
-- lavoro:
--   finanza   → Controllo di gestione, Fatturazione, Tesoreria, Previsionale,
--               Report finanziari, Scadenzario
--   tesoreria → Tesoreria, Controllo di gestione, Previsionale
--   ordini    → Commesse
--   clienti   → Clienti
--   marketing → Dashboard o Report del marketing
--   magazzino → Magazzino
--   calendar  → Calendario lavori o Appuntamenti
-- Una categoria nuova, finché non la si aggiunge qui, la vede solo chi ha il
-- Cruscotto (o l'amministratore).

set local lock_timeout = '3s';

create or replace function public.puo_vedere_metrica(_company_id uuid, _categoria text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and _company_id is not null
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or _company_id = any (public.aziende_con_uno_dei_permessi(
           array['can_view_cruscotto']
           || case _categoria
                when 'finanza' then array['can_view_controllo_gestione', 'can_view_billing', 'can_view_tesoreria',
                                          'can_view_forecast', 'can_view_financial_reports', 'can_view_scadenzario']
                when 'tesoreria' then array['can_view_tesoreria', 'can_view_controllo_gestione', 'can_view_forecast']
                when 'ordini' then array['can_view_orders']
                when 'clienti' then array['can_view_customers']
                when 'marketing' then array['can_view_marketing_dashboard', 'can_view_marketing_reports']
                when 'magazzino' then array['can_view_warehouse']
                when 'calendar' then array['can_view_calendar', 'can_view_marketing_appointments']
                else array[]::text[]
              end))
    ),
    false);
$function$;
revoke all on function public.puo_vedere_metrica(uuid, text) from public, anon;
grant execute on function public.puo_vedere_metrica(uuid, text) to authenticated, service_role;

-- get_metric: il controllo del permesso dopo quello del ruolo, senza riscriverla
-- (è lunga). Rilanciata non lo aggiunge due volte.
do $patch$
declare
  v_def text := pg_catalog.pg_get_functiondef('public.get_metric(text,jsonb,text,text)'::pg_catalog.regprocedure);
  v_ancora constant text :=
    E'    RAISE EXCEPTION ''Insufficient role for metric %'', p_metric_id USING ERRCODE = ''42501'';\n  END IF;\n';
  v_aggiunta constant text :=
       E'\n  -- 3b. Il permesso della categoria (puo_vedere_metrica): lo stesso delle pagine.\n'
    || E'  IF NOT public.puo_vedere_metrica(v_company_id, v_catalog.category) THEN\n'
    || E'    RAISE EXCEPTION ''Non hai il permesso di vedere questo dato (%)'', p_metric_id USING ERRCODE = ''42501'';\n'
    || E'  END IF;\n';
  v_volte integer;
begin
  if position('puo_vedere_metrica(' in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_volte <> 1 then
    raise exception 'get_metric: punto di aggancio trovato % volte invece di una', v_volte;
  end if;
  execute replace(v_def, v_ancora, v_ancora || v_aggiunta);
end
$patch$;
