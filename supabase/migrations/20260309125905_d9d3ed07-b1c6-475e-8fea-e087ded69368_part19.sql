CREATE POLICY "partners_view_materials" ON public.partner_materials FOR SELECT TO authenticated
USING (
  is_active = true AND
  EXISTS (
    SELECT 1 FROM referrers r
    JOIN referral_tiers t ON r.tier_id = t.id
    JOIN referral_tiers mt ON public.partner_materials.min_tier = mt.slug
    WHERE r.user_id = auth.uid()
    AND t.position >= mt.position
  )
);
