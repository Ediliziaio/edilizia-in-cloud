-- I crediti verso clienti al netto delle note di credito (9 novembre 2026).
--
-- Una nota di credito ha `total` positivo e `paid_amount` a zero — non si
-- incassa, per definizione — quindi finiva nei crediti come se fosse una
-- fattura da riscuotere. Su più di un'azienda la maggior parte del credito
-- esposto erano note di credito: il valore vero era una frazione di quello.
--
-- Si riscrive solo quel blocco, prendendo la funzione com'è adesso e
-- sostituendo le righe dei crediti: tutto il resto resta identico, parola
-- per parola. Se il blocco non si trova più — perché qualcuno l'ha già
-- cambiato — la migrazione si ferma invece di riscrivere a caso.
--
-- Nota su cosa fa venire a galla: dove le note di credito superano le
-- fatture ancora aperte, il netto diventa negativo. Non è un errore del
-- calcolo: vuol dire che in quell'azienda le note di credito non sono
-- agganciate alle fatture che rettificano, e quelle fatture risultano già
-- incassate. Il numero sbagliato c'era anche prima, col segno opposto e
-- molto più grande.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_def text;
  v_vecchio text := '  SELECT COALESCE(sum(GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)), 0)
  INTO v_crediti_clienti';
  v_nuovo text := '  -- Una nota di credito abbassa il credito: non è un importo da incassare.
  SELECT COALESCE(sum(
           CASE WHEN i.document_type = ''credit_note'' THEN -1 ELSE 1 END
           * GREATEST(COALESCE(i.total, 0) - COALESCE(i.paid_amount, 0), 0)
         ), 0)
  INTO v_crediti_clienti';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'cg_get_stato_patrimoniale_riclassificato';

  if v_def is null then
    raise exception 'cg_get_stato_patrimoniale_riclassificato non esiste';
  end if;

  -- Già corretta: la migrazione può girare due volte senza fare danni.
  if position(v_nuovo in v_def) > 0 then
    return;
  end if;
  if position(v_vecchio in v_def) = 0 then
    raise exception 'Il blocco dei crediti verso clienti è cambiato: controllalo a mano invece di riscriverlo';
  end if;

  execute replace(v_def, v_vecchio, v_nuovo);
end $$;
