-- La scheda commessa in una lettura sola (23/10/2026).
--
-- All'apertura della scheda partivano 30-35 richieste, quasi tutte dirette
-- sulle tabelle: ognuna ripreparava le regole di accesso, circa un secondo di
-- lavoro del database per ogni apertura (misurato su Demo 2: margine 272 ms,
-- storia degli stati 101, allegati 98, rate 95, mezzi 76, materiali 71...).
-- Ora le più frequenti arrivano da qui in una richiesta: stesse tabelle, stesse
-- colonne, con i permessi di chi guarda (SECURITY INVOKER: le regole di accesso
-- valgono come prima) e il piano preparato una volta per connessione.
--
-- Margini e assistenza arrivano solo se la pagina li chiede (p_con_economia,
-- p_con_ticket): è la pagina a sapere se chi guarda può vederli nell'app,
-- come prima, quando quelle letture partivano solo con il permesso.
--
-- La pagina mette ogni pezzo nella memoria dell'app sotto la chiave del
-- componente che lo usa: i componenti lo trovano pronto e non rileggono. Le
-- modifiche continuano a rileggere solo il loro pezzo.

create or replace function public.scheda_commessa(
  p_order_id uuid,
  p_company_id uuid,
  p_con_economia boolean default false,
  p_con_ticket boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set plan_cache_mode = force_generic_plan
as $$
declare
  v_fattura_ids uuid[];
  v_documenti_cliente jsonb := '[]'::jsonb;
  v_economia jsonb;
begin
  if not exists (select 1 from public.orders where id = p_order_id and company_id = p_company_id) then
    return null;
  end if;

  select coalesce(array_agg(fo.fattura_id), '{}') into v_fattura_ids
    from public.fattura_ordine fo
   where fo.ordine_id = p_order_id and fo.company_id = p_company_id;

  begin
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_documenti_cliente
      from public.documenti_cliente_della_commessa(p_order_id) d;
  exception when others then
    v_documenti_cliente := null;  -- la pagina lo rilegge da sola
  end;

  if p_con_economia then
    v_economia := jsonb_build_object(
      'canonica', (select jsonb_build_object(
          'preventivo_contratto', m.preventivo_contratto, 'variazioni_approvate', m.variazioni_approvate,
          'preventivo_totale', m.preventivo_totale, 'costo_acquisti', m.costo_acquisti,
          'costo_materiali_magazzino', m.costo_materiali_magazzino, 'movimenti_magazzino_senza_costo', m.movimenti_magazzino_senza_costo,
          'costo_manodopera', m.costo_manodopera, 'costo_provvigioni', m.costo_provvigioni,
          'costo_rimborsi_km', m.costo_rimborsi_km, 'rimborsi_km_da_approvare', m.rimborsi_km_da_approvare,
          'numero_rimborsi_km_da_approvare', m.numero_rimborsi_km_da_approvare, 'costo_errori', m.costo_errori,
          'costo_diretto', m.costo_diretto, 'consuntivo', m.consuntivo, 'margine', m.margine, 'margine_perc', m.margine_perc)
        from public.v_ordine_marginalita m where m.id = p_order_id),
      'mezzi', (select jsonb_build_object('costo_mezzi_stimato', v.costo_mezzi_stimato, 'mezzi_usati', v.mezzi_usati,
          'giorni_mezzo', v.giorni_mezzo, 'mezzi_senza_costo', v.mezzi_senza_costo, 'dati_mezzi_visibili', v.dati_mezzi_visibili)
        from public.v_ordine_costi_mezzi_stimati v where v.order_id = p_order_id),
      'dipendenti', coalesce((select jsonb_agg(jsonb_build_object('total_cost', e.total_cost, 'cost_preventivo', e.cost_preventivo))
        from public.order_employees e where e.order_id = p_order_id), '[]'::jsonb),
      'squadre', coalesce((select jsonb_agg(jsonb_build_object('total_cost', t.total_cost, 'vat_rate', t.vat_rate))
        from public.order_external_teams t where t.order_id = p_order_id), '[]'::jsonb),
      'venditori', coalesce((select jsonb_agg(jsonb_build_object('commission_amount', s.commission_amount, 'deduction_amount', s.deduction_amount))
        from public.order_salespeople s where s.order_id = p_order_id), '[]'::jsonb),
      'errori', coalesce((select jsonb_agg(jsonb_build_object('amount', x.amount))
        from public.order_errors x where x.order_id = p_order_id), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'stati', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'icon', s.icon, 'color', s.color,
                 'position', s.position, 'is_support_phase', s.is_support_phase) order by s.position)
        from public.order_statuses s where s.company_id = p_company_id), '[]'::jsonb),
    'fasi', coalesce((select jsonb_agg(jsonb_build_object('status', f.status, 'percentuale', f.percentuale))
        from public.order_work_phases f where f.order_id = p_order_id), '[]'::jsonb),
    'storia', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'status_id', h.status_id, 'changed_at', h.changed_at,
                 'changed_by', h.changed_by,
                 'status', case when s.id is null then null else jsonb_build_object('name', s.name, 'color', s.color) end)
                 order by h.changed_at desc)
        from public.order_status_history h left join public.order_statuses s on s.id = h.status_id
       where h.order_id = p_order_id), '[]'::jsonb),
    'allegati', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc, a.id)
        from public.order_attachments a where a.order_id = p_order_id), '[]'::jsonb),
    'prossima_attivita', (select jsonb_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date, 'status', t.status,
                 'assigned_to', t.assigned_to,
                 'assigned', case when p.id is null then null else jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name) end)
        from public.tasks t left join public.profiles p on p.id = t.assigned_to
       where t.company_id = p_company_id and t.order_id = p_order_id and t.status not in ('completata', 'in_attesa')
       order by t.due_date asc nulls last limit 1),
    'commessa', (select jsonb_build_object('id', o.id, 'workflow_kind', o.workflow_kind, 'parent_contract_id', o.parent_contract_id,
                 'intervention_reference', o.intervention_reference, 'order_code', o.order_code,
                 'percentuale_avanzamento', o.percentuale_avanzamento)
        from public.orders o where o.id = p_order_id),
    'impostazioni_fasi', (select jsonb_build_object('peso_media', c.peso_media, 'modello_fasi_predefinito', c.modello_fasi_predefinito,
                 'controlli_avvio', c.controlli_avvio)
        from public.company_fasi_settings c where c.company_id = p_company_id),
    'fatture_collegate', coalesce((select jsonb_agg(jsonb_build_object('id', fo.id, 'importo_associato', fo.importo_associato,
                 'fattura_id', fo.fattura_id, 'company_id', fo.company_id))
        from public.fattura_ordine fo where fo.ordine_id = p_order_id and fo.company_id = p_company_id), '[]'::jsonb),
    'fatture_dirette', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'data_emissione', d.data_emissione,
                 'stato', d.stato, 'tipo', d.tipo, 'totale_da_pagare', d.totale_da_pagare, 'totale_documento', d.totale_documento,
                 'company_id', d.company_id))
        from public.documenti_fiscali d where d.ordine_id = p_order_id and d.deleted_at is null and d.company_id = p_company_id), '[]'::jsonb),
    'fatture_da_collegamento', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'numero', d.numero, 'data_emissione', d.data_emissione,
                 'stato', d.stato, 'tipo', d.tipo, 'totale_da_pagare', d.totale_da_pagare, 'totale_documento', d.totale_documento))
        from public.documenti_fiscali d where d.id = any (v_fattura_ids) and d.deleted_at is null), '[]'::jsonb),
    'varianti', coalesce((select jsonb_agg(to_jsonb(v) order by v.numero_odv)
        from public.ordini_variazione v where v.order_id = p_order_id and v.company_id = p_company_id), '[]'::jsonb),
    'rate', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('fattura',
                 case when d.id is null then null else jsonb_build_object('id', d.id, 'numero', d.numero, 'stato', d.stato, 'importo_pagato', d.importo_pagato) end)
                 order by i.position)
        from public.order_installments i left join public.documenti_fiscali d on d.id = i.documento_fiscale_id
       where i.order_id = p_order_id), '[]'::jsonb),
    'materiali', coalesce((select jsonb_agg(to_jsonb(it) order by it.position)
        from public.order_items it where it.order_id = p_order_id), '[]'::jsonb),
    'accessi', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('profile',
                 case when p.id is null then null else jsonb_build_object('id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email) end)
                 order by a.created_at)
        from public.order_campo_assignments a left join public.profiles p on p.id = a.user_id
       where a.order_id = p_order_id), '[]'::jsonb),
    'manodopera_presente', exists (select 1 from public.order_employees e where e.order_id = p_order_id and e.employee_id is not null)
                        or exists (select 1 from public.order_external_teams t where t.order_id = p_order_id and t.external_team_id is not null),
    'ticket', case when p_con_ticket then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status,
                 'priority', t.priority, 'tipo', t.tipo, 'created_at', t.created_at, 'data_intervento_prevista', t.data_intervento_prevista,
                 'a_pagamento', t.a_pagamento, 'pagato', t.pagato, 'importo_finale', t.importo_finale,
                 'importo_preventivato', t.importo_preventivato, 'merce_richiesta', t.merce_richiesta) order by t.created_at desc)
        from public.tickets t where t.order_id = p_order_id and t.company_id = p_company_id), '[]'::jsonb) end,
    'rapportini_da_approvare', (select count(*) from public.campo_rapportini r where r.order_id = p_order_id and r.stato = 'inviato'),
    'correzioni_da_approvare', (select count(*) from public.campo_timbrature_correzioni c where c.order_id = p_order_id and c.stato = 'in_attesa'),
    'bolle_da_verificare', (select count(*) from public.campo_acquisti a where a.order_id = p_order_id and a.stato = 'da_verificare'),
    'fasi_ufficio', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
                 'due_date', t.due_date, 'sort_order', t.sort_order) order by t.sort_order nulls last, t.created_at)
        from public.tasks t where t.order_id = p_order_id and t.activity_scope = 'ufficio'), '[]'::jsonb),
    'documenti_cliente', v_documenti_cliente,
    'economia', v_economia
  );
end
$$;

revoke all on function public.scheda_commessa(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.scheda_commessa(uuid, uuid, boolean, boolean) to authenticated;
