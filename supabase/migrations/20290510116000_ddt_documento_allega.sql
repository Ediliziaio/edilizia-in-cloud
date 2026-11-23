-- 23/11/2026 — L'originale di una bolla già registrata senza originale (per esempio dalla fattura)
-- si allega a quella, invece di creare una seconda bolla con lo stesso numero.
-- Gemella di ddt_documento_registra: stessi permessi, stesso documento in lettura; qui la bolla c'è
-- già, prende il file e la lettura AI, e i dati di trasporto vuoti. Righe e commessa restano come
-- sono (chi le ha registrate ha deciso). Il documento risulta registrato su quella bolla.
create or replace function public.ddt_documento_allega(p_id uuid, p_ddt uuid, p_dati jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare j public.ddt_document_jobs%rowtype; d public.ddt_ricezione%rowtype; f jsonb;
begin
  select * into j from public.ddt_document_jobs where id = p_id for update;
  if not found or auth.uid() is null or public.utente_bloccato() or not coalesce(public.user_can_access_company(j.company_id), false)
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', j.company_id)
                     or public.has_permission_for_company(auth.uid(), 'can_manage_purchasing', j.company_id)
                     or public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', j.company_id)
                     or public.e_super_admin_dentro(j.company_id), false) then
    raise exception 'Non puoi registrare questo documento' using errcode = '42501';
  end if;
  if j.ddt_id is not null then return j.ddt_id; end if;
  if j.status not in ('review', 'error', 'da_leggere') then raise exception 'Aspetta la lettura del documento'; end if;
  select * into d from public.ddt_ricezione where id = p_ddt and company_id = j.company_id for update;
  if not found then raise exception 'Bolla non disponibile' using errcode = '42501'; end if;
  if d.ddt_file_url is not null or d.ddt_file_bucket is not null then
    raise exception 'Quella bolla ha già il suo originale: confronta le versioni prima di registrare' using errcode = '22023';
  end if;
  f := j.files->0;
  update public.ddt_ricezione set
    ddt_file_url = f->>'path', ddt_file_name = f->>'name', ddt_file_mime = f->>'mime', ddt_file_bucket = coalesce(f->>'bucket', 'ddt-documenti'),
    ai_lettura = coalesce(ai_lettura, j.result),
    ai_confidenza = coalesce(ai_confidenza, case when j.result is null then null else least(1, greatest(0, public.num_da_json(j.result->>'confidence'))) end),
    corriere = coalesce(corriere, nullif(p_dati->>'corriere', '')),
    targa_mezzo = coalesce(targa_mezzo, nullif(p_dati->>'targa_mezzo', '')),
    autista_nome = coalesce(autista_nome, nullif(p_dati->>'autista_nome', '')),
    trasporto_a_cura_di = coalesce(trasporto_a_cura_di, case when p_dati->>'trasporto_a_cura_di' in ('fornitore', 'noi', 'terzi') then p_dati->>'trasporto_a_cura_di' end),
    porto = coalesce(porto, case when p_dati->>'porto' in ('franco', 'assegnato') then p_dati->>'porto' end),
    note = case when note like 'Registrata dalla fattura%l''originale della bolla è da allegare.' then replace(note, ': l''originale della bolla è da allegare.', '; originale allegato.') else note end
  where id = d.id;
  update public.ddt_document_jobs set ddt_id = d.id, order_id = d.order_id, destinazione = d.destinazione, warehouse_id = d.warehouse_id,
         status = 'registered', updated_at = now()
   where id = p_id;
  return d.id;
end $$;
revoke all on function public.ddt_documento_allega(uuid, uuid, jsonb) from public, anon;
grant execute on function public.ddt_documento_allega(uuid, uuid, jsonb) to authenticated, service_role;
