-- ════════════════════════════════════════════════════════════════════════════
-- Dal rapportino di campo alla riga di rendiconto
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 4 del Modulo Appaltatori, e il punto su cui si decide se il modulo verra'
-- usato: se il titolare deve ribattere a mano dieci giorni per tre uomini, non
-- lo fara'. L'operaio quei dati li ha gia' messi nel rapportino di /campo
-- (giorno, ore, fase). Qui il rapportino APPROVATO diventa una riga di
-- rendiconto in BOZZA, e l'ufficio la conferma.
--
-- Tre cose non negoziabili:
--
--  1. UNA riga per rapportino, sempre. L'idempotenza sta in un indice unico su
--     `rapportino_id`, non in un controllo applicativo: due approvazioni di
--     fila, due schede aperte o due giri di un cron non fanno due righe.
--
--  2. L'approvazione di un rapportino NON deve mai fallire per un problema di
--     prezzi. Il capocantiere resterebbe bloccato in cantiere per una tariffa
--     mancante in ufficio. Il trigger quindi inghiotte i propri errori.
--
--  3. NIENTE SALTI SILENZIOSI. Dove non si puo' scrivere la riga, il rapportino
--     compare in `v_appalto_rapportini_da_rendicontare` col motivo. Un
--     rapportino saltato in silenzio e' una giornata di lavoro non fatturata —
--     la stessa trappola dei lead Meta del 21/10, dove uno SKIP senza rumore ha
--     perso i lead per due giorni.
--
-- La regola «quale tariffa, quanta quantita', quale costo» sta in UNA funzione
-- usata sia dal trigger (per scrivere) sia dalla vista (per spiegare): due copie
-- divergerebbero, e l'elenco direbbe «pronto» mentre il trigger non scrive.
--
-- Come le ore diventano quantita': tariffa a 'ora' -> le ore; a 'giornata' o
-- 'uomo_giorno' -> 1, perche' una giornata e' una giornata anche se sono state
-- nove ore: e' quello il patto. Ogni altra unita' non si converte da sola.
--
-- Se l'approvazione viene ritirata, la riga generata se ne va solo se e' ancora
-- in bozza: una riga confermata l'ha guardata una persona, e non si cancella il
-- lavoro di qualcuno per un clic su un'altra pagina.
--
-- Idempotente. Nessuna riga scritta.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create unique index if not exists appalto_rendiconto_un_rapportino
  on public.appalto_rendiconto_righe(rapportino_id)
  where rapportino_id is not null;

-- ── La regola, in un posto solo ─────────────────────────────────────────────
-- NB: questa funzione è stata corretta dalla migrazione 20281028141000, che
-- toglie il filtro su `employees.is_active`. Qui resta la versione originale:
-- la storia dice come è andata.

create or replace function public.appalto_riga_da_rapportino(p_rapportino_id uuid)
returns table (
  tariffa_id uuid,
  quantita numeric,
  employee_id uuid,
  costo_interno numeric,
  motivo text
)
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_r record;
  v_ord record;
  v_emp record;
  v_t record;
  v_generiche integer;
  v_qta numeric;
begin
  select cr.id, cr.order_id, cr.company_id, cr.user_id, cr.data_lavoro,
         cr.ore_lavorate, cr.role_type
    into v_r
    from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Rapportino inesistente'::text;
    return;
  end if;

  select o.order_type, o.appalto_contratto_id into v_ord
    from public.orders o where o.id = v_r.order_id and o.deleted_at is null;
  if not found or v_ord.order_type is distinct from 'appaltatore_lavoro' then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'La commessa non e'' in appalto'::text;
    return;
  end if;
  if v_ord.appalto_contratto_id is null then
    return query select null::uuid, null::numeric, null::uuid, null::numeric,
      'La commessa non ha un contratto: senza listino non c''e'' prezzo'::text;
    return;
  end if;
  if coalesce(v_r.ore_lavorate, 0) <= 0 then
    return query select null::uuid, null::numeric, null::uuid, null::numeric, 'Il rapportino non porta ore'::text;
    return;
  end if;

  select e.id, e.qualifica, e.livello_inquadramento, e.costo_orario
    into v_emp
    from public.employees e
   where e.user_id = v_r.user_id and e.company_id = v_r.company_id and coalesce(e.is_active, true)
   limit 1;

  -- 1) la tariffa di manodopera della sua qualifica (o del suo livello)
  select t.id, t.unita_misura into v_t
    from public.appalto_tariffe t
   where t.contratto_id = v_ord.appalto_contratto_id
     and t.tipo = 'manodopera' and t.attivo
     and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
     and (t.valido_al is null or v_r.data_lavoro <= t.valido_al)
     and t.qualifica is not null
     and v_emp.id is not null
     and (lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.qualifica, '')))
       or lower(btrim(t.qualifica)) = lower(btrim(coalesce(v_emp.livello_inquadramento, ''))))
   order by t.ordine
   limit 1;

  -- 2) altrimenti la tariffa generica, ma solo se ce n'e' UNA: con due non si
  --    indovina, e indovinare qui vuol dire fatturare la cifra sbagliata.
  if v_t.id is null then
    select count(*) into v_generiche
      from public.appalto_tariffe t
     where t.contratto_id = v_ord.appalto_contratto_id
       and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
       and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
       and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    if v_generiche = 1 then
      select t.id, t.unita_misura into v_t
        from public.appalto_tariffe t
       where t.contratto_id = v_ord.appalto_contratto_id
         and t.tipo = 'manodopera' and t.attivo and t.qualifica is null
         and (t.valido_dal is null or v_r.data_lavoro >= t.valido_dal)
         and (t.valido_al is null or v_r.data_lavoro <= t.valido_al);
    elsif v_generiche > 1 then
      return query select null::uuid, null::numeric, v_emp.id, null::numeric,
        'Piu'' di una tariffa di manodopera senza qualifica: scegli tu quale'::text;
      return;
    end if;
  end if;

  if v_t.id is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('Nessuna tariffa di manodopera per '
        || coalesce(nullif(btrim(coalesce(v_emp.qualifica, v_emp.livello_inquadramento)), ''), 'questo operaio')
        || ' in vigore il ' || to_char(v_r.data_lavoro, 'DD/MM/YYYY'))::text;
    return;
  end if;

  v_qta := case v_t.unita_misura
             when 'ora' then v_r.ore_lavorate
             when 'giornata' then 1
             when 'uomo_giorno' then 1
             else null
           end;
  if v_qta is null then
    return query select null::uuid, null::numeric, v_emp.id, null::numeric,
      ('La tariffa e'' a ' || v_t.unita_misura || ': le ore non si convertono da sole')::text;
    return;
  end if;

  return query select
    v_t.id,
    v_qta,
    v_emp.id,
    case when v_emp.costo_orario is not null and v_emp.costo_orario > 0
         then round(v_r.ore_lavorate * v_emp.costo_orario, 2) end,
    null::text;
