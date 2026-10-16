-- Spezza l'espansione ripetuta della RLS orders nei piani delle fasi.
-- SECURITY INVOKER: le policy orders si applicano ancora all'utente chiamante.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
CREATE OR REPLACE FUNCTION public._order_visible_under_rls(p_order_id uuid,p_check_assignment boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id=p_order_id
      AND (NOT p_check_assignment OR public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id))
  );
$fn$;
REVOKE ALL ON FUNCTION public._order_visible_under_rls(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._order_visible_under_rls(uuid,boolean) TO anon,authenticated,service_role;

DO $migration$
DECLARE r record; old_expr text; new_expr text; updated_qual text; updated_check text; command text; found_count int:=0;
BEGIN
  FOR r IN SELECT policyname,qual,with_check FROM pg_policies
    WHERE schemaname='public' AND tablename='order_work_phases'
      AND policyname IN ('order_work_phases_lettura_public','Staff can manage order work phases if permitted')
  LOOP
    found_count:=found_count+1;
    IF strpos(r.qual,'_order_visible_under_rls(')>0 THEN CONTINUE; END IF;
    IF r.policyname='order_work_phases_lettura_public' THEN
      old_expr:=E'EXISTS ( SELECT 1\n   FROM orders o\n  WHERE (o.id = order_work_phases.order_id))';
      new_expr:='public._order_visible_under_rls(order_id,false)';
    ELSE
      old_expr:=E'EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_work_phases.order_id) AND can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)))';
      new_expr:='public._order_visible_under_rls(order_id,true)';
    END IF;
    IF strpos(r.qual,old_expr)=0 THEN
      RAISE EXCEPTION 'Policy % diversa dalla versione verificata: nessuna modifica',r.policyname;
    END IF;
    updated_qual:=replace(r.qual,old_expr,new_expr);
    command:=format('ALTER POLICY %I ON public.order_work_phases USING (%s)',r.policyname,updated_qual);
    IF r.with_check IS NOT NULL THEN
      updated_check:=replace(r.with_check,old_expr,new_expr);
      command:=command||format(' WITH CHECK (%s)',updated_check);
    END IF;
    EXECUTE command;
  END LOOP;
  IF found_count<>2 THEN RAISE EXCEPTION 'Mancano le due policy attese'; END IF;
END;
$migration$;
