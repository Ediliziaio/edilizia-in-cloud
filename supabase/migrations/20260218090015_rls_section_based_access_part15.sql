-- external_team_attachments — documenti contratti squadre esterne
CREATE POLICY "Staff can view external team attachments if permitted"
  ON public.external_team_attachments FOR SELECT
  USING (
    has_permission(auth.uid(), 'can_view_orders'::text)
    AND EXISTS (
      SELECT 1 FROM public.external_teams t
      WHERE t.id = external_team_attachments.external_team_id
        AND t.company_id = get_user_company_id(auth.uid())
    )
  );
