-- Costo di operai e mezzi alla data del lavoro, non alla data di approvazione (area D, 15/11/2026).
--
-- Prima: il rapportino fotografava il costo orario dell'operaio il giorno in cui veniva
-- approvato (fn_rapportino_costo_manodopera → costo_orario_calcolato, senza data), e il costo
-- dei mezzi si ricalcolava col costo di oggi a ogni modifica (rapportino_mezzi_costi_ricalcola →
-- mezzo_costo_orario_effettivo). Un rapportino di settembre approvato a novembre, dopo un
-- aumento, prendeva il costo di novembre. Nessuna tabella conservava i costi di prima.
--
-- Ora:
-- 1. costi_orari_storico: ogni volta che il costo orario di un dipendente o di un mezzo cambia,
--    si scrive il nuovo valore con valido_dal = oggi (ora italiana). La prima volta si scrive
--    anche il valore di prima, valido dal passato remoto ('-infinity'): è il solo costo che si
--    conosce per i lavori fatti fino a quel giorno.
-- 2. private.costo_orario_dipendente_al / private.mezzo_costo_orario_al: il costo valido in
--    quella data. Senza storia (costo mai cambiato da oggi in poi) è il costo di adesso, come
--    prima: niente cambia per i dati esistenti.
-- 3. I due trigger del rapportino usano la data del lavoro (data_lavoro).
--
-- Limiti, scritti in docs/automazioni-subappalti-operativita.md:
-- - il costo CALCOLATO di un mezzo (spese degli ultimi 12 mesi / ore) cambia da solo col
--   passare del tempo e non lascia storia: si storicizzano le modifiche del costo manuale e
--   delle ore previste;
-- - rapportino_costo_recupera (il costo che mancava e arriva dopo) resta col costo attuale:
--   quando il costo mancava, il primo costo noto è il migliore che c'è.
-- - Un aumento con decorrenza passata («dal 1° del mese») oggi si registra dal giorno della
--   modifica; la data a scelta è un lotto successivo (interfaccia).
--
-- Nessuna scrittura sui dati esistenti: lo storico parte vuoto e si riempie alle modifiche.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Lo storico ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.costi_orari_storico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('dipendente', 'mezzo')),
  risorsa_id uuid NOT NULL,
  valido_dal date NOT NULL,
  costo_orario numeric,
  origine text NOT NULL,
  registrato_da uuid DEFAULT auth.uid(),
  registrato_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT costi_orari_storico_una_riga_al_giorno UNIQUE (tipo, risorsa_id, valido_dal)
);

COMMENT ON TABLE public.costi_orari_storico IS
  'Costo orario di dipendenti e mezzi con la data da cui vale. Lo scrivono solo i trigger; lo leggono i rapportini (costo alla data del lavoro).';
COMMENT ON COLUMN public.costi_orari_storico.valido_dal IS
  '-infinity = il costo che valeva prima della prima modifica registrata.';

CREATE INDEX IF NOT EXISTS idx_costi_orari_storico_company ON public.costi_orari_storico (company_id);

ALTER TABLE public.costi_orari_storico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.costi_orari_storico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.costi_orari_storico TO authenticated;
GRANT ALL ON public.costi_orari_storico TO service_role;

DROP POLICY IF EXISTS costi_orari_storico_lettura ON public.costi_orari_storico;
CREATE POLICY costi_orari_storico_lettura ON public.costi_orari_storico
  FOR SELECT TO authenticated
  USING (
    (SELECT public.user_can_access_company(company_id))
    AND (SELECT public.has_permission_for_company((SELECT auth.uid()), 'can_view_costs', company_id))
  );

