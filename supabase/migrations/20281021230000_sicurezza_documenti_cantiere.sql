-- Sicurezza cantiere: l'archivio dei documenti per commessa e i permessi giusti.
--
-- 1. `sicurezza_documenti`: ogni documento di sicurezza di un cantiere (PSC, POS
--    di altre imprese, notifica preliminare, PiMUS, fascicolo dell'opera, verbali
--    del coordinatore, DURC, patente a crediti…), di qualunque formato, con data e
--    scadenza. Legato alla commessa (o a tutta l'azienda) e, se serve, a un
--    subappaltatore. Da qui nascono la lista di controllo della commessa e lo
--    scadenzario.
-- 2. Verbali, scadenze e DUVRI erano leggibili da chiunque nell'azienda: ora
--    servono il permesso «Sicurezza cantiere», come per il POS. (I subappaltatori
--    restano com'erano: li leggono anche l'app dei subappaltatori, i contratti
--    delle ditte e le ritenute a garanzia.)
-- 3. Il bucket `sicurezza-documenti` confrontava la cartella con l'azienda «di
--    casa» dell'utente: chi lavora su più aziende non riusciva a caricare. Ora
--    vale l'azienda della cartella, col permesso su quell'azienda.

-- ── 1. Archivio ────────────────────────────────────────────────────────────
create table if not exists public.sicurezza_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  subappaltatore_id uuid references public.subappaltatori_sicurezza(id) on delete set null,
  tipo text not null check (tipo in (
    'psc', 'pss', 'pos_impresa', 'notifica_preliminare', 'fascicolo_opera', 'pimus',
    'verbale_coordinamento', 'nomina_coordinatori', 'durc', 'idoneita_tecnica', 'dvr',
    'patente_crediti', 'piano_emergenza', 'schede_sicurezza', 'valutazione_rumore',
    'libretti_macchine', 'verifiche_attrezzature', 'formazione', 'consegna_dpi', 'altro')),
  titolo text not null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  data_documento date,
  data_scadenza date,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_sicurezza_documenti_commessa on public.sicurezza_documenti (company_id, order_id);
create index if not exists idx_sicurezza_documenti_scadenza on public.sicurezza_documenti (company_id, data_scadenza) where data_scadenza is not null;

alter table public.sicurezza_documenti enable row level security;
drop policy if exists sicurezza_documenti_lettura on public.sicurezza_documenti;
create policy sicurezza_documenti_lettura on public.sicurezza_documenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));
drop policy if exists sicurezza_documenti_scrittura on public.sicurezza_documenti;
create policy sicurezza_documenti_scrittura on public.sicurezza_documenti for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
         and not public.utente_sola_lettura(company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
         and not public.utente_sola_lettura(company_id));
drop policy if exists blocco_utente_bloccato on public.sicurezza_documenti;
create policy blocco_utente_bloccato on public.sicurezza_documenti as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
revoke all on public.sicurezza_documenti from anon;

-- ── 2. Verbali, scadenze, DUVRI col permesso sicurezza ─────────────────────
drop policy if exists verbali_company_access on public.verbali_sicurezza;
create policy verbali_company_access on public.verbali_sicurezza for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
              and not public.utente_sola_lettura(company_id));

drop policy if exists adempimenti_company_access on public.adempimenti_sicurezza;
create policy adempimenti_company_access on public.adempimenti_sicurezza for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
              and not public.utente_sola_lettura(company_id));

drop policy if exists company_access_duvri on public.duvri_documents;
create policy company_access_duvri on public.duvri_documents for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
              and not public.utente_sola_lettura(company_id));

-- ── 3. Bucket: l'azienda è quella della cartella ───────────────────────────
-- Il cast a uuid sta dentro un CASE: in Postgres l'AND non ha un ordine garantito,
-- e un oggetto di un altro bucket con una cartella qualunque farebbe fallire la lettura.
create or replace function public.sicurezza_cartella_permessa(p_bucket text, p_nome text, p_scrive boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_bucket = 'sicurezza-documenti'
     and (storage.foldername(p_nome))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.has_permission_for_company(auth.uid(), 'can_view_sicurezza_cantiere', ((storage.foldername(p_nome))[1])::uuid)
         and (not p_scrive or not public.utente_sola_lettura(((storage.foldername(p_nome))[1])::uuid))
    else false
  end;
$$;
revoke all on function public.sicurezza_cartella_permessa(text, text, boolean) from public, anon;
grant execute on function public.sicurezza_cartella_permessa(text, text, boolean) to authenticated;

drop policy if exists sicurezza_documenti_lettura on storage.objects;
create policy sicurezza_documenti_lettura on storage.objects for select to authenticated
  using (bucket_id = 'sicurezza-documenti' and public.sicurezza_cartella_permessa(bucket_id, name, false));
drop policy if exists sicurezza_documenti_invio on storage.objects;
create policy sicurezza_documenti_invio on storage.objects for insert to authenticated
  with check (bucket_id = 'sicurezza-documenti' and public.sicurezza_cartella_permessa(bucket_id, name, true));
drop policy if exists sicurezza_documenti_elimina on storage.objects;
create policy sicurezza_documenti_elimina on storage.objects for delete to authenticated
  using (bucket_id = 'sicurezza-documenti' and public.sicurezza_cartella_permessa(bucket_id, name, true));

-- Un PSC o un fascicolo scansionato supera facilmente i 20 MB: come gli allegati della commessa, 50 MB.
update storage.buckets set file_size_limit = 52428800 where id = 'sicurezza-documenti';
