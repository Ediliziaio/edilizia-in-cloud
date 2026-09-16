-- Spazio di archiviazione contato sui file veri, e documenti di commessa che
-- finiscono sempre in una cartella.
--
-- 1. company_storage_mb sommava le colonne «dimensione» di dieci tabelle e
--    NON contava order_attachments (i documenti delle commesse, la voce più
--    grossa): Ser Style risultava 0 MB con 154 file / 150 MB. Ora si somma
--    storage.objects, attribuendo ogni file all'azienda dal percorso:
--    <azienda>/…, orders/<commessa>/…, <commessa>/… (upload di Silvio).
--    I backup settimanali (company-exports) sono della piattaforma, non
--    dell'azienda, e non si contano.
-- 2. spazio_archiviazione(): quanto usa l'azienda, di quanto dispone, per
--    tipo di file e quali commesse pesano di più. Per la card in Abbonamento
--    e in Cartelle documenti.
-- 3. Un documento inserito senza cartella (Silvio, DDT dal magazzino, altri
--    punti futuri) prende la cartella proposta dal nome, altrimenti «Varie».

create or replace function public.oggetti_storage_azienda(p_company_id uuid)
returns table (bucket_id text, nome text, byte bigint, order_id uuid, creato_il timestamptz)
language sql
stable
security definer
set search_path to 'public', 'storage', 'pg_temp'
as $$
  with commesse as (
    select id, id::text as id_testo from public.orders where company_id = p_company_id
  )
  select o.bucket_id,
         o.name,
         coalesce((o.metadata->>'size')::bigint, 0),
         coalesce(c1.id, c2.id),
         o.created_at
    from storage.objects o
    left join commesse c1 on split_part(o.name, '/', 1) = 'orders' and c1.id_testo = split_part(o.name, '/', 2)
    left join commesse c2 on c2.id_testo = split_part(o.name, '/', 1)
   where o.bucket_id <> 'company-exports'
     and (
       split_part(o.name, '/', 1) = p_company_id::text
       or c1.id is not null
       or c2.id is not null
     );
$$;
revoke all on function public.oggetti_storage_azienda(uuid) from public, anon, authenticated;

create or replace function public.company_storage_mb(p_company_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select ceil(coalesce(sum(byte), 0) / 1048576.0)::integer
    from public.oggetti_storage_azienda(p_company_id);
$$;
revoke all on function public.company_storage_mb(uuid) from public, anon;
grant execute on function public.company_storage_mb(uuid) to authenticated, service_role;

create or replace function public.categoria_storage(p_bucket text)
returns text
language sql
immutable
set search_path to 'pg_temp'
as $$
  select case
    when p_bucket in ('order-attachments', 'campo-rapportini', 'campo-audio', 'computi', 'documenti-smart', 'customer-documents') then 'Documenti commesse e clienti'
    when p_bucket in ('email-attachments', 'marketing-attachments', 'openwa-media', 'silvio-uploads') then 'Email e messaggi'
    when p_bucket like '%-results' or p_bucket like '%-originals' or p_bucket like 'render-%' then 'Render e immagini AI'
    when p_bucket in ('article-images', 'article-pdfs', 'fv-progetti', 'quote-materials', 'quote-template-assets', 'sr-progetti', 'finanziamenti-tabelle', 'quote-pdfs') then 'Listino, preventivi e modelli'
    when p_bucket in ('subappaltatori-documenti', 'hr-documenti') then 'Fornitori e personale'
    when p_bucket in ('fatture-xml') then 'Fatture'
    else 'Altro'
  end;
$$;

create or replace function public.spazio_archiviazione(p_company_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid := coalesce(p_company_id, public.get_effective_company_id());
  v_limite jsonb;
  v_ris jsonb;
begin
  if v_company is null or not public.user_can_access_company(v_company) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  v_limite := public.check_plan_limit(v_company, 'storage_mb', 0);

  with o as (
    select * from public.oggetti_storage_azienda(v_company)
  ),
  voci as (
    select public.categoria_storage(bucket_id) as categoria, sum(byte) as byte, count(*) as file
      from o group by 1
  ),
  commesse as (
    select o.order_id, sum(o.byte) as byte, count(*) as file
      from o where o.order_id is not null group by 1
      order by 2 desc limit 5
  )
  select jsonb_build_object(
    'byte_usati', coalesce((select sum(byte) from o), 0),
    'file', (select count(*) from o),
    'limite_mb', v_limite->'limit',
    'piano', v_limite->'plan_name',
    'voci', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'byte', byte, 'file', file) order by byte desc) from voci), '[]'::jsonb),
    'commesse', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', c.order_id, 'codice', ord.order_code, 'titolo', left(ord.description, 80),
               'byte', c.byte, 'file', c.file) order by c.byte desc)
        from commesse c join public.orders ord on ord.id = c.order_id
    ), '[]'::jsonb)
  ) into v_ris;

  return v_ris;
