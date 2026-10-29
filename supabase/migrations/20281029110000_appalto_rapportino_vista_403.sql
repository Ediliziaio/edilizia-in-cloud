-- ════════════════════════════════════════════════════════════════════════════
-- Il pannello «rapportini da rendicontare» rispondeva 403 a tutti
-- ════════════════════════════════════════════════════════════════════════════
-- Trovato il 29/10/2026 camminando il flusso: ogni apertura del rendiconto di
-- una commessa in appalto registrava in console
--
--   permission denied for function appalto_riga_da_rapportino
--
-- e il riquadro dei rapportini da portare nel rendiconto restava vuoto. Il
-- motivo: la vista `v_appalto_rapportini_da_rendicontare` e' concessa ad
-- `authenticated`, ma dentro chiama in LATERAL `appalto_riga_da_rapportino`,
-- che era stata chiusa a tutti tranne il service role. Il privilegio di
-- esecuzione di una funzione dentro una vista si controlla su CHI INTERROGA,
-- non sul proprietario della vista: la vista era quindi inservibile.
--
-- Conseguenza vera: un rapportino approvato che non diventa una riga di
-- rendiconto e' una giornata di lavoro che non viene fatturata, e nessuno se
-- ne accorge. Quel riquadro esiste apposta per vederli.
--
-- La correzione NON e' un GRANT e basta. La funzione e' SECURITY DEFINER e
-- restituisce `costo_interno`, cioe' il COSTO ORARIO di un dipendente: aperta
-- cosi' com'era, chiunque sia loggato — anche di un'altra azienda — potrebbe
-- leggerlo passando l'id di un rapportino. Il controllo va messo dentro la
-- funzione, che e' l'unico posto che non si puo' aggirare:
--
--   - utente autenticato, non bloccato, non cliente del portale;
--   - puo' vedere QUELLA commessa (`puo_vedere_commessa`);
--   - ha «Importi delle commesse» su QUELLA azienda.
--
-- Il service role resta dentro senza controlli (lo usa il trigger che crea la
-- riga dal rapportino, dove non c'e' nessun utente).
--
-- Chi non ha diritto non riceve un errore ma il motivo scritto, come per ogni
-- altro caso che la funzione gia' gestisce: la vista filtra gia' per gli stessi
-- criteri, quindi per chi ha i permessi non cambia una virgola.
--
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.appalto_riga_da_rapportino(p_rapportino_id uuid)
returns table (
  tariffa_id uuid,
  quantita numeric,
  employee_id uuid,
  costo_interno numeric,
  motivo text
)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r record;
  v_ord record;
  v_emp record;
  v_t record;
  v_generiche integer;
  v_qta numeric;
begin
  select cr.id, cr.order_id, cr.company_id, cr.user_id, cr.data_lavoro,
         cr.ore_lavorate, cr.role_type
    into v_r
    from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Rapportino inesistente'::text;
    return;
  end if;

  -- Il controllo degli accessi: qui, non nella vista. La funzione e' DEFINER e
  -- restituisce il costo orario di una persona.
  if auth.uid() is not null then
    if public.utente_bloccato()
       or public.utente_e_cliente_esterno()
       or not public.puo_vedere_commessa(v_r.order_id)
       or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_r.company_id) then
      return query select null::uuid, null::numeric, null::uuid, null::numeric,
        'Non hai accesso a questo rapportino'::text;
      return;
    end if;
  end if;

  select o.order_type, o.appalto_contratto_id into v_ord
    from public.orders o where o.id = v_r.order_id and o.deleted_at is null;
  if not found or v_ord.order_type is distinct from 'appaltatore_lavoro' then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'La commessa non e'' in appalto'::text;
    return;
  end if;
  if v_ord.appalto_contratto_id is null then
    return query select null::uuid, null::numeric, null::uuid, null::numeric,
      'La commessa non ha un contratto: senza listino non c''e'' prezzo'::text;
    return;
  end if;
  if coalesce(v_r.ore_lavorate, 0) <= 0 then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Il rapportino non porta ore'::text;
    return;
  end if;

  -- Chi ha lavorato: dall'utente dell'app al suo record di personale. Niente
  -- filtro su `is_active`: il rapportino e' di quel giorno, non di oggi.
  select e.id, e.qualifica, e.livello_inquadramento, e.costo_orario
    into v_emp
    from public.employees e
   where e.user_id = v_r.user_id and e.company_id = v_r.company_id
   order by coalesce(e.is_active, true) desc, e.created_at
   limit 1;

  select t.id, t.unita_misura into v_t
    from public.appalto_tariffe t
   where t.contratto_id = v_ord.appalto_contratto_id
     and t.tipo = 'manodopera' and t.attivo
     and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
     and (t.valido_al is null or v_r.data_lavoro <= t.valido_al)
     and t.qualifica is not null
     and v_emp.id is not null
     and (lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.qualifica, '')))
       or lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.livello_inquadramento, ''))))
   order by t.ordine
   limit 1;

  if v_t.id is null then
    select count(*) into v_generiche
      from public.appalto_tariffe t
     where t.contratto_id = v_ord.appalto_contratto_id
       and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
       and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
       and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    if v_generiche = 1 then
      select t.id, t.unita_misura into v_t
        from public.appalto_tariffe t
       where t.contratto_id = v_ord.appalto_contratto_id
         and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
         and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
         and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    elsif v_generiche > 1 then
      return query select null::uuid, null::numeric, v_emp.id, null::numeric,
        'Piu'' di una tariffa di manodopera senza qualifica: scegli tu quale'::text;
      return;
    end if;
  end if;

  if v_t.id is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('Nessuna tariffa di manodopera per '
        || coalesce(nullif(btrim(coalesce(v_emp.qualifica, v_emp.livello_inquadramento)), ''), 'questo operaio')
        || ' in vigore il ' || to_char(v_r.data_lavoro, 'DD/MM/YYYY'))::text;
    return;
  end if;

  v_qta := case v_t.unita_misura
             when 'ora' then v_r.ore_lavorate
             when 'giornata' then 1
             when 'uomo_giorno' then 1
             else null
           end;
  if v_qta is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('La tariffa e'' a ' || v_t.unita_misura || ': le ore non si convertono da sole')::text;
    return;
  end if;

  return query select
    v_t.id,
    v_qta,
    v_emp.id,
    case when v_emp.costo_orario is not null and v_emp.costo_orario > 0
         then round(v_r.ore_lavorate * v_emp.costo_orario, 2) end,
    null::text;
end;
$fn$;

revoke all on function public.appalto_riga_da_rapportino(uuid) from public, anon;
grant execute on function public.appalto_riga_da_rapportino(uuid) to authenticated, service_role;

comment on function public.appalto_riga_da_rapportino(uuid) is
  'Che riga di rendiconto proporrebbe un rapportino approvato, o il motivo per cui non si puo''. Eseguibile da authenticated perche'' la vista v_appalto_rapportini_da_rendicontare la chiama in lateral: il controllo degli accessi e'' dentro la funzione, che e'' SECURITY DEFINER e restituisce il costo orario di una persona.';
