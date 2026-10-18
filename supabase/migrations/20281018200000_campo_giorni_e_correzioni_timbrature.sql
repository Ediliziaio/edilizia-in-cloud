-- Rapportini e timbrature, scelte del titolare del 18/10/2026:
--   · quanti giorni indietro si può mandare un rapportino lo decide l'azienda (Impostazioni →
--     Rapportini e presenze); predefinito 1 = oggi e ieri, come finora;
--   · chi ha dimenticato di timbrare chiede la correzione dall'app; l'ufficio la approva o la
--     respinge, e solo allora la timbratura entra nel registro (fonte «manuale», nota «Correzione
--     approvata», collegata alla richiesta).
-- Insieme, la timbratura dall'app diventa affidabile: azienda del proprio profilo, ora vicina a
-- quella del server, fonte «app». L'ufficio continua a inserirle come prima.
-- Tabelle piccole (campo_timbrature ~900 righe), nessuna riga riscritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Giorni indietro ────────────────────────────────────────────────────────────────────────
alter table public.campo_regole_azienda
  add column if not exists giorni_indietro_rapportino smallint not null default 1;
do $$ begin
  alter table public.campo_regole_azienda add constraint campo_regole_giorni_indietro_ammessi
    check (giorni_indietro_rapportino between 0 and 7);
exception when duplicate_object then null; end $$;