end;
$$;
revoke all on function public.spazio_archiviazione(uuid) from public, anon;
grant execute on function public.spazio_archiviazione(uuid) to authenticated;

-- ── Cartella proposta lato database ──────────────────────────────────────────
create or replace function public.cartella_documento_proposta(p_company_id uuid, p_nome text)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nome text := ' ' || lower(translate(coalesce(p_nome, ''), 'àáèéìíòóùúÀÁÈÉÌÍÒÓÙÚ_-.+', 'aaeeiioouuAAEEIIOOUU    ')) || ' ';
  v_ext text := lower(substring(coalesce(p_nome, '') from '\.([A-Za-z0-9]+)$'));
  -- [parole nel nome del file, parti del nome cartella in ordine di preferenza]
  v_regole text[][] := array[
    array['\m(gse|enel|tica|e distribuzione|connessione)\M', 'enel|gse'],
    array['\m(dico|di co|dichiarazione di conformita)\M', 'dico'],
    array['\m(visur\w*|catast\w*|mappal\w*)', 'catast|visur'],
    array['\m(planimetri\w*|prospett\w*|progett\w*|pianta|layout)', 'architetton|progett'],
    array['\m(cila|scia|permesso di costruire|pratica edilizia)\M', 'pratica edilizia|pratich'],
    array['\m(asseverazion\w*)', 'asseverazion'],
    array['\m(fattur\w*|bonific\w*|ricevut\w*|pagament\w*|acconto|f24)', 'fattur|pagament'],
    array['\m(preventiv\w*|offert\w*)', 'preventiv'],
    array['\m(contratt\w*|mandato)', 'contratt'],
    array['\m(carta identita|patente|passaporto|codice fiscale|tessera sanitaria)', 'doc cliente|documenti cliente|contratt'],
    array['\m(bollett\w*|isee|reddit\w*)', 'bollett|reddit|doc cliente|documenti cliente'],
    array['\m(scheda tecnica|schede tecniche|datasheet|manuale|certificat\w*)', 'schede tecniche|tecnic'],
    array['\m(sopralluog\w*)', 'sopralluog'],
    array['\m(posizionament\w*)', 'posizionament'],
    array['\m(studio tecnico|relazione tecnica)', 'studio tecnico']
  ];
  v_i int;
  v_parte text;
  v_id uuid;
begin
  for v_i in 1 .. array_length(v_regole, 1) loop
    if v_nome ~ v_regole[v_i][1] then
      foreach v_parte in array string_to_array(v_regole[v_i][2], '|') loop
        select f.id into v_id
          from public.order_document_folders f
         where f.company_id = p_company_id and f.archiviata_at is null
           and regexp_replace(lower(translate(f.nome, 'àáèéìíòóùú.+-_', 'aaeeiioouu    ')), '\s+', ' ', 'g') like '%' || v_parte || '%'
         order by f.posizione limit 1;
        if v_id is not null then return v_id; end if;
      end loop;
    end if;
  end loop;

  foreach v_parte in array (case
      when v_ext in ('jpg','jpeg','png','heic','heif','webp','gif','tif','tiff','bmp','mp4','mov') then array['foto']
      when v_ext in ('eml','msg') then array['mail', 'comunicazion']
      when v_ext in ('dwg','dxf') then array['architetton', 'progett', 'tecnic']
      else array[]::text[] end || array['varie'])
  loop
    select f.id into v_id
      from public.order_document_folders f
     where f.company_id = p_company_id and f.archiviata_at is null
       and lower(f.nome) like '%' || v_parte || '%'
     -- «Varie documenti cliente» prima di «Foto installazione + Dico Varie».
     order by (lower(f.nome) like v_parte || '%') desc, f.posizione limit 1;
    if v_id is not null then return v_id; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.cartella_documento_proposta(uuid, text) from public, anon, authenticated;

create or replace function public.trg_fn_documento_commessa_cartella()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_company uuid;
begin
  if new.folder_id is null then
    select company_id into v_company from public.orders where id = new.order_id;
    if v_company is not null then
      new.folder_id := public.cartella_documento_proposta(v_company, new.file_name);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.trg_fn_documento_commessa_cartella() from public, anon;

-- Prima del controllo di coerenza (i trigger BEFORE scattano in ordine alfabetico).
drop trigger if exists trg_documento_commessa_cartella on public.order_attachments;
create trigger trg_documento_commessa_cartella
  before insert on public.order_attachments
  for each row execute function public.trg_fn_documento_commessa_cartella();
