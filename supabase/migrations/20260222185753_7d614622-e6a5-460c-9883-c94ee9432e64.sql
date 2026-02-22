
ALTER TABLE marketing_contact_activities
  ADD CONSTRAINT fk_activities_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE marketing_contact_notes
  ADD CONSTRAINT fk_notes_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);
