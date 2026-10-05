-- Mezzi e attrezzature (Fase C): codice, etichette QR, scansioni e azioni dal campo.
--
-- Ogni mezzo e attrezzo ha un codice corto e leggibile (ATT-0012, MZ-0003),
-- unico nell'azienda, che va sull'etichetta insieme al QR. Il QR porta a
-- /q/<codice>?c=<azienda>: dall'ufficio apre la scheda, dal campo una pagina
-- con le azioni rapide (lo prendo io, lo lascio in cantiere, lo carico sul
-- furgone, riportato in magazzino, non lo trovo; per i ponteggi e le altre
-- attrezzature a quantità: montati / rientrati).
--
-- I codici automatici vengono da un contatore per azienda e prefisso: non si
-- riusano mai, nemmeno dopo un'eliminazione (l'etichetta fisica resta in giro).
-- Si possono riservare in anticipo per stampare etichette vuote, che si
-- collegano all'attrezzo quando lo si registra.

-- ── 1. Codice e contatore ───────────────────────────────────────────────────
alter table public.mezzi add column if not exists codice text;

create table if not exists public.mezzi_codici_contatore (
  company_id uuid not null references public.companies(id) on delete cascade,
  prefisso   text not null check (prefisso in ('ATT','MZ')),
  ultimo     integer not null default 0 check (ultimo >= 0),
  primary key (company_id, prefisso)
);
-- Nessuna policy: lo toccano solo le funzioni qui sotto.
alter table public.mezzi_codici_contatore enable row level security;
revoke all on public.mezzi_codici_contatore from anon, authenticated;

-- ATT-0007; oltre 9999 cresce (ATT-12345) invece di troncare.
create or replace function public._mezzi_formatta_codice(p_prefisso text, p_n integer)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select p_prefisso || '-' || lpad(p_n::text, greatest(4, length(p_n::text)), '0');
$$;
revoke all on function public._mezzi_formatta_codice(text, integer) from public, anon;

