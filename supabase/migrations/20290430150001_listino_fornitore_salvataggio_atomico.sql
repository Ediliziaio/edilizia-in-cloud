-- Un salvataggio parte dalla revisione letta insieme alle righe.
alter table public.listini_fornitore
  add column if not exists revisione_voci bigint not null default 0;

create or replace function private.listino_fornitore_avanza_revisione()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.listini_fornitore l set revisione_voci = l.revisione_voci + 1
     where (l.id, l.company_id) in (select r.listino_id, r.company_id from nuove r);
  elsif tg_op = 'DELETE' then
    update public.listini_fornitore l set revisione_voci = l.revisione_voci + 1
     where (l.id, l.company_id) in (select r.listino_id, r.company_id from precedenti r);
  else
    update public.listini_fornitore l set revisione_voci = l.revisione_voci + 1
     where (l.id, l.company_id) in (
       select r.listino_id, r.company_id from nuove r
       union select r.listino_id, r.company_id from precedenti r
     );
  end if;
  return null;
end $$;

revoke all on function private.listino_fornitore_avanza_revisione() from public, anon, authenticated;
drop trigger if exists listino_fornitore_revisione_insert on public.listino_fornitore_voci;
create trigger listino_fornitore_revisione_insert
  after insert on public.listino_fornitore_voci referencing new table as nuove
  for each statement execute function private.listino_fornitore_avanza_revisione();
drop trigger if exists listino_fornitore_revisione_update on public.listino_fornitore_voci;
create trigger listino_fornitore_revisione_update
  after update on public.listino_fornitore_voci referencing new table as nuove old table as precedenti
  for each statement execute function private.listino_fornitore_avanza_revisione();
drop trigger if exists listino_fornitore_revisione_delete on public.listino_fornitore_voci;
create trigger listino_fornitore_revisione_delete
  after delete on public.listino_fornitore_voci referencing old table as precedenti
  for each statement execute function private.listino_fornitore_avanza_revisione();

create or replace function public.leggi_voci_listino_fornitore(p_listino uuid, p_fornitore uuid, p_azienda uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('revisione', l.revisione_voci, 'voci', coalesce(
    (select jsonb_agg(jsonb_build_object(
      'id', v.id, 'codice', v.codice, 'descrizione', v.descrizione, 'unita', v.unita,
      'prezzo', v.prezzo, 'sconto_pct', v.sconto_pct, 'immagine_url', v.immagine_url
    ) order by v.sort_order, v.id)
    from public.listino_fornitore_voci v where v.listino_id = l.id and v.company_id = l.company_id),
    '[]'::jsonb))
  from public.listini_fornitore l
  where l.id = p_listino and l.supplier_id = p_fornitore and l.company_id = p_azienda and l.attivo;
$$;

create or replace function public.salva_voci_listino_fornitore(
  p_azienda uuid, p_fornitore uuid, p_listino uuid, p_revisione bigint, p_voci jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  testata public.listini_fornitore;
  numero integer;
  scritte integer;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(p_azienda)
     or p_azienda is distinct from public.get_my_company_id()
     or not (p_azienda = any(public.aziende_con_uno_dei_permessi(array[
       'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing'
     ])) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Non hai il permesso di modificare questo listino.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_fornitore and company_id = p_azienda) then
    raise exception 'Fornitore non disponibile per questa azienda.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_voci) is distinct from 'array' then
    raise exception 'Elenco voci non valido.' using errcode = '22023';
  end if;
  numero := jsonb_array_length(p_voci);
  if (select count(distinct v.id) from jsonb_to_recordset(p_voci) as v(id uuid)) <> numero
     or exists (select 1 from jsonb_to_recordset(p_voci) as v(descrizione text, prezzo numeric, sconto_pct numeric)
       where nullif(btrim(v.descrizione), '') is null or v.prezzo is null or v.sconto_pct is null
          or v.prezzo::text in ('NaN','Infinity','-Infinity') or v.sconto_pct::text in ('NaN','Infinity','-Infinity')
          or v.prezzo < 0 or v.sconto_pct not between 0 and 100) then
    raise exception 'Verifica descrizioni, prezzi e sconti del listino.' using errcode = '22023';
  end if;

  if p_listino is null then
    -- Serializza anche la creazione, quando la testata ancora non esiste.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fornitore::text, 6001));
    if exists (select 1 from public.listini_fornitore l
        where l.company_id = p_azienda and l.supplier_id = p_fornitore and l.attivo) then
      raise exception 'È stato creato un listino da un’altra sessione. Ricarica per vedere la versione salvata.' using errcode = 'PT409';
    end if;
    insert into public.listini_fornitore(company_id, supplier_id)
    values (p_azienda, p_fornitore) returning * into testata;
  else
    select * into testata from public.listini_fornitore
     where id = p_listino and company_id = p_azienda and supplier_id = p_fornitore and attivo
     for update;
    if not found or testata.revisione_voci is distinct from p_revisione then
      raise exception 'Il listino è cambiato. Ricarica per vedere la versione salvata.' using errcode = 'PT409';
    end if;
  end if;

  insert into public.listino_fornitore_voci as esistente
    (id, company_id, listino_id, codice, descrizione, unita, prezzo, sconto_pct, immagine_url, sort_order)
  select v.id, p_azienda, testata.id, nullif(btrim(v.codice), ''), btrim(v.descrizione),
         nullif(btrim(v.unita), ''), v.prezzo, v.sconto_pct, v.immagine_url, v.sort_order
  from jsonb_to_recordset(p_voci) v(
    id uuid, codice text, descrizione text, unita text, prezzo numeric, sconto_pct numeric, immagine_url text, sort_order integer
  )
  on conflict (id) do update set codice = excluded.codice, descrizione = excluded.descrizione,
    unita = excluded.unita, prezzo = excluded.prezzo, sconto_pct = excluded.sconto_pct,
    immagine_url = excluded.immagine_url, sort_order = excluded.sort_order
  where esistente.listino_id = excluded.listino_id and esistente.company_id = excluded.company_id;
  get diagnostics scritte = row_count;
  if scritte <> numero then
    raise exception 'Una voce appartiene a un altro listino.' using errcode = '22023';
  end if;

  delete from public.listino_fornitore_voci v
  where v.company_id = p_azienda and v.listino_id = testata.id
    and not exists (select 1 from jsonb_to_recordset(p_voci) as n(id uuid) where n.id = v.id);
  select revisione_voci into testata.revisione_voci from public.listini_fornitore where id = testata.id;
  return jsonb_build_object('id', testata.id, 'revisione', testata.revisione_voci, 'totale', numero);
end $$;

revoke all on function public.leggi_voci_listino_fornitore(uuid, uuid, uuid),
  public.salva_voci_listino_fornitore(uuid, uuid, uuid, bigint, jsonb) from public, anon;
grant execute on function public.leggi_voci_listino_fornitore(uuid, uuid, uuid),
  public.salva_voci_listino_fornitore(uuid, uuid, uuid, bigint, jsonb) to authenticated;
notify pgrst, 'reload schema';
