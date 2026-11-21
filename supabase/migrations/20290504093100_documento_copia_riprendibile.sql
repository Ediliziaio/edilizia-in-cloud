begin;

create table private.documento_copie_richieste (
  company_id uuid not null references public.companies(id) on delete cascade,
  autore_id uuid not null references auth.users(id) on delete cascade,
  richiesta_id uuid not null,
  origine_id uuid not null,
  copia_id uuid not null,
  primary key (company_id, autore_id, richiesta_id)
);
alter table private.documento_copie_richieste enable row level security;
revoke all on private.documento_copie_richieste from public, anon, authenticated;

create or replace function public.documento_duplica_bozza(
  p_company_id uuid,
  p_origine_id uuid,
  p_richiesta_id uuid,
  p_dati jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_autore uuid := auth.uid();
  v_tipo text;
  v_ricevuta private.documento_copie_richieste;
  v_copia jsonb;
begin
  if v_autore is null or public.user_can_access_company(p_company_id) is not true
     or public.utente_bloccato() then
    raise exception 'Accesso negato.' using errcode = '42501';
  end if;

  select tipo into v_tipo
  from public.documenti_fiscali
  where id = p_origine_id and company_id = p_company_id and deleted_at is null;
  if not found or public.puo_gestire_documento_fiscale(p_company_id, v_tipo) is not true then
    raise exception 'Documento di origine non disponibile.' using errcode = '42501';
  end if;
  if p_richiesta_id is null or jsonb_typeof(p_dati) is distinct from 'object' then
    raise exception 'Richiesta di copia incompleta.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'copia-documento:' || p_company_id::text || ':' || v_autore::text || ':' || p_richiesta_id::text, 0
  ));
  select * into v_ricevuta
  from private.documento_copie_richieste
  where company_id = p_company_id and autore_id = v_autore and richiesta_id = p_richiesta_id;
  if found then
    if v_ricevuta.origine_id <> p_origine_id then
      raise exception 'La richiesta di copia si riferisce a un altro documento.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.documenti_fiscali
      where id = v_ricevuta.copia_id and company_id = p_company_id and deleted_at is null
    ) then
      raise exception 'La copia di questa richiesta è stata eliminata.' using errcode = 'P0002';
    end if;
    return jsonb_build_object('id', v_ricevuta.copia_id, 'riutilizzata', true);
  end if;

  -- La riga delle richieste e la nuova bozza vengono confermate insieme.
  -- Anche una copia senza voci nasce come nuova bozza esplicita.
  v_copia := public.documento_crea(p_company_id, p_dati || jsonb_build_object(
    'tipo', v_tipo, 'stato', 'bozza', 'righe', coalesce(p_dati->'righe', '[]'::jsonb)
  ));
  insert into private.documento_copie_richieste(company_id, autore_id, richiesta_id, origine_id, copia_id)
  values (p_company_id, v_autore, p_richiesta_id, p_origine_id, (v_copia->>'id')::uuid);
  return v_copia;
end;
$$;

revoke all on function public.documento_duplica_bozza(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.documento_duplica_bozza(uuid, uuid, uuid, jsonb) to authenticated;

commit;