create or replace function public.campo_regole_azienda_leggi(p_company_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  r public.campo_regole_azienda;
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  select * into r from public.campo_regole_azienda where company_id = p_company_id;
  return jsonb_build_object(
    'chi_compila', coalesce(r.chi_compila, 'ognuno'),
    'ore_dalle', coalesce(r.ore_dalle, 'capo'),
    'avviso_scostamento_minuti', r.avviso_scostamento_minuti,
    'giorni_indietro_rapportino', coalesce(r.giorni_indietro_rapportino, 1),
    'scelte_fatte', r.company_id is not null);
end;
$function$;

-- Un parametro in più, facoltativo: chi lo omette (versioni vecchie dell'app) lascia i giorni com'erano.
drop function if exists public.campo_regole_azienda_salva(uuid, text, text, integer);
create or replace function public.campo_regole_azienda_salva(p_company_id uuid, p_chi_compila text, p_ore_dalle text,
  p_avviso_minuti integer, p_giorni_indietro integer default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  if p_chi_compila not in ('ognuno', 'capo', 'ore_proprie') then
    raise exception using errcode = '22023', message = 'Scelta non valida: chi compila il rapportino.';
  end if;
  if p_ore_dalle not in ('capo', 'timbrature') then
    raise exception using errcode = '22023', message = 'Scelta non valida: da dove vengono le ore.';
  end if;
  if p_avviso_minuti is not null and (p_avviso_minuti < 5 or p_avviso_minuti > 480) then
    raise exception using errcode = '22023', message = 'Lo scostamento va da 5 minuti a 8 ore.';
  end if;
  if p_giorni_indietro is not null and (p_giorni_indietro < 0 or p_giorni_indietro > 7) then
    raise exception using errcode = '22023', message = 'I giorni indietro vanno da 0 a 7.';
  end if;
  insert into public.campo_regole_azienda as r (company_id, chi_compila, ore_dalle, avviso_scostamento_minuti,
    giorni_indietro_rapportino, aggiornato_il, aggiornato_da)
  values (p_company_id, p_chi_compila, p_ore_dalle, p_avviso_minuti, coalesce(p_giorni_indietro, 1), now(), auth.uid())
  on conflict (company_id) do update
     set chi_compila = excluded.chi_compila,
         ore_dalle = excluded.ore_dalle,
         avviso_scostamento_minuti = excluded.avviso_scostamento_minuti,
         giorni_indietro_rapportino = coalesce(p_giorni_indietro, r.giorni_indietro_rapportino),
         aggiornato_il = now(),
         aggiornato_da = auth.uid();
  return public.campo_regole_azienda_leggi(p_company_id);
end;
$function$;
revoke all on function public.campo_regole_azienda_salva(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.campo_regole_azienda_salva(uuid, text, text, integer, integer) to authenticated;

create or replace function public.campo_regole_per_ordine(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid; r public.campo_regole_azienda;
begin
  select company_id into v_company from public.orders where id = p_order_id and deleted_at is null;
  if auth.uid() is null or v_company is null or not (
    coalesce(public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', v_company), false)
    or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false)
    or (exists(select 1 from public.profiles p where p.id = auth.uid() and p.company_id = v_company)
        and coalesce(public.campo_lavoro_su_commessa(p_order_id), false)))
  then raise exception 'Non puoi leggere le regole di questa commessa' using errcode = '42501'; end if;
  select * into r from public.campo_regole_azienda where company_id = v_company;
  return jsonb_build_object('chi_compila', coalesce(r.chi_compila, 'ognuno'),
    'ore_dalle', coalesce(r.ore_dalle, 'capo'), 'avviso_scostamento_minuti', r.avviso_scostamento_minuti,
    'giorni_indietro_rapportino', coalesce(r.giorni_indietro_rapportino, 1));
end $$;
revoke all on function public.campo_regole_per_ordine(uuid) from public, anon;
grant execute on function public.campo_regole_per_ordine(uuid) to authenticated;

-- Il giorno più vecchio ammesso per una nuova giornata, in ora italiana.
create or replace function public.campo_primo_giorno_ammesso(p_company_id uuid)
returns date language sql stable security definer set search_path = public
as $$
  select (now() at time zone 'Europe/Rome')::date
         - coalesce((select r.giorni_indietro_rapportino from public.campo_regole_azienda r
                      where r.company_id = p_company_id), 1)
$$;
revoke all on function public.campo_primo_giorno_ammesso(uuid) from public, anon, authenticated;

-- Il controllo del giornaliero (migrazione 20281018180000) legge ora i giorni dell'azienda.
create or replace function public.campo_rapportino_verifica_flusso()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_regola text; v_ruolo jsonb;
  v_ufficio boolean; v_ditta boolean; v_cliente boolean;
begin
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id)
  then raise exception 'Commessa e azienda non corrispondono' using errcode = '42501'; end if;
  v_ufficio := coalesce(auth.role() = 'service_role', false)
    or coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', new.company_id), false);
  if v_ufficio then return new; end if;
  if v_uid is null or new.user_id <> v_uid
    or not exists (select 1 from public.profiles p where p.id = v_uid and p.company_id = new.company_id)
    or not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id)
    or not coalesce(public.campo_lavoro_su_commessa(new.order_id), false)
  then raise exception 'Rapportino fuori dal proprio cantiere o azienda' using errcode = '42501'; end if;
  if (new.approvato or new.stato = 'approvato') and (tg_op = 'INSERT'
      or new.approvato is distinct from old.approvato or new.stato is distinct from old.stato) then
    raise exception 'L’approvazione spetta all’ufficio' using errcode = '42501';
  end if;
  v_cliente := coalesce(new.lavoro_completato, false) or nullif(btrim(new.firma_cliente_url), '') is not null;
  if tg_op = 'UPDATE' then
    if (new.company_id, new.user_id, new.order_id, new.data_lavoro) is distinct from
       (old.company_id, old.user_id, old.order_id, old.data_lavoro)
       or v_cliente is distinct from (coalesce(old.lavoro_completato, false) or nullif(btrim(old.firma_cliente_url), '') is not null)
    then raise exception 'Non si cambia identità, giorno o tipo di un rapporto esistente' using errcode = '22023'; end if;
    if (new.descrizione_lavori, new.ore_lavorate, new.ore_straordinario, new.presenze, new.materiali_usati,
        new.foto_urls, new.fasi_lavorate, new.percentuale_avanzamento, new.firma_cliente_url, new.firma_cliente_nome, new.stato) is not distinct from
       (old.descrizione_lavori, old.ore_lavorate, old.ore_straordinario, old.presenze, old.materiali_usati,
        old.foto_urls, old.fasi_lavorate, old.percentuale_avanzamento, old.firma_cliente_url, old.firma_cliente_nome, old.stato)
    then return new; end if;
    if old.stato not in ('bozza', 'rifiutato') then
      raise exception 'Un rapporto già inviato si corregge solo se l’ufficio lo rimanda indietro' using errcode = '42501';
    end if;
  end if;
  v_ruolo := public.campo_mio_ruolo(new.order_id);
  v_ditta := exists (select 1 from public.user_roles ur where ur.user_id = v_uid and ur.role = 'subcontractor');
  if v_cliente then
    if coalesce((v_ruolo->>'esiste_capo')::boolean, false) and not coalesce((v_ruolo->>'capocantiere')::boolean, false)
    then raise exception 'La conferma cliente spetta al capocantiere' using errcode = '42501'; end if;
    if nullif(btrim(new.descrizione_lavori), '') is null or nullif(btrim(new.firma_cliente_url), '') is null
       or nullif(btrim(new.firma_cliente_nome), '') is null
    then raise exception 'Servono lavori, nome cliente e firma' using errcode = '22023'; end if;
    if (tg_op = 'INSERT' or (new.ore_lavorate, new.ore_straordinario, new.presenze,
        new.materiali_usati, new.fasi_lavorate, new.percentuale_avanzamento) is distinct from
        (old.ore_lavorate, old.ore_straordinario, old.presenze,
         old.materiali_usati, old.fasi_lavorate, old.percentuale_avanzamento))
       and (coalesce(new.ore_lavorate, 0) <> 0 or coalesce(new.ore_straordinario, 0) <> 0
       or coalesce(new.presenze, '[]'::jsonb) <> '[]'::jsonb or coalesce(new.materiali_usati, '[]'::jsonb) <> '[]'::jsonb
       or coalesce(new.fasi_lavorate, '[]'::jsonb) <> '[]'::jsonb or coalesce(new.percentuale_avanzamento, 0) <> 0)
    then raise exception 'Il rapporto cliente non aggiunge ore, presenze o consumi' using errcode = '22023'; end if;
    return new;
  end if;
  if (tg_op = 'INSERT' or (new.ore_lavorate, new.ore_straordinario) is distinct from
                         (old.ore_lavorate, old.ore_straordinario))
    and (coalesce(new.ore_lavorate, 0) > 0 or coalesce(new.ore_straordinario, 0) > 0)
    and exists(select 1 from public.campo_rapportini r
      where r.company_id = new.company_id and r.user_id = new.user_id and r.order_id = new.order_id
        and r.data_lavoro = new.data_lavoro and r.stato in ('inviato','approvato')
        and (coalesce(r.lavoro_completato,false) or nullif(btrim(r.firma_cliente_url),'') is not null)
        and (coalesce(r.ore_lavorate,0) > 0 or coalesce(r.ore_straordinario,0) > 0))
  then raise exception 'Ore già presenti nel rapporto cliente storico: verifica con l’ufficio, non registrarle di nuovo' using errcode = '22023'; end if;
  if new.data_lavoro > (now() at time zone 'Europe/Rome')::date
     or (new.data_lavoro < public.campo_primo_giorno_ammesso(new.company_id)
         and not (tg_op = 'UPDATE' and old.stato in ('rifiutato', 'bozza')))
  then raise exception 'Questa giornata è troppo indietro per l’app: chiedi all’ufficio' using errcode = '22023'; end if;
  select r.chi_compila into v_regola from public.campo_regole_azienda r where r.company_id = new.company_id;
  if not v_ditta and coalesce((v_ruolo->>'esiste_capo')::boolean, false) then
    if v_regola = 'capo' and not coalesce((v_ruolo->>'capocantiere')::boolean, false)
       and not coalesce((v_ruolo->>'caposquadra')::boolean, false)
       and not (tg_op = 'UPDATE' and old.stato in ('rifiutato', 'bozza'))
    then raise exception 'Il giornaliero lo invia il responsabile' using errcode = '42501'; end if;
    if v_regola = 'ore_proprie' and coalesce(new.presenze, '[]'::jsonb) <> '[]'::jsonb
    then raise exception 'Nel flusso misto ogni persona conferma solo le proprie ore' using errcode = '22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.campo_rapportino_verifica_flusso() from public, anon, authenticated;

-- ── Timbrature dall'app: azienda propria, ora vicina al server ──────────────────────────────
-- L'ufficio (chi ha «Ordini e Commesse» o il ruolo d'ufficio) inserisce come prima.
-- campo_e_ufficio risponde solo per l'utente collegato: serve alle policy qui sotto.
revoke all on function public.campo_e_ufficio(uuid) from public, anon;
grant execute on function public.campo_e_ufficio(uuid) to authenticated;
drop policy if exists ct_insert on public.campo_timbrature;
create policy ct_insert on public.campo_timbrature for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and company_id = (select public.get_my_company_id())
    and (
      (select public.campo_e_ufficio(company_id))
      or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false)
      or (coalesce(fonte, 'app') in ('app', 'kiosk')
          and timestamp_evento <= now() + interval '5 minutes'
          and timestamp_evento >= now() - interval '48 hours')
    ));

