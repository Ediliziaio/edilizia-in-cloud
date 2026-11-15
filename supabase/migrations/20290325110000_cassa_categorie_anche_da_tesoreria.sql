-- Categorie e voci del cash flow: si gestiscono anche dalla Tesoreria (15/11/2026)
--
-- Richiesta: «ogni azienda può modificare le categorie e le voci, sia dal
-- Controllo di gestione sia dalle impostazioni della Tesoreria».
--
--  - `private.cassa_accesso(azienda, configura)`: configura chi non è in sola
--    lettura e ha il controllo di gestione OPPURE gestisce la tesoreria (la
--    vede e può riconciliare i movimenti: è chi classifica, e chi si accorge
--    per primo che manca una voce). Prima solo il controllo di gestione.
--  - `cassa_voce_salva`: dentro un'area si aggiunge una CATEGORIA nuova (codice
--    X01, X02…; il catalogo base usa solo numeri, quindi non si scontrano mai).
--    Prima si potevano aggiungere solo voci e sottovoci.
--
-- Il catalogo resta uno per azienda: le due pagine lo modificano entrambe.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.cassa_accesso(p_company uuid, p_configura boolean default false)
returns void language plpgsql stable security definer set search_path to '' as $$
declare
  cdg boolean := coalesce(public.has_permission_for_company(auth.uid(), 'can_view_controllo_gestione', p_company), false);
  tesoreria boolean := coalesce(public.has_permission_for_company(auth.uid(), 'can_view_tesoreria', p_company), false);
  riconcilia boolean := coalesce(public.has_permission_for_company(auth.uid(), 'can_reconcile_bank_transactions', p_company), false);
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or (tesoreria or cdg or coalesce(public.user_can_read_accountant_company(p_company), false)) is not true
     or (p_configura and (public.utente_sola_lettura(p_company) or not (cdg or (tesoreria and riconcilia)))) then
    raise exception 'Non hai il permesso di gestire le categorie di cassa' using errcode = '42501';
  end if;
end $$;
revoke all on function private.cassa_accesso(uuid, boolean) from public, anon;

create or replace function public.cassa_voce_salva(p_company uuid, p_id uuid, p_dati jsonb)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v public.cassa_voci; p public.cassa_voci; nuovo_codice text; n integer := 0; righe text[] := private.cassa_righe_rendiconto();
begin
  perform private.cassa_accesso(p_company, true);
  if p_dati ? 'voce_cassa_in' and nullif(p_dati->>'voce_cassa_in', '') is not null and (p_dati->>'voce_cassa_in') <> all (righe) then
    raise exception 'Riga del cash flow sconosciuta: %', p_dati->>'voce_cassa_in'; end if;
  if p_dati ? 'voce_cassa_out' and nullif(p_dati->>'voce_cassa_out', '') is not null and (p_dati->>'voce_cassa_out') <> all (righe) then
    raise exception 'Riga del cash flow sconosciuta: %', p_dati->>'voce_cassa_out'; end if;
  if p_dati ? 'flusso' and (p_dati->>'flusso') not in ('entrata', 'uscita', 'entrambi', 'nessuno') then
    raise exception 'Verso non valido'; end if;

  if p_id is null then
    if coalesce(btrim(p_dati->>'nome'), '') = '' then raise exception 'Scrivi il nome della voce'; end if;
    select * into p from public.cassa_voci where id = (p_dati->>'parent_id')::uuid and company_id = p_company;
    if p.id is null then raise exception 'Scegli dove mettere la nuova voce'; end if;
    -- Dentro un'area nasce una categoria (codice X01, X02…: il catalogo base
    -- usa solo numeri); dentro una categoria una voce; dentro una voce una sottovoce.
    loop
      n := n + 1;
      nuovo_codice := case when p.livello = 'area' then 'X' || lpad(n::text, 2, '0')
                           else p.codice || '.X' || lpad(n::text, 2, '0') end;
      exit when not exists (select 1 from public.cassa_voci where company_id = p_company and codice = nuovo_codice);
    end loop;
    insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, descrizione, esempio, flusso, sezione,
                                   voce_cassa_in, voce_cassa_out, richiede_commessa, attiva, ordine, origine, created_by, updated_by)
    values (p_company, nuovo_codice, p.id, case p.livello when 'area' then 'categoria' when 'categoria' then 'voce' else 'sottovoce' end,
            btrim(p_dati->>'nome'), nullif(btrim(p_dati->>'descrizione'), ''), nullif(btrim(p_dati->>'esempio'), ''),
            coalesce(p_dati->>'flusso', p.flusso), p.sezione,
            coalesce(nullif(p_dati->>'voce_cassa_in', ''), p.voce_cassa_in),
            coalesce(nullif(p_dati->>'voce_cassa_out', ''), p.voce_cassa_out),
            coalesce((p_dati->>'richiede_commessa')::boolean, false), true,
            coalesce((p_dati->>'ordine')::integer, (select coalesce(max(ordine), 0) + 1 from public.cassa_voci where parent_id = p.id)),
            'azienda', auth.uid(), auth.uid())
    returning * into v;
    return v.id;
  end if;

  select * into v from public.cassa_voci where id = p_id and company_id = p_company for update;
  if v.id is null then raise exception 'Voce non trovata'; end if;
  update public.cassa_voci set
    nome = coalesce(nullif(btrim(p_dati->>'nome'), ''), nome),
    descrizione = case when p_dati ? 'descrizione' then nullif(btrim(p_dati->>'descrizione'), '') else descrizione end,
    esempio = case when p_dati ? 'esempio' then nullif(btrim(p_dati->>'esempio'), '') else esempio end,
    flusso = coalesce(p_dati->>'flusso', flusso),
    voce_cassa_in = case when p_dati ? 'voce_cassa_in' then nullif(p_dati->>'voce_cassa_in', '') else voce_cassa_in end,
    voce_cassa_out = case when p_dati ? 'voce_cassa_out' then nullif(p_dati->>'voce_cassa_out', '') else voce_cassa_out end,
    richiede_commessa = coalesce((p_dati->>'richiede_commessa')::boolean, richiede_commessa),
    attiva = coalesce((p_dati->>'attiva')::boolean, attiva),
    archiviata_il = case
      when (p_dati->>'archiviata')::boolean is true then coalesce(archiviata_il, now())
      when (p_dati->>'archiviata')::boolean is false then null
      else archiviata_il end,
    ordine = coalesce((p_dati->>'ordine')::integer, ordine),
    updated_at = now(), updated_by = auth.uid()
  where id = v.id;
  return v.id;
end $$;
revoke all on function public.cassa_voce_salva(uuid, uuid, jsonb) from public, anon;
grant execute on function public.cassa_voce_salva(uuid, uuid, jsonb) to authenticated;
