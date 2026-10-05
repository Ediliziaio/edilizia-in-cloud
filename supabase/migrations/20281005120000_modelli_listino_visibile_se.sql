-- I modelli di listino portano anche la condizione di visibilità delle varianti (visibile_se, 05/10/2026):
-- il monoblocco («Con monoblocco» accende altezza cassonetto, tapparella, colori, zanzariera) viaggia con i prodotti.
-- Si ritoccano le due funzioni esistenti sul loro testo; se sono già ritoccate non cambia nulla (idempotente).
do $mig$
declare
  d text;
  f text;
begin
  f := 'public.listino_modello_fotografia(uuid,uuid[],boolean)';
  select pg_get_functiondef(f::regprocedure) into d;
  if position($x$'visibile_se'$x$ in d) = 0 then
    if position($x$'obbligatorio', a.obbligatorio,$x$ in d) = 0 then raise exception 'fotografia: punto di inserimento non trovato'; end if;
    d := replace(d, $x$'obbligatorio', a.obbligatorio,$x$, $x$'obbligatorio', a.obbligatorio,
                      'visibile_se', a.visibile_se,$x$);
    execute d;
  end if;

  f := 'public.listino_modello_installa(uuid,uuid,text[])';
  select pg_get_functiondef(f::regprocedure) into d;
  if position($x$visibile_se$x$ in d) = 0 then
    if position($x$(family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)$x$ in d) = 0
       or position($x$coalesce((v_a ->> 'sort_order')::int, 0))
        returning id into v_ax;$x$ in d) = 0 then raise exception 'installa: punto di inserimento non trovato'; end if;
    d := replace(d, $x$(family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)$x$,
                    $x$(family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order, visibile_se)$x$);
    d := replace(d, $x$coalesce((v_a ->> 'sort_order')::int, 0))
        returning id into v_ax;$x$,
                    $x$coalesce((v_a ->> 'sort_order')::int, 0),
           case when jsonb_typeof(v_a -> 'visibile_se') = 'object' then v_a -> 'visibile_se' else null end)
        returning id into v_ax;$x$);
    execute d;
  end if;
end
$mig$;