-- ── Richieste di correzione ─────────────────────────────────────────────────────────────────
create table if not exists public.campo_timbrature_correzioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  tipo text not null check (tipo in ('entrata', 'uscita')),
  ora_richiesta timestamptz not null,
  motivo text not null check (length(btrim(motivo)) between 3 and 500),
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'approvata', 'respinta')),
  decisa_da uuid references auth.users(id) on delete set null,
  decisa_il timestamptz,
  motivo_risposta text,
  timbratura_id uuid references public.campo_timbrature(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campo_timbrature_correzioni_company_stato
  on public.campo_timbrature_correzioni (company_id, stato, created_at desc);
create index if not exists campo_timbrature_correzioni_order
  on public.campo_timbrature_correzioni (order_id) where order_id is not null;
create unique index if not exists campo_timbrature_correzioni_una_in_attesa
  on public.campo_timbrature_correzioni (user_id, tipo, ((ora_richiesta at time zone 'Europe/Rome')::date))
  where stato = 'in_attesa';

alter table public.campo_timbrature_correzioni enable row level security;
revoke all on public.campo_timbrature_correzioni from anon;
grant select on public.campo_timbrature_correzioni to authenticated;
drop policy if exists blocco_utente_bloccato on public.campo_timbrature_correzioni;
create policy blocco_utente_bloccato on public.campo_timbrature_correzioni as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists correzioni_lettura on public.campo_timbrature_correzioni;
create policy correzioni_lettura on public.campo_timbrature_correzioni for select to authenticated
  using (user_id = (select auth.uid())
         or (company_id = (select public.get_my_company_id())
             and ((select public.campo_e_ufficio(company_id))
                  or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false))));
