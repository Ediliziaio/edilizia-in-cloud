-- Stato patrimoniale: banche, utile e mutui alla data giusta (15/11/2026)
--
-- Tre numeri dello stato patrimoniale non erano alla stessa data:
--  1. BANCHE: il saldo di oggi dei conti anche per un anno chiuso. Adesso il
--     saldo alla data di riferimento: saldo di oggi meno i movimenti
--     contabilizzati dopo quella data (fino al giorno dell'ultimo saldo).
--     Conto per conto: un conto in rosso va tra i debiti, gli altri tra le
--     disponibilità, senza compensarli.
--  2. UTILE: per l'anno in corso l'utile di tutto l'anno, compresi i costi già
--     programmati fino a dicembre, accanto alla banca di oggi. Adesso l'utile
--     fino al mese della data di riferimento.
--  3. MUTUI: tutto il capitale residuo tra i debiti a lungo termine. Adesso la
--     quota capitale delle prossime dodici rate (piano alla francese da
--     capitale residuo, tasso e rata) va tra i debiti a breve
--     («mutui_breve»), il resto resta a lungo. Senza rata o tasso la quota a
--     breve non si può calcolare e resta tutto a lungo, come prima.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $f$
declare def text; nuovo text; prima text;
begin
  def := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato'::regproc);
  if position('v_mutui_breve' in def) > 0 then return; end if;  -- già fatto
  nuovo := def;

  prima := nuovo;
  nuovo := replace(nuovo, $a$  v_mutui_mlt numeric(14,2) := 0;$a$, $b$  v_mutui_mlt numeric(14,2) := 0;
  v_mutui_breve numeric(14,2) := 0;$b$);
  if nuovo = prima then raise exception 'SP: dichiarazione dei mutui non trovata'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$  SELECT COALESCE(sum(current_balance), 0)
  INTO v_banche_pos
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance > 0;$a$, $b$  -- Saldo di ogni conto alla data di riferimento: saldo di oggi meno i movimenti
  -- contabilizzati dopo quella data (fino al giorno dell'ultimo saldo).
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
    INTO v_banche_pos, v_banche_neg
    FROM saldi;$b$);
  if nuovo = prima then raise exception 'SP: blocco dei conti in attivo non trovato'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$  SELECT COALESCE(sum(abs(current_balance)), 0)
  INTO v_banche_neg
  FROM public.bank_accounts
  WHERE company_id = v_company_id
    AND COALESCE(is_active, true) = true
    AND current_balance < 0;$a$, $b$  -- Conti in rosso: già calcolati alla data, insieme ai conti in attivo.$b$);
  if nuovo = prima then raise exception 'SP: blocco dei conti in rosso non trovato'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$(public.cg_get_conto_economico_riclassificato(v_company_id, p_anno) -> 'voci')$a$,
                          $b$(public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, EXTRACT(month FROM v_rif)::integer) -> 'voci')$b$);
  if nuovo = prima then raise exception 'SP: lettura dell''utile non trovata'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$  SELECT COALESCE(sum(COALESCE(capitale_residuo, 0)), 0)
  INTO v_mutui_mlt
  FROM public.cg_loans
  WHERE company_id = v_company_id
    AND is_active = true;$a$, $b$  SELECT COALESCE(sum(COALESCE(capitale_residuo, 0)), 0)
  INTO v_mutui_mlt
  FROM public.cg_loans
  WHERE company_id = v_company_id
    AND is_active = true;

  -- Quota capitale delle prossime dodici rate: debito a breve.
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
  v_mutui_mlt := v_mutui_mlt - v_mutui_breve;$b$);
  if nuovo = prima then raise exception 'SP: blocco dei mutui non trovato'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$v_pas_corr    := v_banche_neg + v_debiti_forn$a$, $b$v_pas_corr    := v_banche_neg + v_mutui_breve + v_debiti_forn$b$);
  if nuovo = prima then raise exception 'SP: totale del passivo corrente non trovato'; end if;

  prima := nuovo;
  nuovo := replace(nuovo, $a$      'banche_negative',  v_banche_neg,$a$, $b$      'banche_negative',  v_banche_neg,
      'mutui_breve',      v_mutui_breve,$b$);
  if nuovo = prima then raise exception 'SP: uscita dei conti in rosso non trovata'; end if;

  execute nuovo;
end $f$;
