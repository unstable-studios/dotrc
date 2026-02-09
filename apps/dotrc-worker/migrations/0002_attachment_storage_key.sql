-- Add storage_key column to attachment_refs for R2 key mapping
ALTER TABLE attachment_refs ADD COLUMN storage_key TEXT;
