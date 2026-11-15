-- Versamenti fiscali e banca: come le altre letture del controllo di gestione, solo col modulo attivo (15/11/2026)
--
-- Le letture del controllo di gestione chiamate dalla pagina (cg_get_sp_safe e le altre «_safe»)
-- controllano che il modulo sia attivo per l'azienda (_cg_assert_enabled). Lo fa adesso anche
-- cg_get_versamenti_fiscali, che la pagina chiama direttamente.

do $p$
declare
  def text := pg_get_functiondef('public.cg_get_versamenti_fiscali(uuid,integer)'::regprocedure);
  prima text := $a$  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;$a$;
  dopo text := $b$  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  perform public._cg_assert_enabled(v_company_id);$b$;
begin
  if position('_cg_assert_enabled' in def) > 0 then
    return;
  end if;
  if (length(def) - length(replace(def, prima, ''))) / length(prima) <> 1 then
    raise exception 'cg_get_versamenti_fiscali: controllo dell''azienda non trovato una volta sola, la funzione è cambiata';
  end if;
  execute replace(def, prima, dopo);
end $p$;
