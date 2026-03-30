-- Allow staff to update their own must_change_password flag
DROP POLICY IF EXISTS "Staff can update their own password flag" ON public.staff_permissions;
CREATE POLICY "Staff can update their own password flag"
ON public.staff_permissions
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());