-- ── 2. Il costo di un dipendente da una scheda (la formula di costo_orario_calcolato) ──
-- Separata dalla lettura della tabella: nel trigger serve sul record di prima (OLD) e di dopo (NEW).
CREATE OR REPLACE FUNCTION private.costo_orario_da_scheda(e public.employees)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select case
    when e.costo_orario is not null and e.costo_orario > 0 then e.costo_orario
    when coalesce(e.gross_salary, 0) > 0 and coalesce(e.monthly_hours, 0) > 0 then
      round(
        e.gross_salary * p.mensilita
          * (100 + coalesce(e.inps_rate, p.inps) + p.inail + p.cassa_edile + p.tfr + p.altri)
        / (e.monthly_hours * 12 * p.ore_produttive), 2)
  end
  from (
    select coalesce(c.mensilita, d.mensilita) mensilita, coalesce(c.inps, d.inps) inps,
           coalesce(c.inail, d.inail) inail, coalesce(c.cassa_edile, d.cassa_edile) cassa_edile,
           coalesce(c.tfr, d.tfr) tfr, coalesce(c.altri, d.altri) altri,
           coalesce(c.ore_produttive, d.ore_produttive) ore_produttive
      from public.costo_personale_preset(public.profilo_costo_dipendente(e.profilo_costo, e.role_type, e.qualifica, e.area)) d
      left join public.costo_personale_parametri c
        on c.company_id = e.company_id
       and c.profilo = public.profilo_costo_dipendente(e.profilo_costo, e.role_type, e.qualifica, e.area)
  ) p
$function$;

