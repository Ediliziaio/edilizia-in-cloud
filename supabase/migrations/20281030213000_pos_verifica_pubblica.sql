-- Verifica pubblica di un POS emesso.
--
-- Il PDF di un POS approvato porta in copertina un codice QR che apre /verifica-pos/<id emissione>. La pagina, senza
-- login, chiede questa funzione e dice se la copia che si ha in mano è la revisione in vigore o è stata superata, e con
-- l'impronta del PDF permette di controllare un file ricevuto per posta.
--
-- Espone soltanto ciò che è già stampato sul documento (impresa, cantiere, revisione, date) più l'impronta del PDF:
-- nessun nome di persona, nessun dato dei lavoratori. Serve l'id dell'emissione (un uuid casuale, non indovinabile).
-- «In vigore» = l'ultima revisione con un'emissione completata: aprire una nuova revisione in bozza non toglie valore
-- alla precedente finché la nuova non viene emessa.

create or replace function public.pos_verifica_pubblica(p_emissione uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.pos_emissioni%rowtype;
  d public.pos_documents%rowtype;
  v public.pos_emissioni%rowtype;
  contenuto jsonb;
  cantiere jsonb;
  luogo text;
  sha text;
begin
  if p_emissione is null then return jsonb_build_object('trovata', false); end if;
  select * into e from public.pos_emissioni where id = p_emissione and stato = 'completa';
  if not found then return jsonb_build_object('trovata', false); end if;

  select * into d from public.pos_documents where id = e.pos_id;
  -- L'emissione più recente completata di questo POS: è quella in vigore.
  select * into v from public.pos_emissioni
   where pos_id = e.pos_id and stato = 'completa'
   order by revisione desc, emesso_il desc nulls last, created_at desc
   limit 1;

  -- Il contenuto approvato da cui è nata quell'emissione, dall'archivio immutabile.
  select c.snapshot -> 'contenuto' into contenuto
    from public.pos_contenuti_archiviati c
   where c.id = e.snapshot_id;
  cantiere := contenuto -> 'opera' -> 'cantiere';
  luogo := nullif(trim(concat(cantiere ->> 'localita',
    case when coalesce(cantiere ->> 'provincia', '') <> '' then ' (' || (cantiere ->> 'provincia') || ')' else '' end)), '');

  sha := (select f ->> 'sha256'
            from jsonb_array_elements(case when jsonb_typeof(e.manifest -> 'file') = 'array' then e.manifest -> 'file' else '[]'::jsonb end) f
           where f ->> 'ruolo' = 'pdf'
           limit 1);

  return jsonb_build_object(
    'trovata', true,
    'impresa', nullif(contenuto -> 'impresa' ->> 'ragione_sociale', ''),
    'cantiere', nullif(concat_ws(', ', nullif(cantiere ->> 'via', ''), luogo), ''),
    'revisione', e.revisione,
    'emesso_il', e.emesso_il,
    'pdf_sha256', sha,
    'stato', case when d.status = 'archiviato' then 'archiviata' when v.id = e.id then 'in_vigore' else 'superata' end,
    'revisione_in_vigore', v.revisione,
    'in_vigore_dal', v.emesso_il
  );
end
$$;

revoke all on function public.pos_verifica_pubblica(uuid) from public, anon, authenticated;
grant execute on function public.pos_verifica_pubblica(uuid) to anon, authenticated, service_role;

insert into public.funzioni_pubbliche_di_proposito (nome, motivo, dal)
values ('pos_verifica_pubblica',
        'Pagina pubblica aperta dal QR stampato sul POS: dice se la copia è la revisione in vigore. Espone solo impresa, cantiere, revisione, date e impronta del PDF; serve l''id dell''emissione, un uuid non indovinabile.',
        current_date)
on conflict do nothing;

insert into public.rpc_pubbliche (nome_funzione, motivo)
values ('pos_verifica_pubblica', 'Verifica pubblica del QR del POS: revisione in vigore e impronta del PDF, senza dati personali.')
on conflict do nothing;

notify pgrst, 'reload schema';
