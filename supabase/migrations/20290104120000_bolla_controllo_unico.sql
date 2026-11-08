-- Una bolla entra una volta sola, dal cantiere o dall'ufficio (8/11/2026). Piano, punto 8.
--
-- L'operaio (campo_acquisti) e l'ufficio (ddt_ricezione) avevano controlli separati.
-- Qui si guarda l'altra strada, con lo stesso numero normalizzato e dentro un lucchetto:
-- due persone che mandano la stessa bolla nello stesso istante passano una alla volta.
--
-- Un'eccezione voluta: l'operaio carica la bolla di un ordine e l'ufficio ne registra
-- l'arrivo. È lo stesso documento che avanza, non un doppione: le due righe si collegano.
--
-- Le bolle già nel sistema non si toccano; ddt_ricezione_una_bolla_per_fornitore resta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.campo_acquisti
  add column if not exists ddt_ricezione_id uuid references public.ddt_ricezione(id) on delete set null;
comment on column public.campo_acquisti.ddt_ricezione_id is 'La bolla dell''ufficio che corrisponde a questo documento del cantiere.';
create index if not exists idx_campo_acquisti_bolla on public.campo_acquisti (ddt_ricezione_id) where ddt_ricezione_id is not null;

-- «DDT n. 12/A» e «12a» sono lo stesso numero. Vuoto per le bolle senza numero (S/N).
create or replace function public.bolla_numero_norma(p_numero text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_numero is null or btrim(p_numero) ~* '^s[ ./]*n([ ./]|$)' then ''
    else upper(regexp_replace(
      regexp_replace(btrim(p_numero), '^(d[. ]*d[. ]*t[. ]*|bolla[ ]*|doc[. ]*)?(n[.°º ]+(?=[0-9a-z])|nr[. ]*|num[. ]*)?', '', 'i'),
      '[^[:alnum:]]', '', 'g'))
  end;
$function$;

create or replace function public.bolla_fornitore_norma(p_nome text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select regexp_replace(
           regexp_replace(lower(coalesce(p_nome, '')), '\m(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\M', '', 'g'),
           '[^[:alnum:]]', '', 'g');
$function$;

create or replace function public.bolla_stesso_fornitore(a_id uuid, a_nome text, b_id uuid, b_nome text)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when a_id is not null and b_id is not null then a_id = b_id
    else (with n as (select public.bolla_fornitore_norma(a_nome) a, public.bolla_fornitore_norma(b_nome) b)
          select length(n.a) >= 4 and length(n.b) >= 4
             and (n.a = n.b or position(n.a in n.b) > 0 or position(n.b in n.a) > 0) from n)
  end;
$function$;

create or replace function public.bolla_lucchetto(p_company uuid, p_numero text)
 returns void
 language sql
 set search_path to 'public'
as $function$
  select pg_advisory_xact_lock(hashtextextended('bolla:' || p_company::text || ':' || p_numero, 0));
$function$;

-- Documento del cantiere: non deve esserci già, né fra quelli del cantiere né in ufficio.
create or replace function public.bolla_controllo_campo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_numero text := public.bolla_numero_norma(new.numero_documento);
  v_data date := coalesce(new.data_documento, new.giorno);
  v_nome text := coalesce(new.fornitore, (select s.name from public.suppliers s where s.id = new.supplier_id));
  v_trovata record;
begin
  if v_numero = '' then
    return new;
  end if;
  perform public.bolla_lucchetto(new.company_id, v_numero);

  select a.created_at,
         coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
                  nullif(btrim(coalesce(em.first_name, '') || ' ' || coalesce(em.last_name, '')), ''), 'un collega') as chi
    into v_trovata
    from public.campo_acquisti a
    left join public.profiles pr on pr.id = a.user_id
    left join public.employees em on em.id = a.employee_id
   where a.company_id = new.company_id
     and a.stato not in ('rifiutato', 'annullato')
     and public.bolla_numero_norma(a.numero_documento) = v_numero
     and abs(coalesce(a.data_documento, a.giorno) - v_data) <= 120
     and (public.bolla_stesso_fornitore(a.supplier_id, a.fornitore, new.supplier_id, v_nome)
          or a.order_id is not distinct from new.order_id)
   order by a.created_at desc limit 1;
  if found then
    raise exception using errcode = 'P0001', message =
      'Questo documento è già stato caricato da ' || v_trovata.chi || ' il '
      || to_char(v_trovata.created_at at time zone 'Europe/Rome', 'DD/MM') || ': non serve rimandarlo.';
  end if;

  if new.tipo_documento in ('bolla', 'altro') then
    select d.created_at into v_trovata
      from public.ddt_ricezione d
      left join public.suppliers s on s.id = d.supplier_id
     where d.company_id = new.company_id
       and public.bolla_numero_norma(d.numero_ddt) = v_numero
       and abs(d.data_ricezione - v_data) <= 120
       and (public.bolla_stesso_fornitore(d.supplier_id, s.name, new.supplier_id, v_nome)
            or d.order_id is not distinct from new.order_id)
     order by d.created_at desc limit 1;
    if found then
      raise exception using errcode = 'P0001', message =
        'Questa bolla l''ha già registrata l''ufficio il '
        || to_char(v_trovata.created_at at time zone 'Europe/Rome', 'DD/MM') || ': non serve rimandarla.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists bolla_controllo_campo on public.campo_acquisti;
create trigger bolla_controllo_campo
  before insert on public.campo_acquisti
  for each row execute function public.bolla_controllo_campo();

-- Bolla dell'ufficio. Questo trigger scatta dopo quello che deduce commessa e fornitore (ordine alfabetico).
create or replace function public.bolla_controllo_ufficio()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_numero text := public.bolla_numero_norma(new.numero_ddt);
  v_nome text := (select s.name from public.suppliers s where s.id = new.supplier_id);
  v_trovata record;
begin
  if v_numero = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_numero = public.bolla_numero_norma(old.numero_ddt)
     and new.supplier_id is not distinct from old.supplier_id
     and new.purchase_order_id is not distinct from old.purchase_order_id then
    return new;
  end if;
  perform public.bolla_lucchetto(new.company_id, v_numero);

  select a.created_at, a.stato,
         coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''),
                  nullif(btrim(coalesce(em.first_name, '') || ' ' || coalesce(em.last_name, '')), ''), 'un collega') as chi
    into v_trovata
    from public.campo_acquisti a
    left join public.profiles pr on pr.id = a.user_id
    left join public.employees em on em.id = a.employee_id
   where a.company_id = new.company_id
     and a.tipo_documento in ('bolla', 'altro')
     and a.stato not in ('rifiutato', 'annullato')
     and a.ddt_ricezione_id is null
     and public.bolla_numero_norma(a.numero_documento) = v_numero
     and abs(coalesce(a.data_documento, a.giorno) - new.data_ricezione) <= 120
     and (public.bolla_stesso_fornitore(a.supplier_id, a.fornitore, new.supplier_id, v_nome)
          or a.order_id is not distinct from new.order_id)
     and not (new.purchase_order_id is not null and a.purchase_order_id is not distinct from new.purchase_order_id)
   order by a.created_at desc limit 1;
  if found then
    raise exception using errcode = 'P0001', message =
      'Questa bolla l''ha già caricata ' || v_trovata.chi || ' dal cantiere il '
      || to_char(v_trovata.created_at at time zone 'Europe/Rome', 'DD/MM')
      || case when v_trovata.stato = 'da_verificare'
              then ': verificala in Magazzino, Merce presa, e collegala all''ordine.'
              else ': è già registrata, non serve rimetterla.' end;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_ddt_z_bolla_controllo_ufficio on public.ddt_ricezione;
