-- Stato patrimoniale: i lavori in corso tra le attività (15/11/2026)
--
-- Il conto economico porta nell'utile la VARIAZIONE dei lavori in corso
-- (cg_variazione_lavori_in_corso: fine anno − anno prima). Lo stato
-- patrimoniale prendeva quell'utile ma non aveva tra le attività il VALORE dei
-- lavori in corso: la differenza tra attivo e passivo nasceva dalla
-- costruzione, non dai dati.
--
-- Adesso «Lavori in corso» sta nell'attivo circolante, accanto al magazzino,
-- con la stessa regola del conto economico: valore dell'anno prima registrato
-- (cg_rimanenze_lavori) + la variazione dell'anno. Senza il valore dell'anno
-- prima la variazione nel conto economico è zero e qui la riga resta a zero:
-- i due prospetti dicono la stessa cosa.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $f$
declare def text; nuovo text;
begin
  def := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato'::regproc);
  if position('v_lavori_corso' in def) > 0 then return; end if;  -- già fatto
  nuovo := def;
  nuovo := replace(nuovo, $a$  v_rimanenze numeric(14,2) := 0;$a$,
                          $b$  v_rimanenze numeric(14,2) := 0;
  v_lavori_corso numeric(14,2) := 0;$b$);
  nuovo := replace(nuovo, $a$  WHERE company_id = v_company_id AND quantity > 0;$a$,
                          $b$  WHERE company_id = v_company_id AND quantity > 0;

  -- Lavori in corso: stessa regola della voce 02 del conto economico.
  SELECT COALESCE(r.importo + public.cg_variazione_lavori_in_corso(v_company_id, p_anno), 0)
    INTO v_lavori_corso
    FROM public.cg_rimanenze_lavori r
   WHERE r.company_id = v_company_id AND r.esercizio = p_anno - 1;
  v_lavori_corso := COALESCE(v_lavori_corso, 0);$b$);
  nuovo := replace(nuovo, $a$v_attivo_circ := v_rimanenze + v_liq_diff + v_liq_imm + v_ratei_att;$a$,
                          $b$v_attivo_circ := v_rimanenze + v_lavori_corso + v_liq_diff + v_liq_imm + v_ratei_att;$b$);
  nuovo := replace(nuovo, $a$      'rimanenze',       v_rimanenze,$a$,
                          $b$      'rimanenze',       v_rimanenze,
      'lavori_in_corso', v_lavori_corso,$b$);
  if (length(nuovo) - length(replace(nuovo, 'v_lavori_corso', ''))) / length('v_lavori_corso') < 5 then
    raise exception 'Stato patrimoniale: non tutti i punti da cambiare sono stati trovati, la funzione è cambiata';
  end if;
  execute nuovo;
end $f$;
