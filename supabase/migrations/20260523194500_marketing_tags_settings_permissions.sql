DROP POLICY IF EXISTS "Staff can view marketing tags if permitted" ON public.marketing_tags;
CREATE POLICY "Staff can view marketing tags if permitted"
ON public.marketing_tags FOR SELECT
USING (
  company_id = get_user_company_id(auth.uid())
  AND (
    has_permission(auth.uid(), 'can_view_orders'::text)
    OR has_permission(auth.uid(), 'can_view_settings'::text)
    OR has_permission(auth.uid(), 'can_view_settings_customization'::text)
  )
);

DROP POLICY IF EXISTS "Staff can manage marketing tags customization" ON public.marketing_tags;
CREATE POLICY "Staff can manage marketing tags customization"
ON public.marketing_tags FOR ALL
USING (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND has_permission(auth.uid(), 'can_edit_settings_customization'::text)
);