-- Riserva p_quanti numeri consecutivi e restituisce il primo.
create or replace function public._mezzi_riserva_codici(p_company uuid, p_prefisso text, p_quanti integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_ultimo integer;
begin
  insert into public.mezzi_codici_contatore as c (company_id, prefisso, ultimo)
  values (p_company, p_prefisso, p_quanti)
  on conflict (company_id, prefisso) do update set ultimo = c.ultimo + excluded.ultimo
  returning c.ultimo into v_ultimo;
  return v_ultimo - p_quanti + 1;
end $$;
revoke all on function public._mezzi_riserva_codici(uuid, text, integer) from public, anon, authenticated;

-- Codici a chi non li ha, in ordine di inserimento, per azienda e prefisso.
-- Prima del trigger: qui i numeri li decide la migrazione.
set local lock_timeout = '3s';
with numerati as (
  select m.id,
         x.prefisso,
         coalesce(c.ultimo, 0)
           + row_number() over (partition by m.company_id, x.prefisso order by m.created_at, m.id) as n
    from public.mezzi m
    cross join lateral (select case when m.tipo = 'attrezzatura' then 'ATT' else 'MZ' end as prefisso) x
    left join public.mezzi_codici_contatore c on c.company_id = m.company_id and c.prefisso = x.prefisso
   where m.codice is null
)
update public.mezzi m
   set codice = public._mezzi_formatta_codice(n.prefisso, n.n::integer)
  from numerati n
 where n.id = m.id;

insert into public.mezzi_codici_contatore as c (company_id, prefisso, ultimo)
select m.company_id,
       substring(m.codice from '^(ATT|MZ)-'),
       max(substring(m.codice from '^(?:ATT|MZ)-(\d{1,9})$')::integer)
  from public.mezzi m
 where m.codice ~ '^(ATT|MZ)-\d{1,9}$'
 group by 1, 2
on conflict (company_id, prefisso) do update set ultimo = greatest(c.ultimo, excluded.ultimo);

create unique index if not exists uq_mezzi_codice
  on public.mezzi(company_id, upper(codice)) where codice is not null and deleted_at is null;

-- Alla registrazione: codice automatico se manca; «att 12» diventa ATT-0012;
-- un codice scritto a mano più alto del contatore lo fa avanzare (i prossimi
-- automatici non lo ripetono); il codice non si cancella (l'etichetta è già
-- attaccata); due attrezzi non hanno lo stesso codice.
create or replace function public.mezzi_codice_prepara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prefisso text := case when new.tipo = 'attrezzatura' then 'ATT' else 'MZ' end;
  v_n integer;
  v_altro text;
begin
  new.codice := nullif(upper(regexp_replace(btrim(coalesce(new.codice, '')), '\s+', '', 'g')), '');

  if new.codice is null then
    if tg_op = 'UPDATE' and old.codice is not null then
      new.codice := old.codice;
      return new;
    end if;
    new.codice := public._mezzi_formatta_codice(v_prefisso, public._mezzi_riserva_codici(new.company_id, v_prefisso, 1));
    return new;
  end if;

  if new.codice ~ '^(ATT|MZ)-?\d{1,9}$' then
    v_prefisso := substring(new.codice from '^(ATT|MZ)');
    v_n := substring(new.codice from '(\d+)$')::integer;
    new.codice := public._mezzi_formatta_codice(v_prefisso, v_n);
    insert into public.mezzi_codici_contatore as c (company_id, prefisso, ultimo)
    values (new.company_id, v_prefisso, v_n)
    on conflict (company_id, prefisso) do update set ultimo = greatest(c.ultimo, excluded.ultimo);
  end if;

  if tg_op = 'UPDATE' and new.codice is not distinct from old.codice then
    return new;
  end if;
  select m.nome into v_altro
    from public.mezzi m
   where m.company_id = new.company_id and upper(m.codice) = new.codice
     and m.deleted_at is null and m.id <> new.id
   limit 1;
  if v_altro is not null then
    raise exception using errcode = '23505', message = format('Il codice %s è già di «%s».', new.codice, v_altro);
  end if;
  return new;
end $$;
revoke all on function public.mezzi_codice_prepara() from public, anon;
drop trigger if exists trg_mezzi_codice on public.mezzi;
create trigger trg_mezzi_codice
  before insert or update of codice on public.mezzi
  for each row execute function public.mezzi_codice_prepara();

-- Etichette vuote: riserva i codici e li restituisce, da stampare.
create or replace function public.mezzi_riserva_etichette(p_company uuid, p_quanti integer, p_classe text default 'attrezzatura')
returns setof text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prefisso text := case when p_classe = 'mezzo' then 'MZ' else 'ATT' end;
  v_primo integer;
begin
  if not public.has_permission_for_company(auth.uid(), 'can_edit_mezzi', p_company) then
    raise exception using errcode = '42501', message = 'Non puoi gestire i mezzi di questa azienda.';
  end if;
  if p_quanti is null or p_quanti < 1 or p_quanti > 500 then
    raise exception using errcode = '22023', message = 'Da 1 a 500 etichette per volta.';
  end if;
  v_primo := public._mezzi_riserva_codici(p_company, v_prefisso, p_quanti);
  return query
    select public._mezzi_formatta_codice(v_prefisso, g)
      from generate_series(v_primo, v_primo + p_quanti - 1) g;
end $$;
revoke all on function public.mezzi_riserva_etichette(uuid, integer, text) from public, anon;
grant execute on function public.mezzi_riserva_etichette(uuid, integer, text) to authenticated;

-- Quanto è montato di un attrezzo: chi lo chiede dal browser vede solo la sua
-- azienda (RLS); i trigger e le funzioni dell'ufficio e del campo, che girano
-- come proprietario, vedono tutto come prima.
alter function public.mezzi_quantita_in_uso(uuid, uuid) security invoker;

-- ── 2. Scansioni ────────────────────────────────────────────────────────────
-- Ogni lettura del QR è anche la prova che l'attrezzo c'è e dov'è: da qui
-- «visto l'ultima volta» e l'inventario. Le azioni dal campo si registrano qui
-- con quello che hanno fatto.
create table if not exists public.mezzi_scansioni (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  mezzo_id      uuid not null references public.mezzi(id) on delete cascade,
  user_id       uuid default auth.uid() references public.profiles(id) on delete set null,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  order_id      uuid references public.orders(id) on delete set null,
  azione        text not null default 'vista'
                check (azione in ('vista','prendo','cantiere','carico_su','magazzino','smarrito','monta','rientra','inventario')),
  quantita      numeric(12,2),
  nota          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_mezzi_scansioni_mezzo on public.mezzi_scansioni(mezzo_id, created_at desc);
create index if not exists idx_mezzi_scansioni_company on public.mezzi_scansioni(company_id, created_at desc);

alter table public.mezzi_scansioni enable row level security;
revoke all on public.mezzi_scansioni from anon;
drop policy if exists mezzi_scansioni_lettura on public.mezzi_scansioni;
create policy mezzi_scansioni_lettura on public.mezzi_scansioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id)
         or user_id = (select auth.uid()));
