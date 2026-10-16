-- Il permesso dipende dall'utente, non dalla singola fase: un InitPlan per query.
-- Nessun cambio di ruoli, isolamento aziendale, visibilità o WITH CHECK.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
DO $migration$
DECLARE r record; old_call text; new_call text; q text; chk text;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname='has_permission' AND provolatile<>'s') THEN
    RAISE EXCEPTION 'has_permission deve restare STABLE';
  END IF;
  FOR r IN SELECT p.polname,p.polrelid,pg_get_expr(p.polqual,p.polrelid) AS qual,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
    FROM pg_policy p WHERE p.polrelid='public.order_work_phases'::regclass
      AND p.polname IN ('Staff can manage order work phases if permitted','order_work_phases_lettura_public')
  LOOP
    old_call:=format('has_permission(( SELECT auth.uid() AS uid), %L::text)',
      CASE WHEN r.polname='order_work_phases_lettura_public' THEN 'can_view_orders' ELSE 'can_edit_orders' END);
    new_call:='( SELECT '||old_call||')';
    IF strpos(r.qual,new_call)>0 THEN CONTINUE; END IF;
    IF strpos(r.qual,old_call)=0 THEN
      RAISE EXCEPTION 'Policy % cambiata: verificare prima di procedere',r.polname;
    END IF;
    q:=replace(r.qual,old_call,new_call);
    chk:=replace(r.check_expr,old_call,new_call);
    EXECUTE format('ALTER POLICY %I ON %s USING (%s)%s',r.polname,r.polrelid::regclass,q,
      CASE WHEN chk IS NULL THEN '' ELSE format(' WITH CHECK (%s)',chk) END);
  END LOOP;
END;
$migration$;
