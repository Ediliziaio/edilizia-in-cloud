-- Cantiere ↔ ufficio: sette correzioni dal controllo del 19/10/2026.
--
--  1. Ore annullate dall'ufficio: un rapportino dell'ufficio rifiutato non torna approvato
--     (le ore si rimettono inserendole di nuovo da «Ore e persone»).
--  2. Timbratura dall'app: solo su un cantiere dove la persona lavora. La finestra di 48 ore
--     resta per le timbrature rimandate dalla coda del telefono senza rete.
--  3. Ore di un rapportino di squadra: ovunque quelle delle persone (campo_presenze_effettive),
--     senza le ore delle ditte, come all'approvazione («Da approvare» e avviso all'ufficio).
--  4. «Cantieri oggi»: persone previste contate una volta anche se stanno in due elenchi.
--  5. «Cantieri oggi»: l'ultimo segnale è l'arrivo del rapportino, non l'approvazione dell'ufficio.
--  6. L'operaio vede le ore che l'ufficio gli ha già inserito (righe dell'ufficio senza autore).
--  7. Promemoria «Manca il rapportino»: non a chi è già nel rapportino di squadra, né a chi
--     non lo compila quando l'azienda ha scelto «lo compila il capo».
--
-- Le funzioni lunghe si correggono riga per riga sul testo in produzione; ogni correzione
-- controlla di essere andata a segno, così una versione diversa della funzione fa fallire
-- la migrazione invece di passare in silenzio.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Applica a una funzione una sostituzione (espressione regolare) e verifica che il risultato
-- contenga il testo atteso. Se lo contiene già, non fa niente: la migrazione si può rifare.
create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.campo_rapportino_ufficio_non_riapprova()
returns trigger language plpgsql set search_path = public
as $$
begin
  if old.ufficio_employee_id is not null and old.stato = 'rifiutato' and new.stato = 'approvato' then
    raise exception 'Queste ore sono state annullate dall''ufficio. Per rimetterle inseriscile di nuovo da «Ore e persone».'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.campo_rapportino_ufficio_non_riapprova() from public, anon, authenticated;
drop trigger if exists trg_campo_rapportino_ufficio_non_riapprova on public.campo_rapportini;
create trigger trg_campo_rapportino_ufficio_non_riapprova
  before update of stato on public.campo_rapportini
  for each row execute function public.campo_rapportino_ufficio_non_riapprova();

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists ct_insert on public.campo_timbrature;
create policy ct_insert on public.campo_timbrature
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and company_id = (select public.get_my_company_id())
    and (
      (select public.campo_e_ufficio(campo_timbrature.company_id))
      or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false)
      or (coalesce(fonte, 'app') in ('app', 'kiosk')
          and timestamp_evento <= now() + interval '5 minutes'
          and timestamp_evento >= now() - interval '48 hours'
          and (order_id is null or public.campo_lavoro_su_commessa(order_id)))
    )
  );

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$'ore', coalesce\(r\.ore_lavorate, 0\) \+ coalesce\(r\.ore_straordinario, 0\)$re$,
  $to$'ore', (select coalesce(sum(coalesce((x->>'ore')::numeric, 0)), 0) from jsonb_array_elements(public.campo_presenze_effettive(r)) x where x->>'employee_id' is not null)$to$,
  'jsonb_array_elements(public.campo_presenze_effettive(r))');

select pg_temp.correggi('public.campo_rapportino_avvisa_ufficio()',
  $re$v_ore := coalesce\(\(select sum\(coalesce\(\(x->>'ore'\)::numeric, 0\)\) from jsonb_array_elements\(\s*case when jsonb_typeof\(new\.presenze\) = 'array' then new\.presenze else '\[\]'::jsonb end\) x\), 0\);\s*if v_ore = 0 then v_ore := coalesce\(new\.ore_lavorate, 0\) \+ coalesce\(new\.ore_straordinario, 0\); end if;$re$,
  $to$v_ore := coalesce((select sum(coalesce((x->>'ore')::numeric, 0)) from jsonb_array_elements(public.campo_presenze_effettive(new)) x where x->>'employee_id' is not null), 0);$to$,
  'jsonb_array_elements(public.campo_presenze_effettive(new))');

-- 4 e 5 ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$previste as \(\s*select oe\.order_id, count\(distinct e\.user_id\) filter \(where e\.user_id is not null\) n$re$,
  $to$previste_persone as (
      select oe.order_id, e.user_id$to$,
  'previste_persone as');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$(or \(f\.id is null and a\.work_start_date <= v_giorno and coalesce\(a\.work_end_date, v_giorno\) >= v_giorno\))\s*group by oe\.order_id\s*union all\s*select oca\.order_id, count\(distinct oca\.user_id\)$re$,
  $to$\1
      union
      select oca.order_id, oca.user_id$to$,
  'select oca.order_id, oca.user_id');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$(coalesce\(oca\.data_fine_prevista, v_giorno\) >= v_giorno)\s*group by oca\.order_id\s*\),$re$,
  $to$\1
    ),
    previste as (
      select order_id, count(distinct user_id) n from previste_persone group by order_id
    ),$to$,
  'count(distinct user_id) n from previste_persone');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$max\(greatest\(r\.created_at, r\.updated_at\)\) ultimo$re$,
  $to$max(r.created_at) ultimo$to$,
  'max(r.created_at) ultimo');

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_ore_gia_registrate(uuid,date)',
  $re$and cr\.user_id <> v_uid$re$, $to$and cr.user_id is distinct from v_uid$to$,
  'cr.user_id is distinct from v_uid');
select pg_temp.correggi('public.campo_squadra_rapportino(uuid,date)',
  $re$and cr2\.user_id <> v_uid$re$, $to$and cr2.user_id is distinct from v_uid$to$,
  'cr2.user_id is distinct from v_uid');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_promemoria(text)',
  $re$(AND NOT EXISTS \(SELECT 1 FROM public\.campo_rapportini cr WHERE cr\.user_id = t\.user_id AND cr\.data_lavoro = v_oggi\))$re$,
  $to$\1
        -- già nelle presenze di un rapportino di squadra del giorno
        AND NOT EXISTS (SELECT 1 FROM public.campo_rapportini cr2
                          CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(cr2.presenze) = 'array' THEN cr2.presenze ELSE '[]'::jsonb END) pz
                          JOIN public.employees e ON e.id::text = pz->>'employee_id'
                         WHERE e.user_id = t.user_id AND cr2.company_id = t.company_id
                           AND cr2.data_lavoro = v_oggi AND cr2.stato <> 'rifiutato')
        -- con «lo compila il capo» il promemoria va solo ai capicantiere
        AND (coalesce((SELECT ra.chi_compila FROM public.campo_regole_azienda ra WHERE ra.company_id = t.company_id), 'ognuno') <> 'capo'
             OR EXISTS (SELECT 1 FROM public.order_campo_assignments oca
                         WHERE oca.user_id = t.user_id AND oca.order_id = t.order_id AND oca.is_capocantiere))$to$,
  'già nelle presenze di un rapportino di squadra del giorno');