drop policy if exists mezzi_scansioni_inserimento on public.mezzi_scansioni;
create policy mezzi_scansioni_inserimento on public.mezzi_scansioni for insert to authenticated
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists mezzi_scansioni_elimina on public.mezzi_scansioni;
create policy mezzi_scansioni_elimina on public.mezzi_scansioni for delete to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_scansioni;
create policy blocco_utente_bloccato on public.mezzi_scansioni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- L'azienda la decide l'attrezzo, l'autore chi è collegato.
create or replace function public.mezzi_scansioni_prepara()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select company_id into new.company_id from public.mezzi where id = new.mezzo_id;
  new.user_id := coalesce(auth.uid(), new.user_id);
  return new;
end $$;
revoke all on function public.mezzi_scansioni_prepara() from public, anon;
drop trigger if exists trg_mezzi_scansioni_prepara on public.mezzi_scansioni;
create trigger trg_mezzi_scansioni_prepara
  before insert on public.mezzi_scansioni
  for each row execute function public.mezzi_scansioni_prepara();

-- Visto l'ultima volta: una scansione o una fine giornata in cui è stato usato.
create or replace view public.mezzi_ultima_vista
with (security_invoker = true)
as
select m.id as mezzo_id,
       m.company_id,
       greatest(s.ultima, g.ultima) as ultima_vista_at
  from public.mezzi m
  left join lateral (
    select max(sc.created_at) as ultima from public.mezzi_scansioni sc where sc.mezzo_id = m.id
  ) s on true
  left join lateral (
    select (max(mg.giorno) + time '18:00') at time zone 'Europe/Rome' as ultima
      from public.mezzi_giornate mg where mg.mezzo_id = m.id and mg.usato
  ) g on true
 where m.deleted_at is null;
revoke all on public.mezzi_ultima_vista from anon;
grant select on public.mezzi_ultima_vista to authenticated, service_role;

-- ── 3. Dal codice all'attrezzo ──────────────────────────────────────────────
-- Chi è dell'azienda dal lato campo: profilo da operaio, dipendente con
-- accesso, subappaltatore.
create or replace function public._campo_appartiene_azienda(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.hr_profili h
                  where h.company_id = p_company and h.id in (select public.miei_hr_profili()))
      or exists (select 1 from public.employees e
                  where e.company_id = p_company and e.user_id = auth.uid() and coalesce(e.is_active, true))
      or exists (select 1 from public.subappaltatori s
                  where s.company_id = p_company and s.user_id = auth.uid() and coalesce(s.is_active, true));
$$;
revoke all on function public._campo_appartiene_azienda(uuid) from public, anon, authenticated;

