create table if not exists public.whatsapp_preventivi_bozze (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  wa_number_id uuid not null,
  mittente text not null,
  codice text generated always as (upper(left(id::text, 10))) stored,
  testo text not null check (length(testo) between 1 and 24000),
  pdf_path text,
  vocale_path text,
  testo_pdf text,
  cliente text check (length(cliente) between 2 and 200),
  iva numeric check (iva between 0 and 100),
  invia_pdf_qui boolean not null default false,
  stato text not null default 'da_completare' check (stato in ('da_completare','in_elaborazione','pronta','da_verificare','salvata')),
  revisione integer not null default 1 check (revisione > 0),
  anteprima jsonb check (anteprima is null or jsonb_typeof(anteprima) = 'object'),
  da_verificare text,
  quote_id uuid references public.quotes(id) on delete set null,
  ricevuta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pdf_path is not null or vocale_path is not null),
  check (pdf_path is null or pdf_path like company_id::text || '/%'),
  check (vocale_path is null or vocale_path like company_id::text || '/%')
);
create index if not exists whatsapp_preventivi_bozze_recenti on public.whatsapp_preventivi_bozze
  (company_id,created_by,wa_number_id,mittente,updated_at desc);
create index if not exists whatsapp_preventivi_bozze_codice on public.whatsapp_preventivi_bozze(company_id,codice);
alter table public.whatsapp_preventivi_bozze enable row level security;
revoke all on public.whatsapp_preventivi_bozze from public,anon,authenticated;
grant all on public.whatsapp_preventivi_bozze to service_role;

-- Una versione confermata si trasferisce nel registro preventivi una volta sola.
create or replace function public.whatsapp_salva_bozza_preventivo(p_id uuid,p_company uuid,p_utente uuid,
  p_revisione integer,p_anteprima jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  b public.whatsapp_preventivi_bozze;
  esito jsonb;
  preventivo uuid;
begin
  select * into b from public.whatsapp_preventivi_bozze where id=p_id and company_id=p_company and created_by=p_utente for update;
  if not found or b.revisione<>p_revisione or b.anteprima is distinct from p_anteprima then
    raise exception 'Riprendi la bozza e conferma il riepilogo più recente' using errcode='22023';
  end if;
  if not coalesce(public.has_permission_for_company(p_utente,'can_view_preventivi',p_company),false)
    or not coalesce(public.has_permission_for_company(p_utente,'can_edit_preventivi',p_company),false) then
    raise exception 'Permessi di preventivazione cambiati' using errcode='42501';
  end if;
  if b.stato='salvata' and b.quote_id is not null then return b.ricevuta; end if;
  if b.stato<>'pronta' or b.anteprima is null or b.da_verificare is not null then
    raise exception 'Verifica i dati della bozza prima di salvare' using errcode='22023';
  end if;
  esito:=public.silvio_create_quote_draft(p_company,p_utente,b.anteprima->>'client_name',
    b.anteprima->>'client_email',b.anteprima->>'client_phone',b.anteprima->>'client_address',
    b.anteprima->>'title',b.anteprima->>'description',b.anteprima->>'tipo_lavoro',b.anteprima->>'indirizzo_lavori',
    b.anteprima->'items',coalesce((b.anteprima->>'validity_days')::integer,30),
    (b.anteprima->>'default_vat_rate')::numeric,'Bozza da WhatsApp');
  if esito->>'success' is distinct from 'true' or esito->>'quote_id' is null
    or esito->>'status' is distinct from 'bozza'
    or (esito->>'items_count')::integer is distinct from jsonb_array_length(b.anteprima->'items')
    or jsonb_typeof(esito->'subtotal_eur') is distinct from 'number'
    or jsonb_typeof(esito->'vat_eur') is distinct from 'number'
    or jsonb_typeof(esito->'total_eur') is distinct from 'number' then
    raise exception 'Salvataggio del preventivo non confermato';
  end if;
  preventivo:=(esito->>'quote_id')::uuid;
  update public.quotes set ai_richiesta_id=b.id where id=preventivo and company_id=p_company;
  if not found then raise exception 'Preventivo non trovato dopo il salvataggio'; end if;
  update public.whatsapp_preventivi_bozze set stato='salvata',quote_id=preventivo,ricevuta=esito,updated_at=now()
    where id=b.id and company_id=p_company;
  return esito;
end $$;
revoke all on function public.whatsapp_salva_bozza_preventivo(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_salva_bozza_preventivo(uuid,uuid,uuid,integer,jsonb) to service_role;
