CREATE OR REPLACE FUNCTION public.scollega_rata_fattura(p_rata_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  SELECT o.company_id INTO v_company
    FROM public.order_installments oi JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.id = p_rata_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Rata non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- come per collegarla: chi modifica le commesse, gestisce i pagamenti o fa le fatture
  IF auth.uid() IS NOT NULL
     AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_manage_payments', v_company), false)
     AND NOT coalesce(public.puo_gestire_documento_fiscale(v_company, 'fattura'), false) THEN
    RAISE EXCEPTION 'Non hai il permesso di staccare le fatture dalle rate.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.order_installments SET documento_fiscale_id = NULL WHERE id = p_rata_id;
END;
$function$
