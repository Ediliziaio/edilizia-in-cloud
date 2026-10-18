-- Rapportino (operaio, interno) e collaudo (col cliente, con la sua firma): regole imposte dal DATABASE,
-- oltre che dallo schermo dell'app (18/10/2026):
--   · l'approvazione del rapportino spetta all'ufficio;
--   · nello stesso giorno convivono il giornaliero e il collaudo (indice per tipo di rapporto, protocollo 2);
--   · il collaudo col cliente lo fa il capocantiere, e il testo firmato resta quello firmato;
--   · chi arriva al cantiere da squadra o contratto riceve le regole dell'azienda;
--   · un rapporto inviato si corregge dopo che l'ufficio lo rimanda indietro.
-- Bozza nata in migrations-pending (collaudata su PGlite, 407 casi).
-- Tabella piccola (4.220 righe, 11 MB): il cambio di numeric è rapido. Timeout brevi: meglio fallire che bloccare.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La firma cliente storica determina il tipo anche se manca il flag.
create unique index if not exists ux_campo_rapportini_tipo_giorno
on public.campo_rapportini (user_id, order_id, data_lavoro,
  (case when coalesce(lavoro_completato, false) or nullif(btrim(firma_cliente_url), '') is not null
        then 'cliente' else 'giornaliero' end));
alter table public.campo_rapportini drop constraint if exists ux_campo_rapportini_unique_day;
drop index if exists public.ux_campo_rapportini_unique_day;
-- La colonna distribuita è numeric(4,1): conserva le tre cifre intere,
-- oltre al secondo decimale. numeric(4,2) restringerebbe lo storico a 99,99.
alter table public.campo_rapportini alter column ore_lavorate type numeric(5,2);

create or replace function public.campo_rapportini_protocollo()
returns integer language plpgsql stable security invoker set search_path = public
as $$ begin
  if auth.uid() is null then raise exception 'Sessione richiesta' using errcode = '42501'; end if;
  return 2;
end $$;
revoke all on function public.campo_rapportini_protocollo() from public, anon;
grant execute on function public.campo_rapportini_protocollo() to authenticated;

-- Anche assegnazioni tramite dipendente/squadra/contratto devono leggere le regole reali.
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
    'ore_dalle', coalesce(r.ore_dalle, 'capo'), 'avviso_scostamento_minuti', r.avviso_scostamento_minuti);
end $$;
revoke all on function public.campo_regole_per_ordine(uuid) from public, anon;
grant execute on function public.campo_regole_per_ordine(uuid) to authenticated;

create or replace function public.campo_rapportino_verifica_flusso()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_regola text; v_ruolo jsonb;
  v_ufficio boolean; v_ditta boolean; v_cliente boolean;
begin
  -- Non sostituisce né allarga le policy RLS esistenti.
  if not exists (select 1 from public.orders o where o.id = new.order_id and o.company_id = new.company_id)
  then raise exception 'Commessa e azienda non corrispondono' using errcode = '42501'; end if;
  -- I job server fidati (PDF, automazioni) mantengono il normale accesso service_role.
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
    -- PDF e firma dell'autore non riaprono la scelta del flusso di un documento già inviato.
    if (new.descrizione_lavori, new.ore_lavorate, new.ore_straordinario, new.presenze, new.materiali_usati,
        new.foto_urls, new.fasi_lavorate, new.percentuale_avanzamento, new.firma_cliente_url, new.firma_cliente_nome, new.stato) is not distinct from
       (old.descrizione_lavori, old.ore_lavorate, old.ore_straordinario, old.presenze, old.materiali_usati,
        old.foto_urls, old.fasi_lavorate, old.percentuale_avanzamento, old.firma_cliente_url, old.firma_cliente_nome, old.stato)
    then return new; end if;
    -- Un rapporto già inviato (o approvato) non si riscrive dal cantiere: ore, testo e firma
    -- del cliente restano quelli mandati. Si corregge solo se l'ufficio lo rimanda indietro.
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
     or (new.data_lavoro < (now() at time zone 'Europe/Rome')::date - 1
         and not (tg_op = 'UPDATE' and old.stato in ('rifiutato', 'bozza')))
  then raise exception 'Il giornaliero va inviato entro il giorno successivo' using errcode = '22023'; end if;
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
drop trigger if exists trg_campo_rapportino_verifica_flusso on public.campo_rapportini;
create trigger trg_campo_rapportino_verifica_flusso before insert or update on public.campo_rapportini
for each row execute function public.campo_rapportino_verifica_flusso();

-- Solo la prima approvazione del giornaliero applica la proposta generica, nella stessa transazione.
create or replace function public.campo_rapportino_avanzamento_approvato()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
    and not coalesce(new.lavoro_completato, false) and nullif(btrim(new.firma_cliente_url), '') is null
    and coalesce(new.fasi_lavorate, '[]'::jsonb) = '[]'::jsonb then
    update public.orders set percentuale_avanzamento = greatest(coalesce(percentuale_avanzamento, 0), coalesce(new.percentuale_avanzamento, 0))
      where id = new.order_id and company_id = new.company_id;
  end if;
  return new;
end $$;
revoke all on function public.campo_rapportino_avanzamento_approvato() from public, anon, authenticated;
drop trigger if exists trg_campo_rapportino_avanzamento_approvato on public.campo_rapportini;
create trigger trg_campo_rapportino_avanzamento_approvato after update on public.campo_rapportini
for each row execute function public.campo_rapportino_avanzamento_approvato();
