ALTER TABLE brands ADD COLUMN avatar_id uuid REFERENCES attachments(id);
ALTER TABLE brands ADD COLUMN banner_id uuid REFERENCES attachments(id);
