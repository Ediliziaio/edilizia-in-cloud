-- La simulazione dell'8/11/2026 su un bagno vero: 20 voci proposte su 20, comprese demolizioni,
-- macerie e pulizie, perché le stime AI mettono un costo materiali su tutto. Una voce si propone da
-- ordinare se ha marca o prodotto, oppure un costo materiali e non è una lavorazione. Le altre
-- restano selezionabili a mano nell'anteprima. Solo funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.voce_si_compra(p_descrizione text, p_costo_materiali numeric, p_marca text, p_modello text, p_famiglia text)
returns boolean language sql immutable set search_path to 'public' as $$
  select nullif(btrim(coalesce(p_marca, '')), '') is not null
      or nullif(btrim(coalesce(p_modello, '')), '') is not null
      or nullif(btrim(coalesce(p_famiglia, '')), '') is not null
      or (coalesce(p_costo_materiali, 0) > 0
          and (lower(coalesce(p_descrizione, '')) ~ 'fornitura'
               or lower(btrim(coalesce(p_descrizione, ''))) !~ '^(smontagg|demoli|rimozion|trasport|smaltim|pulizi|tinteggi|imbiancat|impermeabilizz|massett|assistenz|nuovo impianto|impianto|rifaciment|manodopera|posa\y|allestiment|ponteggi|collaud|sopralluog|progett|pratic)')
         )
$$;
revoke all on function public.voce_si_compra(text, numeric, text, text, text) from public, anon;
grant execute on function public.voce_si_compra(text, numeric, text, text, text) to authenticated, service_role;

do $migrazione$
declare
  def text;
  vecchio text := E'proposta := coalesce((r->>''costo_materiali'')::numeric,0) > 0
        or nullif(r->>''marca'','''') is not null or nullif(r->>''modello'','''') is not null or nullif(r->>''famiglia_id'','''') is not null;';
begin
  def := pg_get_functiondef('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])'::regprocedure);
  if position('voce_si_compra' in def) = 0 then
    if position(vecchio in def) = 0 then raise exception 'proposta non trovata'; end if;
    def := replace(def, vecchio, E'proposta := public.voce_si_compra(r->>''descrizione'', (r->>''costo_materiali'')::numeric, r->>''marca'', r->>''modello'', r->>''famiglia_id'');');
    execute def;
  end if;
end $migrazione$;
