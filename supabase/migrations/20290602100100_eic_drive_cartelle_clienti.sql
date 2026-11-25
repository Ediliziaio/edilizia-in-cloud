-- EiC Drive: «Clienti», le cartelle standard di ogni cliente.
-- Nessuna copia: per ogni commessa la funzione elenca i documenti che già
-- esistono altrove (preventivo accettato, contratti e verbali, ordini
-- d'acquisto, richieste d'offerta, DDT, fatture fornitori, subappalti, foto,
-- documenti di commessa) e dice in quale cartella standard stanno.
-- SECURITY INVOKER: ogni riga passa dalle regole della sua tabella, quindi chi
-- non vede le fatture ricevute o gli ordini d'acquisto non li vede nemmeno qui.
-- Nessuna colonna di importo: le cartelle mostrano documenti, non prezzi.
create or replace function public.drive_documenti_clienti()
returns table (
  cliente_chiave text, cliente text, order_id uuid, order_code text, cartella text,
  id text, nome text, bucket text, path text, link text, data timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  with o as (
    select o.id, o.order_code, o.quote_id,
      coalesce(o.customer_id::text, 'nome:' || lower(btrim(coalesce(nullif(o.client_company, ''), o.client_name, '')))) as chiave,
      coalesce(nullif(btrim(o.client_company), ''), nullif(btrim(o.client_name), ''), 'Cliente senza nome') as cliente
    from public.orders o
    where o.company_id = public.get_effective_company_id() and o.deleted_at is null
  ),
  d as (
    select a.order_id, 'documenti_generali' as cartella, 'order-file:' || a.id as id, a.file_name as nome,
      null::text as bucket, a.file_url as path, null::text as link, a.created_at as data
    from public.order_attachments a join o on o.id = a.order_id
    union all
    select f.order_id, 'foto_cantiere', 'site-photo:' || f.id, coalesce(nullif(f.descrizione, ''), 'Foto cantiere'),
      'foto-cantiere', f.storage_path, null, coalesce(f.taken_at, f.created_at)
    from public.foto_cantiere f join o on o.id = f.order_id
    union all
    select o.id, 'preventivi_accettati', 'quote-pdf:' || q.id, coalesce(q.quote_number, 'Preventivo') || '.pdf',
      'quote-pdfs', q.pdf_storage_path, null, coalesce(q.signed_at, q.pdf_generated_at, q.created_at)
    from public.quotes q join o on o.quote_id = q.id
    where q.pdf_storage_path is not null
    union all
    select r.order_id, 'contratti_verbali', 'verbale:' || r.id, 'Verbale di consegna v' || r.version || '.pdf',
      'order-acceptance-reports', r.pdf_path, null, coalesce(r.finalized_at, r.created_at)
    from public.order_acceptance_reports r join o on o.id = r.order_id
    where r.pdf_path is not null
    union all
    select s.order_id, 'contratti_verbali', 'firmato:' || s.id, 'Documento firmato.pdf',
      'quote-pdfs', s.signed_pdf_path, null, s.created_at
    from public.signature_requests s join o on o.id = s.order_id
    where s.signed_pdf_path is not null
    union all
    select v.order_id, 'contratti_verbali', 'variante:' || v.id, 'Variante.pdf',
      'order-variation-documents', v.pdf_path, null, v.created_at
    from public.order_variation_documents v join o on o.id = v.order_id
    where v.pdf_path is not null
    union all
    select p.order_id, 'ordini_acquisto', 'oda:' || p.id, 'Ordine ' || coalesce(p.oda_number, 'd''acquisto'),
      null, null, '/azienda/ordini-acquisto/' || p.id, coalesce(p.issue_date::timestamptz, p.created_at)
    from public.purchase_orders p join o on o.id = p.order_id
    union all
    select r.order_id, 'richieste_offerta', 'rdo:' || r.id, 'Richiesta ' || coalesce(r.rfq_number, 'd''offerta'),
      null, null, '/azienda/richieste-offerta/' || r.id, r.created_at
    from public.supplier_rfqs r join o on o.id = r.order_id
    union all
    select coalesce(t.order_id, p.order_id), 'ddt', 'ddt:' || t.id, 'DDT ' || coalesce(t.numero_ddt, '') ,
      coalesce(t.ddt_file_bucket, 'ddt-documenti'), t.ddt_file_url, null, coalesce(t.data_ricezione::timestamptz, t.created_at)
    from public.ddt_ricezione t
    left join public.purchase_orders p on p.id = t.purchase_order_id
    join o on o.id = coalesce(t.order_id, p.order_id)
    where t.ddt_file_url is not null
    union all
    select coalesce(c.order_id, p.order_id), 'fatture_fornitori', 'fattura-ricevuta:' || fr.id,
      'Fattura ' || coalesce(fr.numero_fattura, '') || coalesce(' · ' || fr.cedente_ragione_sociale, ''),
      coalesce(fr.pdf_storage_bucket, 'documenti-smart'), fr.pdf_storage_path, null, coalesce(fr.data_fattura::timestamptz, fr.created_at)
    from public.fatture_ricevute fr
    left join public.company_costs c on c.id = fr.company_cost_id
    left join public.purchase_orders p on p.id = fr.purchase_order_id
    join o on o.id = coalesce(c.order_id, p.order_id)
    where fr.pdf_storage_path is not null
    union all
    select k.order_id, 'subappalti', 'subappalto:' || k.id, 'Contratto ' || coalesce(k.numero_contratto, 'di subappalto') || '.pdf',
      'quote-pdfs', k.pdf_path, null, coalesce(k.firmato_il, k.created_at)
    from public.contratti_subappalto k join o on o.id = k.order_id
    where k.pdf_path is not null
  )
  select o.chiave, o.cliente, o.id, o.order_code, d.cartella, d.id, d.nome, d.bucket, d.path, d.link, d.data
  from d join o on o.id = d.order_id
  order by o.cliente, d.data desc nulls last
  limit 5000;
$$;
revoke all on function public.drive_documenti_clienti() from public, anon;
grant execute on function public.drive_documenti_clienti() to authenticated;

notify pgrst, 'reload schema';