-- Scritture solo dalle due funzioni qui sotto.

-- Chi riceve gli avvisi del cantiere: il responsabile della commessa e i titolari dell'azienda.
create or replace function public.campo_destinatari_ufficio(p_company_id uuid, p_order_id uuid)
returns setof uuid language sql stable security definer set search_path = public
as $$
  select o.assigned_to from public.orders o
   where o.id = p_order_id and o.company_id = p_company_id and o.assigned_to is not null
  union
  select p.id from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where p.company_id = p_company_id and ur.role = 'company_admin' and not coalesce(p.is_blocked, false)
$$;
revoke all on function public.campo_destinatari_ufficio(uuid, uuid) from public, anon, authenticated;

create or replace function public.campo_timbratura_correzione_chiedi(p_order_id uuid, p_tipo text, p_ora timestamptz, p_motivo text)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_company uuid; v_id uuid; v_nome text; v_dest uuid; v_codice text;
begin
  if v_uid is null then raise exception 'Sessione richiesta' using errcode = '42501'; end if;
  select p.company_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into v_company, v_nome from public.profiles p where p.id = v_uid;
  if v_company is null then raise exception 'Profilo senza azienda' using errcode = '42501'; end if;
  if p_tipo not in ('entrata', 'uscita') then raise exception 'Scegli entrata o uscita' using errcode = '22023'; end if;
  if nullif(btrim(p_motivo), '') is null or length(btrim(p_motivo)) < 3 then
    raise exception 'Scrivi in due parole cosa è successo' using errcode = '22023'; end if;
  if p_ora is null or p_ora > now() then raise exception 'L’ora non può essere nel futuro' using errcode = '22023'; end if;
  if (p_ora at time zone 'Europe/Rome')::date < public.campo_primo_giorno_ammesso(v_company) then
    raise exception 'Questa giornata è troppo indietro per l’app: chiedi all’ufficio' using errcode = '22023'; end if;
  if p_order_id is not null then
    select o.order_code into v_codice from public.orders o where o.id = p_order_id and o.company_id = v_company;
    if not found or not (coalesce(public.campo_lavoro_su_commessa(p_order_id), false) or public.campo_e_ufficio(v_company)) then
      raise exception 'Questo cantiere non è tra i tuoi' using errcode = '42501'; end if;
  end if;
  begin
    insert into public.campo_timbrature_correzioni (company_id, user_id, order_id, tipo, ora_richiesta, motivo)
    values (v_company, v_uid, p_order_id, p_tipo, p_ora, btrim(p_motivo)) returning id into v_id;
  exception when unique_violation then
    raise exception 'Per quel giorno hai già chiesto questa correzione: aspetta la risposta dell’ufficio' using errcode = '23505';
  end;
  for v_dest in select * from public.campo_destinatari_ufficio(v_company, p_order_id) loop
    if v_dest <> v_uid then
      perform public.campo_notifica(v_company, v_dest, 'campo_correzione_timbratura',
        'Correzione timbratura da approvare',
        coalesce(nullif(v_nome, ''), 'Un operaio') || ' chiede ' || case p_tipo when 'entrata' then 'l’entrata' else 'l’uscita' end
          || ' del ' || to_char(p_ora at time zone 'Europe/Rome', 'DD/MM HH24:MI')
          || coalesce(' · ' || v_codice, '') || ': ' || left(btrim(p_motivo), 120),
        'campo_timbrature_correzioni', v_id,
        case when p_order_id is not null then '/azienda/ordini/' || p_order_id || '#section-rapportini' end);
    end if;
  end loop;
  return v_id;
