-- `chiave` è anche una variabile della funzione: «on conflict (company_id, chiave)» era ambiguo
-- e la creazione della commessa falliva. Trovato dalla simulazione dell'8/11/2026, si usa il vincolo per nome.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $migrazione$
declare
  def text;
  vecchio text := 'on conflict (company_id, chiave) do update';
begin
  def := pg_get_functiondef('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])'::regprocedure);
  if position(vecchio in def) > 0 then
    def := replace(def, vecchio, 'on conflict on constraint voci_materiale_scelte_pkey do update');
    execute def;
  end if;
end $migrazione$;