create trigger trg_ddt_z_bolla_controllo_ufficio
  before insert or update of numero_ddt, supplier_id, purchase_order_id on public.ddt_ricezione
  for each row execute function public.bolla_controllo_ufficio();

-- Il documento del cantiere e la bolla dello stesso ordine sono la stessa carta: si collegano.
create or replace function public.bolla_collega_campo()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_numero text := public.bolla_numero_norma(new.numero_ddt);
begin
  if v_numero <> '' and new.purchase_order_id is not null then
    update public.campo_acquisti a
       set ddt_ricezione_id = new.id
     where a.company_id = new.company_id
       and a.purchase_order_id = new.purchase_order_id
       and a.ddt_ricezione_id is null
       and a.stato not in ('rifiutato', 'annullato')
       and public.bolla_numero_norma(a.numero_documento) = v_numero;
  end if;
  return null;
end;
$function$;

drop trigger if exists bolla_collega_campo on public.ddt_ricezione;
create trigger bolla_collega_campo
  after insert or update of numero_ddt, purchase_order_id on public.ddt_ricezione
  for each row execute function public.bolla_collega_campo();

revoke all on function public.bolla_numero_norma(text) from public, anon, authenticated;
revoke all on function public.bolla_fornitore_norma(text) from public, anon, authenticated;
revoke all on function public.bolla_stesso_fornitore(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.bolla_lucchetto(uuid, text) from public, anon, authenticated;
revoke all on function public.bolla_controllo_campo() from public, anon, authenticated;
revoke all on function public.bolla_controllo_ufficio() from public, anon, authenticated;
revoke all on function public.bolla_collega_campo() from public, anon, authenticated;