-- La scheda che vede il campo: niente costi, dove si trova, cosa si può fare.
create or replace function public._mezzo_scheda_campo(p_mezzo uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', m.id,
    'company_id', m.company_id,
    'codice', m.codice,
    'nome', m.nome,
    'tipo', m.tipo,
    'classe', m.classe,
    'marca', m.marca,
    'modello', m.modello,
    'stato', m.stato,
    'foto_path', m.foto_path,
    'categoria', cat.nome,
    'gestione', m.gestione,
    'unita_misura', m.unita_misura,
    'quantita_totale', m.quantita_totale,
    'disponibile', case when m.gestione = 'quantita'
                        then m.quantita_totale - public.mezzi_quantita_in_uso(m.id) end,
    'veicolo', m.tipo in ('furgone', 'autocarro', 'autovettura'),
    'dove', case when m.su_mezzo_id is not null then 'mezzo'
                 when m.assegnato_order_id is not null then 'cantiere'
                 when m.assegnato_hr_profilo_id is not null then 'persona'
                 else 'magazzino' end,
    'dove_nome', case when m.su_mezzo_id is not null then sopra.nome
                      when m.assegnato_order_id is not null
                        then concat_ws(' · ', o.order_code, coalesce(nullif(o.client_company, ''), o.client_name))
                      when m.assegnato_hr_profilo_id is not null
                        then nullif(btrim(concat_ws(' ', hp.nome, hp.cognome)), '')
                 end,
    'order_id', m.assegnato_order_id,
    'con_me', public.mezzo_in_carico_a_me(m.id),
    'montaggi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'order_id', a.order_id,
               'cantiere', case when a.order_id is not null
                                then concat_ws(' · ', oa.order_code, coalesce(nullif(oa.client_company, ''), oa.client_name)) end,
               'luogo', a.luogo,
               'quantita', a.quantita,
               'dal', a.dal) order by a.dal)
        from public.mezzi_allocazioni a
        left join public.orders oa on oa.id = a.order_id
       where a.mezzo_id = m.id
         and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)), '[]'::jsonb),
    'segnalazioni_aperte', (select count(*) from public.mezzi_segnalazioni sg
                             where sg.mezzo_id = m.id and sg.stato <> 'chiusa' and sg.tipo <> 'km')
  )
  from public.mezzi m
  left join public.mezzi_categorie cat on cat.id = m.categoria_id
  left join public.mezzi sopra on sopra.id = m.su_mezzo_id
  left join public.orders o on o.id = m.assegnato_order_id
  left join public.hr_profili hp on hp.id = m.assegnato_hr_profilo_id
 where m.id = p_mezzo;
$$;
revoke all on function public._mezzo_scheda_campo(uuid) from public, anon, authenticated;

