ALTER TABLE marketing_contact_activities
  DROP CONSTRAINT IF EXISTS fk_activities_created_by,
  ADD CONSTRAINT fk_activities_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);
