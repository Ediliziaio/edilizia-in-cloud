-- PFN e Piano industriale con le stesse regole dello stato patrimoniale (15/11/2026)
--
-- Dopo 20290330150000 lo stato patrimoniale legge i conti alla data di
-- riferimento e divide i mutui in quota entro 12 mesi (`mutui_breve`, tra i
-- debiti a breve) e quota oltre (`mutui_mlt`). Due funzioni non lo sapevano:
--
--  - cg_simula_piano_industriale prendeva come debito da rimborsare solo
--    `mutui_mlt`: il debito risultava più basso della quota a breve e il piano
--    lo estingueva un anno prima; la quota a breve finiva tra i debiti
--    correnti che il piano fa crescere coi ricavi. Ora il debito è tutto il
--    capitale residuo e i debiti correnti sono senza la quota dei mutui.
--  - cg_get_pfn dava sempre la posizione di oggi (saldi di oggi), anche per un
--    anno chiuso, e non diceva quanto dei mutui scade entro l'anno. Ora: saldi
--    alla stessa data dello stato patrimoniale, conto per conto, e mutui divisi
--    entro/oltre 12 mesi (stesso piano alla francese). `mutui_mlt` resta il
--    totale, per chi lo legge già così.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $f$
declare def text; nuovo text;
begin
  def := pg_get_functiondef('public.cg_simula_piano_industriale'::regproc);
  if position('mutui_breve' in def) > 0 then return; end if;
  nuovo := replace(def,
    $a$  v_debito  := COALESCE((v_sp0->'passivo'->>'mutui_mlt')::numeric, 0);$a$,
    $b$  -- Tutto il capitale residuo: lo stato patrimoniale divide la quota entro 12 mesi.
  v_debito  := COALESCE((v_sp0->'passivo'->>'mutui_mlt')::numeric, 0) + COALESCE((v_sp0->'passivo'->>'mutui_breve')::numeric, 0);$b$);
  nuovo := replace(nuovo,
    $a$  v_pc      := COALESCE((v_sp0->'passivo'->>'pas_corrente')::numeric, 0);$a$,
    $b$  -- Debiti correnti senza la quota dei mutui: quella si rimborsa con le rate, non cresce coi ricavi.
  v_pc      := COALESCE((v_sp0->'passivo'->>'pas_corrente')::numeric, 0) - COALESCE((v_sp0->'passivo'->>'mutui_breve')::numeric, 0);$b$);
  if (length(nuovo) - length(replace(nuovo, 'mutui_breve', ''))) / length('mutui_breve') <> 2 then
    raise exception 'Piano industriale: i punti da cambiare non sono stati trovati, la funzione è cambiata';
  end if;
  execute nuovo;
end $f$;

CREATE OR REPLACE FUNCTION public.cg_get_pfn(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id      uuid;
  v_rif             date;
  v_cassa           numeric(14,2) := 0;
  v_banche_positive numeric(14,2) := 0;
  v_banche_negative numeric(14,2) := 0;
  v_mutui           numeric(14,2) := 0;
  v_mutui_breve     numeric(14,2) := 0;
  v_pfn             numeric(14,2);
BEGIN
  PERFORM public.richiedi_saldi_bancari(p_company_id);
  PERFORM public._cg_assert_lettura(p_company_id);
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  -- Stessa data dello stato patrimoniale: oggi, o il 31/12 di un anno chiuso.
  v_rif := LEAST(CURRENT_DATE, make_date(p_anno, 12, 31));

  -- Saldo di ogni conto alla data: saldo di oggi meno i movimenti contabilizzati
  -- dopo. I conti in rosso sono debiti, senza compensarli coi conti in attivo.
  WITH saldi AS (
    SELECT COALESCE(a.current_balance, 0) - COALESCE((
             SELECT sum(t.amount) FROM public.bank_transactions t
              WHERE t.account_id = a.id AND t.company_id = v_company_id
                AND COALESCE(t.status, 'booked') = 'booked'
                AND t.booking_date > v_rif
                AND t.booking_date <= COALESCE(a.balance_updated_at::date, CURRENT_DATE)), 0) AS saldo
      FROM public.bank_accounts a
     WHERE a.company_id = v_company_id AND COALESCE(a.is_active, true) = true
  )
  SELECT COALESCE(sum(saldo) FILTER (WHERE saldo > 0), 0),
         COALESCE(sum(abs(saldo)) FILTER (WHERE saldo < 0), 0)
    INTO v_banche_positive, v_banche_negative
    FROM saldi;

  -- Cassa contanti: nessuna fonte nel gestionale.
  v_cassa := 0;

  -- Mutui: capitale residuo dei finanziamenti attivi e quota delle prossime dodici rate.
  SELECT COALESCE(sum(capitale_residuo), 0) INTO v_mutui
    FROM public.cg_loans WHERE company_id = v_company_id AND is_active = true;
  WITH RECURSIVE piano AS (
    SELECT l.id, 1 AS n, COALESCE(l.capitale_residuo, 0)::numeric AS residuo,
           COALESCE(l.rata_mensile, 0)::numeric AS rata, COALESCE(l.tasso_pct, 0)::numeric / 1200 AS i,
           least(COALESCE(l.capitale_residuo, 0)::numeric,
                 greatest(COALESCE(l.rata_mensile, 0) - COALESCE(l.capitale_residuo, 0) * COALESCE(l.tasso_pct, 0) / 1200, 0)) AS quota
      FROM public.cg_loans l
     WHERE l.company_id = v_company_id AND l.is_active = true AND COALESCE(l.capitale_residuo, 0) > 0
    UNION ALL
    SELECT p.id, p.n + 1, p.residuo - p.quota, p.rata, p.i,
           least(p.residuo - p.quota, greatest(p.rata - (p.residuo - p.quota) * p.i, 0))
      FROM piano p
     WHERE p.n < 12 AND p.residuo - p.quota > 0
  )
  SELECT COALESCE(sum(quota), 0) INTO v_mutui_breve FROM piano;

  v_pfn := (v_mutui + v_banche_negative) - (v_cassa + v_banche_positive);

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'anno', p_anno,
      'data_riferimento', v_rif,
      -- Il capitale residuo dei mutui è quello di oggi anche per un anno chiuso.
      'mutui_di_oggi', v_rif < CURRENT_DATE,
      'generato_il', now()
    ),
    'pfn', v_pfn,
    'componenti', jsonb_build_object(
      'cassa', v_cassa,
      'banche_positive', v_banche_positive,
      'banche_negative', v_banche_negative,
      'mutui_mlt', v_mutui,
      'mutui_breve', v_mutui_breve,
      'mutui_oltre', v_mutui - v_mutui_breve
    ),
    'serie', jsonb_build_array(jsonb_build_object('label', to_char(v_rif, 'DD/MM/YYYY'), 'pfn', v_pfn))
  );
END;
$function$;
