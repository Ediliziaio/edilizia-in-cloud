SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '3s';
-- Stessi utenti e stesse fonti visibili. I controlli invarianti vengono
-- valutati una volta per statement, non per ogni voce del prezzario.
ALTER POLICY pz_fonte_select ON public.prezzario_fonte
  USING (stato = 'pubblicato' OR (SELECT public.is_super_admin()));
ALTER POLICY pz_fonte_write ON public.prezzario_fonte
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
ALTER POLICY pz_voce_select ON public.prezzario_voce
  USING ((SELECT public.is_super_admin()) OR fonte_id IN
    (SELECT f.id FROM public.prezzario_fonte f WHERE f.stato = 'pubblicato'));
ALTER POLICY pz_voce_write ON public.prezzario_voce
  USING ((SELECT public.is_super_admin())) WITH CHECK ((SELECT public.is_super_admin()));
