-- Commessa generale dai documenti: correzioni della prova dal vivo su Demo Azienda 2 (16/11/2026).
--
-- Il contratto applicativo nasceva come figlia dell'accordo quadro senza il nome del cliente
-- (`client_name` vuoto: in elenco la commessa non aveva committente) e senza uno stato di
-- lavorazione. Ora prende il nome del cliente dall'accordo e il primo stato di lavorazione
-- dell'azienda, escluse le fasi di supporto e gli stati «da confermare»: un applicativo è un
-- contratto firmato. Solo la funzione cambia; nessuna riga esistente viene toccata.

set local lock_timeout = '3s';

create or replace function public.generale_applicativo_crea(p_lettura uuid, p_generale uuid, p_piano jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_stato text;
  v_figlia uuid := gen_random_uuid();
  v_cliente uuid;
  v_nome_cliente text;
  v_stato_iniziale uuid;
  v_pezzi jsonb;
begin
  select company_id, stato into v_company, v_stato from public.generale_letture where id = p_lettura;
  if v_company is null or auth.uid() is null or public.utente_bloccato()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) is not true then
    raise exception 'Lettura non trovata' using errcode = '42501';
  end if;
  if v_stato <> 'pronta' then raise exception 'Questa lettura è già stata usata o non è finita.' using errcode = '22023'; end if;
  select o.customer_id, o.client_name into v_cliente, v_nome_cliente from public.orders o
   where o.id = p_generale and o.company_id = v_company and o.workflow_kind = 'generale' and o.deleted_at is null;
  if not found then raise exception 'Accordo quadro non trovato.' using errcode = 'P0002'; end if;
  if coalesce(btrim(p_piano->>'nome'), '') = '' then raise exception 'Scrivi il nome del contratto applicativo.' using errcode = '22023'; end if;

  select s.id into v_stato_iniziale
    from public.order_statuses s
   where s.company_id = v_company
     and coalesce(s.is_support_phase, false) = false
     and s.name !~* 'da[[:space:]]*conferm|attesa[[:space:]]+(di[[:space:]]+)?conferm|non[[:space:]]+confermat|provvisori'
   order by s.position asc nulls last, s.created_at asc
   limit 1;

  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code, customer_id, client_name,
                             current_status_id, work_address, work_start_date, work_end_date)
  values (v_figlia, v_company, auth.uid(), left(btrim(p_piano->>'nome'), 500), 'commessa',
          coalesce(nullif(p_piano->>'valore', '')::numeric, 0), public.prossimo_numero_commessa(v_company), v_cliente, v_nome_cliente,
          v_stato_iniziale,
          left(nullif(p_piano->'dati'->>'indirizzo', ''), 300), nullif(p_piano->'dati'->>'inizio', '')::date, nullif(p_piano->'dati'->>'fine', '')::date);
  perform public.commessa_generale_collega(p_generale, array[v_figlia]);
  -- Il contratto dell'accordo resta sulla generale: dell'applicativo si scrivono riferimenti PA
  -- (col CIG derivato) e fasi sulla figlia; niente contratto, garanzie o elenco qui.
  v_pezzi := public.generale_documenti_scrivi_pezzi(p_generale, v_figlia, v_company,
               jsonb_build_object('riferimenti_pa', coalesce(p_piano->'riferimenti_pa', '[]'::jsonb), 'fasi', coalesce(p_piano->'fasi', '[]'::jsonb)));
  perform public.generale_lettura_segna_usata(p_lettura, p_generale, jsonb_build_object('generale_id', p_generale, 'figlia_id', v_figlia, 'tipo', 'applicativo') || v_pezzi);
  return v_figlia;
end $$;
revoke all on function public.generale_applicativo_crea(uuid, uuid, jsonb) from public, anon;
grant execute on function public.generale_applicativo_crea(uuid, uuid, jsonb) to authenticated;
