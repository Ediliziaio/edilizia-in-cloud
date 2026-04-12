-- Permetti a operai e subappaltatori di creare e aggiornare le proprie attività
-- INSERT: possono creare task assegnati a se stessi
-- UPDATE: possono aggiornare task assegnati a se stessi (cambio stato, note, ecc.)

-- INSERT policy per campo users
DROP POLICY IF EXISTS "Employees can create own tasks" ON public.tasks;
CREATE POLICY "Employees can create own tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    assigned_to = auth.uid()
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- UPDATE policy per campo users
DROP POLICY IF EXISTS "Employees can update assigned tasks" ON public.tasks;
CREATE POLICY "Employees can update assigned tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());
