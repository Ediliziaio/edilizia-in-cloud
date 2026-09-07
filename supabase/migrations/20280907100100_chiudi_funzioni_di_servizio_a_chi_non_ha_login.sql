-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- Verificato chiamandole senza alcun login, con la sola chiave pubblica del
-- frontend: si eseguivano tutte.
--   campo_notifica            -> 200  crea una notifica per un utente qualsiasi
--   campo_push_invia          -> 204  invia una push a utenti qualsiasi
--   cliente_notifica_invia    -> 204  notifica al cliente
--   seed_quote_templates      -> 409  errore di chiave esterna: era arrivata a scrivere
--   policy_riscrivi_initplan  -> 404  "relation does not exist": si era eseguita e
--                                     mancava solo il nome di una tabella vera.
--                                     E' SECURITY DEFINER e riscrive le POLICY.
--
-- Nessuna di queste e' citata dentro una policy RLS (verificato su pg_policies),
-- quindi la revoca non rende illeggibile nessuna tabella: e' il caso opposto a
-- quello degli aiutanti, dove revocare romperebbe le pagine pubbliche.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'campo_notifica', 'campo_push_invia', 'cliente_notifica_invia',
        'seed_quote_templates', 'policy_riscrivi_initplan', 'espressione_initplan',
        'campo_promemoria', 'data_attesa_rata', 'data_pagamento_uscita'
      )
  loop
    execute format('revoke all on function %s from public, anon', f.firma);
    execute format('grant execute on function %s to authenticated, service_role', f.firma);
  end loop;
end $$;

-- Gli strumenti che riscrivono lo schema non li chiama nemmeno un utente
-- autenticato: restano a chi amministra il database.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('policy_riscrivi_initplan', 'espressione_initplan')
  loop
    execute format('revoke all on function %s from authenticated', f.firma);
  end loop;
end $$;
