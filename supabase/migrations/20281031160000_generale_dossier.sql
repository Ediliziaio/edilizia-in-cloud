-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali · rendicontazione completa (il «dossier»)
--
-- Il dossier PDF (ed eventualmente l'Excel) lo compone il browser con i dati che chi lo
-- genera può vedere; lo manda per email la edge function generale-dossier-invia, che
-- scrive qui lo storico e salva i file nel bucket privato generale-dossier
-- (<azienda>/<generale>/<dossier>.pdf|.xlsx).
--
-- Chi rilegge lo storico: lo decide `livello`, la sezione più riservata del dossier:
--   base     → basta vedere la commessa (avanzamento, documenti, foto)
--   importi  → serve anche can_view_order_amounts
--   margini  → serve can_view_margins (piano, cassa, fonti, soci e investitori)
-- Così un dossier «per i soci» non lo riapre chi non vede i margini.
-- Dal browser si legge e basta: scrive solo la funzione (service role).
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.generale_dossier (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generale_id uuid not null references public.orders(id) on delete cascade,
  modello text not null default 'personalizzato',
  titolo text not null,
  sezioni text[] not null default '{}',
  livello text not null default 'margini',
  periodo_dal date,
  periodo_al date,
  destinatari text[] not null default '{}',
  oggetto text not null,
  messaggio text,
  stato text not null default 'in_invio',
  -- Un esito per destinatario: [{ "a": "x@y.it", "ok": true, "errore": null }]
  esiti jsonb not null default '[]'::jsonb,
  errore text,
  pdf_path text,
  xlsx_path text,
  numeri jsonb not null default '{}'::jsonb,
  inviato_da uuid,
  created_at timestamptz not null default now(),
  inviato_at timestamptz,
  constraint generale_dossier_stato check (stato in ('in_invio', 'inviato', 'parziale', 'fallito')),
  constraint generale_dossier_livello check (livello in ('base', 'importi', 'margini')),
  constraint generale_dossier_modello check (modello in ('banca', 'soci', 'completo', 'personalizzato'))
);

comment on table public.generale_dossier is
  'Dossier di rendicontazione di una commessa generale mandati per email (banca, soci, commercialista): sezioni, destinatari, esito e file (bucket generale-dossier).';

create index if not exists generale_dossier_generale_idx on public.generale_dossier (generale_id, created_at desc);
create index if not exists generale_dossier_company_idx on public.generale_dossier (company_id);

alter table public.generale_dossier enable row level security;
revoke all on public.generale_dossier from public, anon, authenticated;
grant select on public.generale_dossier to authenticated;

drop policy if exists generale_dossier_lettura on public.generale_dossier;
create policy generale_dossier_lettura on public.generale_dossier for select to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
    -- La commessa stessa deve essere visibile a chi legge (RLS di orders).
    and exists (select 1 from public.orders o where o.id = generale_id)
    and case livello
          when 'base' then true
          when 'importi' then public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
          else public.has_permission_for_company((select auth.uid()), 'can_view_margins', company_id)
        end
  );

-- ── Chi può mandare un dossier di quel livello ──────────────────────────────
-- La chiama la edge function col token dell'utente: vedere la commessa, avere i permessi
-- del livello e poter modificare la commessa (mandare fuori è un'azione, non una lettura).
create or replace function public.generale_dossier_puo_inviare(p_generale_id uuid, p_livello text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid;
  v_utente uuid := auth.uid();
begin
  if v_utente is null then
    return false;
  end if;
  select company_id into v_azienda
    from public.commesse_generali
   where order_id = p_generale_id;
  if v_azienda is null then
    return false;
  end if;
  if not public.has_permission_for_company(v_utente, 'can_view_orders', v_azienda) then
    return false;
  end if;
  if p_livello = 'importi' and not public.has_permission_for_company(v_utente, 'can_view_order_amounts', v_azienda) then
    return false;
  end if;
  if p_livello not in ('base', 'importi') and not public.has_permission_for_company(v_utente, 'can_view_margins', v_azienda) then
    return false;
  end if;
  return coalesce(public.puo_modificare_commessa(p_generale_id), false);
end;
$$;

comment on function public.generale_dossier_puo_inviare(uuid, text) is
  'true se chi chiama può mandare un dossier della commessa generale con quel livello (base, importi, margini). Usata da generale-dossier-invia.';

revoke all on function public.generale_dossier_puo_inviare(uuid, text) from public, anon;
grant execute on function public.generale_dossier_puo_inviare(uuid, text) to authenticated, service_role;

-- ── Bucket privato dei file inviati ─────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generale-dossier', 'generale-dossier', false, 15728640,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- Un file si legge se si legge la sua riga dello storico (la RLS di generale_dossier vale anche qui).
drop policy if exists generale_dossier_file_lettura on storage.objects;
create policy generale_dossier_file_lettura on storage.objects for select to authenticated
  using (bucket_id = 'generale-dossier'
         and exists (select 1 from public.generale_dossier d
                      where d.pdf_path = storage.objects.name or d.xlsx_path = storage.objects.name));