-- costo_orario_calcolato resta la stessa formula, letta dalla scheda di adesso.
CREATE OR REPLACE FUNCTION public.costo_orario_calcolato(p_employee_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select private.costo_orario_da_scheda(e) from public.employees e where e.id = p_employee_id
$function$;

-- Il costo calcolato di un mezzo (spese degli ultimi 12 mesi sulle ore), senza il manuale.
CREATE OR REPLACE FUNCTION private.mezzo_costo_calcolato(p_mezzo uuid, p_ore_previste numeric)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare m record; s record;
begin
  select x.company_id into m from public.mezzi x where x.id = p_mezzo;
  if m.company_id is null then return null; end if;
  select * into s from public.mezzi_spese_12_mesi(m.company_id, p_mezzo);
  if coalesce(s.totale, 0) <= 0 then return null; end if;
  return round(s.totale / greatest(coalesce(s.ore_lavorate, 0), coalesce(p_ore_previste, 800)), 2);
end; $function$;

-- ── 3. Registrare una modifica ─────────────────────────────────────────────────
-- Idempotente e sicura in parallelo: la riga «di prima» si scrive una volta sola (ON CONFLICT
-- DO NOTHING), e la riga di oggi si aggiorna se il costo cambia due volte nello stesso giorno.
CREATE OR REPLACE FUNCTION private.costo_orario_registra(
  p_company uuid, p_tipo text, p_risorsa uuid, p_prima numeric, p_dopo numeric, p_origine text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_valido numeric;
begin
  insert into public.costi_orari_storico (company_id, tipo, risorsa_id, valido_dal, costo_orario, origine)
  values (p_company, p_tipo, p_risorsa, '-infinity', p_prima, 'prima della storia')
  on conflict (tipo, risorsa_id, valido_dal) do nothing;

  select s.costo_orario into v_valido
    from public.costi_orari_storico s
   where s.tipo = p_tipo and s.risorsa_id = p_risorsa and s.valido_dal < v_oggi
   order by s.valido_dal desc limit 1;

  if v_valido is not distinct from p_dopo then
    -- Tornato al costo di ieri: la riga di oggi non serve più.
    delete from public.costi_orari_storico s
     where s.tipo = p_tipo and s.risorsa_id = p_risorsa and s.valido_dal = v_oggi;
    return;
  end if;

  insert into public.costi_orari_storico (company_id, tipo, risorsa_id, valido_dal, costo_orario, origine)
  values (p_company, p_tipo, p_risorsa, v_oggi, p_dopo, p_origine)
  on conflict (tipo, risorsa_id, valido_dal) do update
    set costo_orario = excluded.costo_orario, origine = excluded.origine,
        registrato_da = auth.uid(), registrato_il = now();
end; $function$;

-- ── 4. I trigger che registrano ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.employees_costo_storico_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_prima numeric; v_dopo numeric;
begin
  v_prima := private.costo_orario_da_scheda(old);
  v_dopo := private.costo_orario_da_scheda(new);
  if v_prima is distinct from v_dopo then
    perform private.costo_orario_registra(new.company_id, 'dipendente', new.id, v_prima, v_dopo, 'scheda dipendente');
  end if;
  return null;
end; $function$;

DROP TRIGGER IF EXISTS trg_employees_costo_storico ON public.employees;
CREATE TRIGGER trg_employees_costo_storico
  AFTER UPDATE OF costo_orario, gross_salary, monthly_hours, inps_rate, profilo_costo, role_type, qualifica, area
  ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.employees_costo_storico_trg();

-- I parametri dell'azienda (mensilità, oneri, ore produttive per profilo) cambiano il costo di
-- tutti i dipendenti di quel profilo. Prima della modifica si fissa il costo di prima, dopo si
-- registra il nuovo.
CREATE OR REPLACE FUNCTION private.parametri_costo_storico_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare e public.employees; v_company uuid; v_profilo text; v_costo numeric;
begin
  v_company := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_profilo := case when tg_op = 'DELETE' then old.profilo else new.profilo end;
  for e in
    select x.* from public.employees x
     where x.company_id = v_company
       and public.profilo_costo_dipendente(x.profilo_costo, x.role_type, x.qualifica, x.area) = v_profilo
  loop
    v_costo := private.costo_orario_da_scheda(e);
    if tg_when = 'BEFORE' then
      insert into public.costi_orari_storico (company_id, tipo, risorsa_id, valido_dal, costo_orario, origine)
      values (e.company_id, 'dipendente', e.id, '-infinity', v_costo, 'prima della storia')
      on conflict (tipo, risorsa_id, valido_dal) do nothing;
    else
      perform private.costo_orario_registra(e.company_id, 'dipendente', e.id, v_costo, v_costo, 'parametri del costo');
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end; $function$;

DROP TRIGGER IF EXISTS trg_parametri_costo_storico_prima ON public.costo_personale_parametri;
CREATE TRIGGER trg_parametri_costo_storico_prima
  BEFORE INSERT OR UPDATE OR DELETE ON public.costo_personale_parametri
  FOR EACH ROW EXECUTE FUNCTION private.parametri_costo_storico_trg();
DROP TRIGGER IF EXISTS trg_parametri_costo_storico_dopo ON public.costo_personale_parametri;
CREATE TRIGGER trg_parametri_costo_storico_dopo
  AFTER INSERT OR UPDATE OR DELETE ON public.costo_personale_parametri
  FOR EACH ROW EXECUTE FUNCTION private.parametri_costo_storico_trg();

-- Mezzi: il costo effettivo è il manuale, se c'è, altrimenti il calcolato con le ore previste.
CREATE OR REPLACE FUNCTION private.mezzi_costo_storico_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v_mezzo uuid; v_company uuid; v_prima numeric; v_dopo numeric;
begin
  v_mezzo := case when tg_op = 'DELETE' then old.mezzo_id else new.mezzo_id end;
  v_company := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_prima := case when tg_op = 'INSERT' then private.mezzo_costo_calcolato(v_mezzo, null)
                  else coalesce(old.costo_orario_manuale, private.mezzo_costo_calcolato(v_mezzo, old.ore_annue_previste)) end;
  v_dopo := case when tg_op = 'DELETE' then private.mezzo_costo_calcolato(v_mezzo, null)
                 else coalesce(new.costo_orario_manuale, private.mezzo_costo_calcolato(v_mezzo, new.ore_annue_previste)) end;
  if v_prima is distinct from v_dopo and v_company is not null then
    perform private.costo_orario_registra(v_company, 'mezzo', v_mezzo, v_prima, v_dopo, 'costo orario del mezzo');
  end if;
  return null;
end; $function$;

DROP TRIGGER IF EXISTS trg_mezzi_costo_storico ON public.mezzi_costo_orario;
CREATE TRIGGER trg_mezzi_costo_storico
  AFTER INSERT OR UPDATE OF costo_orario_manuale, ore_annue_previste OR DELETE ON public.mezzi_costo_orario
  FOR EACH ROW EXECUTE FUNCTION private.mezzi_costo_storico_trg();

-- ── 5. Il costo valido in una data ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.costo_orario_dipendente_al(p_employee uuid, p_data date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v record;
begin
  select s.costo_orario, true as trovato into v
    from public.costi_orari_storico s
   where s.tipo = 'dipendente' and s.risorsa_id = p_employee
     and s.valido_dal <= coalesce(p_data, (now() at time zone 'Europe/Rome')::date)
   order by s.valido_dal desc limit 1;
  if v.trovato then return v.costo_orario; end if;
  return public.costo_orario_calcolato(p_employee);
end; $function$;

CREATE OR REPLACE FUNCTION private.mezzo_costo_orario_al(p_mezzo uuid, p_data date)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
declare v record; m record;
begin
  select x.company_id, x.possesso into m from public.mezzi x where x.id = p_mezzo and x.deleted_at is null;
  if m.company_id is null or coalesce(m.possesso, '') like 'noleggio%' then return null; end if;
  select s.costo_orario, true as trovato into v
    from public.costi_orari_storico s
   where s.tipo = 'mezzo' and s.risorsa_id = p_mezzo
     and s.valido_dal <= coalesce(p_data, (now() at time zone 'Europe/Rome')::date)
   order by s.valido_dal desc limit 1;
  if v.trovato then return v.costo_orario; end if;
  return public.mezzo_costo_orario_effettivo(p_mezzo);
end; $function$;

REVOKE ALL ON FUNCTION private.costo_orario_da_scheda(public.employees) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mezzo_costo_calcolato(uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.costo_orario_registra(uuid, text, uuid, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.employees_costo_storico_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.parametri_costo_storico_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mezzi_costo_storico_trg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.costo_orario_dipendente_al(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mezzo_costo_orario_al(uuid, date) FROM PUBLIC, anon, authenticated;

-- ── 6. I trigger del rapportino leggono il costo alla data del lavoro ──────────
-- Si cambia una sola chiamata in ciascuna funzione, sul testo che è nel database: le due
-- funzioni sono lunghe e cambiate da molte migrazioni, e riscriverle qui per intero
-- rischierebbe di riportare indietro una correzione di altri. Rilanciata, non fa niente.
DO $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.fn_rapportino_costo_manodopera()'::regprocedure);
  if position('private.costo_orario_dipendente_al(v_emp.id, new.data_lavoro)' in v_def) = 0 then
    if position('v_tariffa := public.costo_orario_calcolato(v_emp.id);' in v_def) = 0 then
      raise exception 'fn_rapportino_costo_manodopera: non trovo la riga del costo da sostituire';
    end if;
    execute replace(v_def, 'v_tariffa := public.costo_orario_calcolato(v_emp.id);',
                    'v_tariffa := private.costo_orario_dipendente_al(v_emp.id, new.data_lavoro);');
  end if;

  v_def := pg_get_functiondef('public.rapportino_mezzi_costi_ricalcola(uuid)'::regprocedure);
  if position('private.mezzo_costo_orario_al(x.mezzo, r.data_lavoro)' in v_def) = 0 then
    if position('v_costo := public.mezzo_costo_orario_effettivo(x.mezzo);' in v_def) = 0 then
      raise exception 'rapportino_mezzi_costi_ricalcola: non trovo la riga del costo da sostituire';
    end if;
    execute replace(v_def, 'v_costo := public.mezzo_costo_orario_effettivo(x.mezzo);',
                    'v_costo := private.mezzo_costo_orario_al(x.mezzo, r.data_lavoro);');
  end if;
end $$;