end $$;
revoke all on function public.campo_timbratura_correzione_chiedi(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.campo_timbratura_correzione_chiedi(uuid, text, timestamptz, text) to authenticated;

create or replace function public.campo_timbratura_correzione_decidi(p_id uuid, p_approva boolean, p_risposta text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); c public.campo_timbrature_correzioni; v_timbratura uuid;
begin
  select * into c from public.campo_timbrature_correzioni where id = p_id for update;
  if not found then raise exception 'Richiesta non trovata' using errcode = 'P0002'; end if;
  if v_uid is null or not coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', c.company_id), false) then
    raise exception 'Le correzioni le approva chi ha il permesso «Ordini e Commesse»' using errcode = '42501'; end if;
  if c.stato <> 'in_attesa' then raise exception 'Questa richiesta ha già una risposta' using errcode = '22023'; end if;
  if not p_approva and nullif(btrim(p_risposta), '') is null then
    raise exception 'Scrivi perché la respingi: lo legge l’operaio' using errcode = '22023'; end if;
  if p_approva then
    insert into public.campo_timbrature (company_id, user_id, order_id, tipo, timestamp_evento, fonte, note)
    values (c.company_id, c.user_id, c.order_id, c.tipo, c.ora_richiesta, 'manuale',
            'Correzione approvata: ' || left(c.motivo, 300))
    returning id into v_timbratura;
  end if;
  update public.campo_timbrature_correzioni
     set stato = case when p_approva then 'approvata' else 'respinta' end,
         decisa_da = v_uid, decisa_il = now(), motivo_risposta = nullif(btrim(p_risposta), ''),
         timbratura_id = v_timbratura
   where id = p_id;
  perform public.campo_notifica(c.company_id, c.user_id, 'campo_correzione_timbratura_esito',
    case when p_approva then 'Correzione timbratura approvata' else 'Correzione timbratura respinta' end,
    case c.tipo when 'entrata' then 'Entrata' else 'Uscita' end || ' del '
      || to_char(c.ora_richiesta at time zone 'Europe/Rome', 'DD/MM HH24:MI')
      || coalesce(': ' || nullif(btrim(p_risposta), ''), ''),
    'campo_timbrature_correzioni', c.id, '/campo/timbratura');
  return jsonb_build_object('id', c.id, 'stato', case when p_approva then 'approvata' else 'respinta' end,
    'timbratura_id', v_timbratura);
end $$;
revoke all on function public.campo_timbratura_correzione_decidi(uuid, boolean, text) from public, anon;
grant execute on function public.campo_timbratura_correzione_decidi(uuid, boolean, text) to authenticated;