end;
$fn$;
revoke all on function public.appalto_riga_da_rapportino(uuid) from public, anon, authenticated;

comment on function public.appalto_riga_da_rapportino(uuid) is
  'Da un rapportino approvato: quale tariffa, quanta quantita'', quale operaio e quale costo — oppure il motivo per cui non si puo'' rendicontare. Una regola sola, usata dal trigger e dalla vista.';

-- ── Il trigger: scrive quando puo', e non blocca mai l'approvazione ─────────

create or replace function public.appalto_rendiconto_da_rapportino()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare v record;
begin
  -- Solo al passaggio a «approvato»: un rapportino ritoccato non rigenera niente.
  if not (coalesce(new.approvato, false) and not coalesce(old.approvato, false)) then
    return new;
  end if;

  begin
    select * into v from public.appalto_riga_da_rapportino(new.id);
    if v.motivo is not null or v.tariffa_id is null then
      return new;  -- il perche' lo dice v_appalto_rapportini_da_rendicontare
    end if;

    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, quantita, employee_id, fase_id,
      origine, rapportino_id, stato,
      descrizione, unita_misura, prezzo_unitario, costo_interno
    ) values (
      new.order_id, new.data_lavoro, v.tariffa_id, v.quantita, v.employee_id, null,
      'rapportino', new.id, 'bozza',
      '—', 'cad', 0, v.costo_interno
    )
    on conflict (rapportino_id) where rapportino_id is not null do nothing;
  exception when others then
    -- L'approvazione di un rapportino NON deve fallire per un problema di
    -- prezzi: il capocantiere resterebbe bloccato in cantiere. La riga
    -- mancante si vede nell'elenco «da rendicontare», non sparisce in silenzio.
    null;
  end;

  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_da_rapportino() from public, anon, authenticated;

drop trigger if exists trg_appalto_rendiconto_da_rapportino on public.campo_rapportini;
create trigger trg_appalto_rendiconto_da_rapportino
  after update of approvato on public.campo_rapportini
  for each row execute function public.appalto_rendiconto_da_rapportino();

-- Approvazione ritirata: la riga che aveva generato il sistema se ne va, ma
-- solo se e' ancora in bozza. Se qualcuno l'ha confermata, l'ha guardata.
create or replace function public.appalto_rendiconto_rapportino_ritirato()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if coalesce(old.approvato, false) and not coalesce(new.approvato, false) then
    delete from public.appalto_rendiconto_righe
     where rapportino_id = new.id and origine = 'rapportino' and stato = 'bozza';
  end if;
  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_rapportino_ritirato() from public, anon, authenticated;

drop trigger if exists trg_appalto_rendiconto_ritirato on public.campo_rapportini;
create trigger trg_appalto_rendiconto_ritirato
  after update of approvato on public.campo_rapportini
  for each row execute function public.appalto_rendiconto_rapportino_ritirato();

-- ── Niente salti silenziosi ─────────────────────────────────────────────────
-- I controlli di accesso sono scritti DENTRO la vista: chi vede la commessa e i
-- suoi importi. Una vista senza questi filtri perde dati fra aziende.

create or replace view public.v_appalto_rapportini_da_rendicontare as
select
  cr.id              as rapportino_id,
  cr.company_id,
  cr.order_id,
  cr.data_lavoro,
  cr.ore_lavorate,
  cr.user_id,
  cr.role_type,
  r.motivo
from public.campo_rapportini cr
join public.orders o
  on o.id = cr.order_id and o.deleted_at is null and o.order_type = 'appaltatore_lavoro'
cross join lateral public.appalto_riga_da_rapportino(cr.id) r
where cr.approvato
  and not exists (
    select 1 from public.appalto_rendiconto_righe rr where rr.rapportino_id = cr.id
  )
  and public.puo_vedere_commessa(cr.order_id)
  and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', cr.company_id);

comment on view public.v_appalto_rapportini_da_rendicontare is
  'Rapportini approvati su commesse in appalto che NON sono diventati una riga di rendiconto, col motivo. Un rapportino saltato in silenzio e'' una giornata di lavoro non fatturata.';

revoke all on public.v_appalto_rapportini_da_rendicontare from public, anon;
grant select on public.v_appalto_rapportini_da_rendicontare to authenticated, service_role;