-- Legge un codice (dal QR o scritto a mano). Dall'ufficio basta l'id per
-- aprire la scheda; dal campo la scheda ridotta, i cantieri dove lavoro e i
-- mezzi che guido (per «lo lascio qui» e «lo carico sul furgone»).
-- Un codice riservato ma non ancora collegato è un'etichetta «libera».
create or replace function public.mezzo_da_codice(p_codice text, p_company uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_codice text := nullif(upper(regexp_replace(btrim(coalesce(p_codice, '')), '\s+', '', 'g')), '');
  v_mia_azienda uuid;
  v_m public.mezzi;
  v_hr uuid;
  v_company uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Accedi per leggere il codice.';
  end if;
  if v_codice is null then
    return jsonb_build_object('esito', 'sconosciuto');
  end if;
  if v_codice ~ '^(ATT|MZ)-?\d{1,9}$' then
    v_codice := public._mezzi_formatta_codice(substring(v_codice from '^(ATT|MZ)'),
                                              substring(v_codice from '(\d+)$')::integer);
  end if;
  select p.company_id into v_mia_azienda from public.profiles p where p.id = v_uid;

  select m.* into v_m
    from public.mezzi m
   where upper(m.codice) = v_codice
     and m.deleted_at is null
     and (p_company is null or m.company_id = p_company)
     and (public.has_permission_for_company(v_uid, 'can_view_mezzi', m.company_id)
          or public._campo_appartiene_azienda(m.company_id))
   order by (m.company_id = v_mia_azienda) desc nulls last
   limit 1;

  if v_m.id is null then
    v_company := coalesce(p_company, v_mia_azienda);
    if v_codice ~ '^(ATT|MZ)-\d{1,9}$' and v_company is not null
       and (public.has_permission_for_company(v_uid, 'can_view_mezzi', v_company)
            or public._campo_appartiene_azienda(v_company))
       and exists (select 1 from public.mezzi_codici_contatore c
                    where c.company_id = v_company
                      and c.prefisso = substring(v_codice from '^(ATT|MZ)')
                      and c.ultimo >= substring(v_codice from '(\d+)$')::integer) then
      return jsonb_build_object(
        'esito', 'libero',
        'codice', v_codice,
        'company_id', v_company,
        'posso_registrare', public.has_permission_for_company(v_uid, 'can_edit_mezzi', v_company));
    end if;
    return jsonb_build_object('esito', 'sconosciuto', 'codice', v_codice);
  end if;

  select h.id into v_hr from public.hr_profili h
   where h.id in (select public.miei_hr_profili()) and h.company_id = v_m.company_id
   order by h.attivo desc nulls last
   limit 1;

  -- Una lettura ogni due minuti per persona basta (ricaricare la pagina non conta).
  if not exists (select 1 from public.mezzi_scansioni s
                  where s.mezzo_id = v_m.id and s.user_id = v_uid
                    and s.created_at > now() - interval '2 minutes') then
    insert into public.mezzi_scansioni (company_id, mezzo_id, user_id, hr_profilo_id, azione)
    values (v_m.company_id, v_m.id, v_uid, v_hr, 'vista');
  end if;

  if public.has_permission_for_company(v_uid, 'can_view_mezzi', v_m.company_id) then
    return jsonb_build_object('esito', 'trovato', 'vista', 'ufficio',
                              'id', v_m.id, 'company_id', v_m.company_id, 'codice', v_m.codice);
  end if;

  return jsonb_build_object(
    'esito', 'trovato',
    'vista', 'campo',
    'id', v_m.id,
    'company_id', v_m.company_id,
    'codice', v_m.codice,
    'ho_profilo', v_hr is not null,
    'mezzo', public._mezzo_scheda_campo(v_m.id),
    'cantieri', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id,
               'nome', concat_ws(' · ', o.order_code, coalesce(nullif(o.client_company, ''), o.client_name)))
             order by o.order_code)
        from public.orders o
       where o.company_id = v_m.company_id
         and o.deleted_at is null
         and coalesce(o.status, '') not in ('completato', 'completed', 'chiuso', 'closed', 'annullato', 'cancelled', 'archiviato')
         and public.campo_lavoro_su_commessa(o.id)), '[]'::jsonb),
    'miei_veicoli', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'targa', v.targa) order by v.nome)
        from public.mezzi v
       where v.company_id = v_m.company_id
         and v.deleted_at is null and v.su_mezzo_id is null and v.id <> v_m.id
         and v.tipo in ('furgone', 'autocarro', 'autovettura')
         and v.assegnato_hr_profilo_id in (select public.miei_hr_profili())), '[]'::jsonb));
end $$;
revoke all on function public.mezzo_da_codice(text, uuid) from public, anon;
grant execute on function public.mezzo_da_codice(text, uuid) to authenticated;

