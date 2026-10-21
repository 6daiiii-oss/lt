-- Keep uploaded images with the database across server restarts and deploys.
-- Existing file uploads remain readable and are retained on their next access.
ALTER TABLE attachments ADD COLUMN content bytea;
ALTER TABLE attachments ADD CONSTRAINT attachment_content_size CHECK (content IS NULL OR octet_length(content)=size);
