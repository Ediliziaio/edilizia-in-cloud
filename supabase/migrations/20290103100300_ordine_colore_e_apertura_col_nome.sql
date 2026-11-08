-- Sull'ordine al fornitore il colore usciva come codice («Colore: 85f90cdd-…»): sulla riga c'è l'id del
-- valore del listino. Trovato dalla simulazione dell'8/11/2026. Ora si legge il nome; un codice che non
-- si risolve non si stampa. Solo funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.valore_asse_leggibile(p text)
returns text language sql stable set search_path to 'public' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (select nullif(btrim(v.label), '') from public.article_family_axis_values v where v.id = p::uuid)
    else nullif(btrim(p), '') end
$$;
revoke all on function public.valore_asse_leggibile(text) from public, anon;
grant execute on function public.valore_asse_leggibile(text) to authenticated, service_role;

do $migrazione$
declare
  def text;
  a text := E'select v into colore from jsonb_each_text(oi.axis_selections) a(k, v)';
  b text := E'select v into apertura from jsonb_each_text(oi.axis_selections) a(k, v)';
begin
  def := pg_get_functiondef('public.riga_misure_ordine(public.order_items)'::regprocedure);
  if position('valore_asse_leggibile' in def) = 0 then
    if position(a in def) = 0 or position(b in def) = 0 then raise exception 'testo non trovato'; end if;
    def := replace(def, a, E'select public.valore_asse_leggibile(v) into colore from jsonb_each_text(oi.axis_selections) a(k, v)');
    def := replace(def, b, E'select public.valore_asse_leggibile(v) into apertura from jsonb_each_text(oi.axis_selections) a(k, v)');
    execute def;
  end if;
end $migrazione$;