-- ── 4. Azioni rapide dal campo ──────────────────────────────────────────────
-- Stessa logica di campo_mezzi_fine_giornata: in cantiere = di quel cantiere e
-- di nessuno; con me = mio e di nessun cantiere; sul furgone = sul mezzo che
-- guido e a me; in magazzino = di nessuno. Furgoni e auto non si spostano da
-- qui (seguono chi li guida). Le attrezzature a quantità si montano e si fanno
-- rientrare a pezzi. Chi ha i permessi dell'ufficio può fare tutto.
create or replace function public.campo_attrezzo_azione(
  p_mezzo_id uuid,
  p_azione text,
  p_order_id uuid default null,
  p_su_mezzo_id uuid default null,
  p_quantita numeric default null,
  p_allocazione_id uuid default null,
  p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_m public.mezzi;
  v_ufficio boolean;
  v_hr uuid;
  v_su uuid;
  v_hr_su uuid;
  v_a public.mezzi_allocazioni;
  v_order_azione uuid := p_order_id;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  select * into v_m from public.mezzi where id = p_mezzo_id and deleted_at is null for update;
  if v_uid is null or v_m.id is null then
    raise exception using errcode = '42501', message = 'Attrezzo non trovato.';
  end if;
  v_ufficio := public.has_permission_for_company(v_uid, 'can_edit_mezzi', v_m.company_id);
  if not v_ufficio and not public._campo_appartiene_azienda(v_m.company_id) then
    raise exception using errcode = '42501', message = 'Questo attrezzo non è della tua azienda.';
  end if;
  select h.id into v_hr from public.hr_profili h
   where h.id in (select public.miei_hr_profili()) and h.company_id = v_m.company_id
   order by h.attivo desc nulls last
   limit 1;

  if p_azione not in ('prendo', 'cantiere', 'carico_su', 'magazzino', 'smarrito', 'monta', 'rientra') then
    raise exception using errcode = '22023', message = 'Azione non riconosciuta.';
  end if;
  if p_azione in ('prendo', 'cantiere', 'carico_su', 'magazzino')
     and v_m.tipo in ('furgone', 'autocarro', 'autovettura') then
    raise exception using errcode = '22023', message = 'Furgoni e auto seguono chi li guida: li sposta l''ufficio.';
  end if;
  if p_azione in ('prendo', 'cantiere', 'carico_su', 'magazzino') and v_m.gestione = 'quantita' then
    raise exception using errcode = '22023',
      message = 'Questa attrezzatura si conta a quantità: segna quanto è stato montato o è rientrato.';
  end if;
  if p_azione in ('monta', 'rientra') and v_m.gestione <> 'quantita' then
    raise exception using errcode = '22023', message = 'Montaggi e rientri valgono per le attrezzature a quantità.';
  end if;

  if p_azione = 'prendo' then
    if v_hr is null then
      raise exception using errcode = '22023', message = 'Il tuo profilo non è tra il personale: chiedi all''ufficio.';
    end if;
    update public.mezzi set assegnato_hr_profilo_id = v_hr, assegnato_order_id = null, su_mezzo_id = null
     where id = v_m.id;

  elsif p_azione = 'cantiere' then
    if p_order_id is null or not exists (select 1 from public.orders o
                                          where o.id = p_order_id and o.company_id = v_m.company_id and o.deleted_at is null) then
      raise exception using errcode = '22023', message = 'Scegli il cantiere.';
    end if;
    if not v_ufficio and not public.campo_lavoro_su_commessa(p_order_id) then
      raise exception using errcode = '42501', message = 'Non lavori su questo cantiere.';
    end if;
    update public.mezzi set assegnato_order_id = p_order_id, assegnato_hr_profilo_id = null, su_mezzo_id = null
     where id = v_m.id;

  elsif p_azione = 'carico_su' then
    -- in carico a chi guida quel mezzo (dal campo sono io)
    select v.id, v.assegnato_hr_profilo_id into v_su, v_hr_su from public.mezzi v
     where v.id = p_su_mezzo_id and v.company_id = v_m.company_id and v.deleted_at is null
       and v.su_mezzo_id is null and v.id <> v_m.id
       and v.tipo in ('furgone', 'autocarro', 'autovettura', 'rimorchio')
       and (v_ufficio or (v.tipo <> 'rimorchio' and v.assegnato_hr_profilo_id in (select public.miei_hr_profili())));
    if v_su is null then
      raise exception using errcode = '22023', message = 'Scegli il furgone su cui lo carichi (tra quelli che guidi).';
    end if;
    update public.mezzi set su_mezzo_id = v_su, assegnato_order_id = null, assegnato_hr_profilo_id = v_hr_su
     where id = v_m.id;

  elsif p_azione = 'magazzino' then
    if not v_ufficio and v_hr is null and not public.mezzo_in_carico_a_me(v_m.id)
       and not (v_m.assegnato_order_id is not null and public.campo_lavoro_su_commessa(v_m.assegnato_order_id)) then
      raise exception using errcode = '42501', message = 'Non è in carico a te né su un tuo cantiere.';
    end if;
    update public.mezzi set assegnato_order_id = null, assegnato_hr_profilo_id = null, su_mezzo_id = null
     where id = v_m.id;

  elsif p_azione = 'smarrito' then
    insert into public.mezzi_segnalazioni (company_id, mezzo_id, tipo, descrizione, hr_profilo_id)
    values (v_m.company_id, v_m.id, 'smarrito',
            coalesce(v_nota, 'Non si trova dove dovrebbe essere' ||
                     coalesce(' (' || (select concat_ws(' · ', o.order_code, coalesce(nullif(o.client_company, ''), o.client_name))
                                         from public.orders o where o.id = v_m.assegnato_order_id) || ')', '') || '.'),
            v_hr);

  elsif p_azione = 'monta' then
    if p_quantita is null or p_quantita <= 0 then
      raise exception using errcode = '22023', message = 'Indica quanto è stato montato.';
    end if;
    if p_order_id is null or not exists (select 1 from public.orders o
                                          where o.id = p_order_id and o.company_id = v_m.company_id and o.deleted_at is null) then
      raise exception using errcode = '22023', message = 'Scegli il cantiere.';
    end if;
    if not v_ufficio and not public.campo_lavoro_su_commessa(p_order_id) then
      raise exception using errcode = '42501', message = 'Non lavori su questo cantiere.';
    end if;
    insert into public.mezzi_allocazioni (company_id, mezzo_id, order_id, quantita, note, created_by)
    values (v_m.company_id, v_m.id, p_order_id, round(p_quantita, 2), v_nota, v_uid);

  elsif p_azione = 'rientra' then
    select * into v_a from public.mezzi_allocazioni
     where id = p_allocazione_id and mezzo_id = v_m.id;
    if v_a.id is null then
      raise exception using errcode = '22023', message = 'Scegli da quale cantiere rientra.';
    end if;
    if not v_ufficio and not (v_a.order_id is not null and public.campo_lavoro_su_commessa(v_a.order_id)) then
      raise exception using errcode = '42501', message = 'Non lavori su quel cantiere.';
    end if;
    perform public.mezzi_rientro(v_a.id, least(coalesce(round(p_quantita, 2), v_a.quantita), v_a.quantita), null);
    v_order_azione := v_a.order_id;
  end if;

  insert into public.mezzi_scansioni (company_id, mezzo_id, user_id, hr_profilo_id, order_id, azione, quantita, nota)
  values (v_m.company_id, v_m.id, v_uid, v_hr,
          case when p_azione in ('cantiere', 'monta', 'rientra') then v_order_azione end,
          p_azione,
          case when p_azione = 'monta' then round(p_quantita, 2)
               when p_azione = 'rientra' then least(coalesce(round(p_quantita, 2), v_a.quantita), v_a.quantita) end,
          v_nota);

  return jsonb_build_object('ok', true, 'mezzo', public._mezzo_scheda_campo(v_m.id));
end $$;
revoke all on function public.campo_attrezzo_azione(uuid, text, uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.campo_attrezzo_azione(uuid, text, uuid, uuid, numeric, uuid, text) to authenticated;
