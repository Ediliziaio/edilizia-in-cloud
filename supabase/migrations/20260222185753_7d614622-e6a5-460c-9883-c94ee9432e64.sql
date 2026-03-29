ALTER TABLE marketing_contact_activities
  ADD CONSTRAINT fk_activities_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);
