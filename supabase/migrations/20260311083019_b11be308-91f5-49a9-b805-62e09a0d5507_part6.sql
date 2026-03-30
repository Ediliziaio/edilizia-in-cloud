DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sales_playbook_completions' AND policyname = 'playbook_completions_company_isolation'
  ) THEN
    DROP POLICY IF EXISTS "playbook_completions_company_isolation" ON sales_playbook_completions;
CREATE POLICY "playbook_completions_company_isolation"
      ON sales_playbook_completions FOR ALL
      USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
  END IF;
END $$;
