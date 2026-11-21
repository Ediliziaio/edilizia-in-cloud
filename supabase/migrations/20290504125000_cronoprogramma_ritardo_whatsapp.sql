-- Il bot usa il cronoprogramma della commessa. La conferma applica in una
-- transazione le sole date mostrate, se la pianificazione è ancora la stessa.
create or replace function public.cronoprogramma_ritardo_whatsapp(
  p_azienda uuid, p_utente uuid, p_commessa uuid, p_proposta jsonb default null
)
returns jsonb
language plpgsql security invoker
set search_path = ''
set lock_timeout = '3s'
as $$
declare
  v_ordine public.orders%rowtype;
  v_dati jsonb;
  v_versione text;
  v_fine date;
  v_fasi integer;
  v_sottofasi integer;
begin
  if not coalesce(public.has_permission_for_company(p_utente, 'can_edit_orders', p_azienda), false)
     or exists (select 1 from public.staff_permissions p
       where p.user_id=p_utente and p.company_id=p_azienda and p.sola_lettura)
     or not exists (select 1 from public.silvio_commesse_visibili(p_azienda, p_utente) c where c.id=p_commessa) then
    raise exception 'Commessa non disponibile per questa utenza' using errcode='42501';
  end if;

  if p_proposta is not null then
    -- Serializza le conferme e blocca le righe che l'anteprima ha utilizzato.
    perform 1 from public.orders o where o.id=p_commessa and o.company_id=p_azienda for update;
    perform 1 from public.order_work_phases f where f.order_id=p_commessa and f.company_id=p_azienda order by f.id for update;
    perform 1 from public.order_work_subphases s join public.order_work_phases f on f.id=s.phase_id
      where f.order_id=p_commessa and f.company_id=p_azienda order by s.id for update of s;
  end if;

  select * into v_ordine from public.orders o
  where o.id=p_commessa and o.company_id=p_azienda and o.deleted_at is null;
  if not found or lower(btrim(coalesce(v_ordine.status::text, ''))) in (
    'completato','completata','chiuso','chiusa','annullato','annullata','cancellato','cancellata','archiviato','archiviata','bozza'
  ) then
    raise exception 'La commessa non è aperta' using errcode='22023';
  end if;

  select jsonb_build_object(
    'commessa', jsonb_build_object(
      'titolo', coalesce(nullif(v_ordine.order_code, ''), nullif(v_ordine.description, ''), v_ordine.client_name, 'Commessa'),
      'inizio', v_ordine.work_start_date, 'fine', v_ordine.work_end_date, 'stato', v_ordine.status, 'consegna', v_ordine.expected_date,
      'indirizzo', coalesce(nullif(v_ordine.indirizzo_lavori, ''), v_ordine.work_address)),
    'fasi', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', f.name, 'inizio', f.start_date, 'fine', f.end_date,
      'stato', f.status, 'percentuale', f.percentuale, 'completata_il', f.completata_il
    ) order by f.position, f.id), '[]'::jsonb) from public.order_work_phases f
      where f.order_id=p_commessa and f.company_id=p_azienda),
    'sottofasi', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'fase', s.phase_id, 'inizio', s.data_inizio, 'fine', s.data_fine, 'iniziata',
      s.fatta or s.iniziata_il is not null or s.giorni_lavorati>0 or s.percentuale>0
    ) order by s.id), '[]'::jsonb) from public.order_work_subphases s
      join public.order_work_phases f on f.id=s.phase_id where f.order_id=p_commessa and f.company_id=p_azienda),
    'calendario', (select to_jsonb(c) - 'company_id' - 'updated_by' - 'updated_at'
      from public.silvio_calendario c where c.company_id=p_azienda),
    'festivita', (select coalesce(jsonb_agg(jsonb_build_object('data', h.data, 'ricorrente', h.ricorrente)
      order by h.data, h.ricorrente), '[]'::jsonb) from public.hr_festivita h where h.company_id=p_azienda)
  ) into v_dati;
  v_versione := md5(v_dati::text);
  if p_proposta is null then return v_dati || jsonb_build_object('versione', v_versione); end if;

  if p_proposta->>'versione' is distinct from v_versione then
    raise exception 'Il cronoprogramma è cambiato dopo l’anteprima' using errcode='PT409';
  end if;
  v_fine := (p_proposta->>'fine')::date;
  if v_fine is null or v_fine < v_ordine.work_end_date or v_fine < v_ordine.work_start_date
     or jsonb_typeof(p_proposta->'fasi') is distinct from 'array'
     or jsonb_typeof(p_proposta->'sottofasi') is distinct from 'array' then
    raise exception 'Date del cronoprogramma non valide' using errcode='22023';
  end if;

  update public.order_work_phases f
    set start_date=r.inizio, end_date=r.fine, updated_at=now()
    from jsonb_to_recordset(p_proposta->'fasi') r(id uuid, inizio date, fine date)
    where f.id=r.id and f.order_id=p_commessa and f.company_id=p_azienda
      and f.status in ('da_iniziare','da_fare','in_corso') and f.completata_il is null and coalesce(f.percentuale,0)<100
      and r.fine>f.end_date and (r.inizio is null or r.inizio<=r.fine)
      and (r.inizio is not distinct from f.start_date
        or (f.status in ('da_iniziare','da_fare') and coalesce(f.percentuale,0)=0 and r.inizio>f.start_date));
  get diagnostics v_fasi = row_count;
  if v_fasi <> jsonb_array_length(p_proposta->'fasi') then
    raise exception 'Fase non ripianificabile' using errcode='22023';
  end if;

  update public.order_work_subphases s
    set data_inizio=r.inizio, data_fine=r.fine, updated_at=now()
    from jsonb_to_recordset(p_proposta->'sottofasi') r(id uuid, inizio date, fine date), public.order_work_phases f
    where s.id=r.id and f.id=s.phase_id and f.order_id=p_commessa and f.company_id=p_azienda
      and not s.fatta and s.iniziata_il is null and coalesce(s.giorni_lavorati,0)=0 and coalesce(s.percentuale,0)=0
      and r.inizio>s.data_inizio and r.fine>s.data_fine and r.inizio<=r.fine
      and r.inizio>=f.start_date and r.fine<=f.end_date
      and exists (select 1 from jsonb_array_elements(p_proposta->'fasi') a where a->>'id'=f.id::text);
  get diagnostics v_sottofasi = row_count;
  if (v_fasi = 0 and v_fine is not distinct from v_ordine.work_end_date)
    or v_sottofasi <> jsonb_array_length(p_proposta->'sottofasi') or exists (
    select 1 from public.order_work_phases f where f.order_id=p_commessa and f.company_id=p_azienda and f.end_date>v_fine
  ) then raise exception 'Sottofasi o fine lavori non coerenti' using errcode='22023'; end if;

  update public.orders set work_end_date=v_fine, updated_at=now()
    where id=p_commessa and company_id=p_azienda and work_end_date is distinct from v_fine;
  insert into public.order_events(company_id, order_id, event_type, actor_id, payload)
  values (p_azienda, p_commessa, 'nota_interna', p_utente, jsonb_build_object(
    'description', format('Cronoprogramma aggiornato da WhatsApp. Fine prevista %s. Fasi aggiornate: %s.', to_char(v_fine, 'DD/MM/YYYY'), v_fasi),
    'origine', 'whatsapp', 'fine_precedente', v_ordine.work_end_date, 'fine', v_fine,
    'fasi', p_proposta->'fasi', 'sottofasi', p_proposta->'sottofasi'));
  return jsonb_build_object('ok', true, 'fine', v_fine, 'fasi', v_fasi, 'sottofasi', v_sottofasi);
end;
$$;

revoke all on function public.cronoprogramma_ritardo_whatsapp(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cronoprogramma_ritardo_whatsapp(uuid, uuid, uuid, jsonb) to service_role;
