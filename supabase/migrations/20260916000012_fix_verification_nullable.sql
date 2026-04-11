-- Fix: supplier_document_url and supplier_document_type should be nullable
-- In "auto" mode there is no supplier document
ALTER TABLE purchase_order_verifications
  ALTER COLUMN supplier_document_url DROP NOT NULL,
  ALTER COLUMN supplier_document_type DROP NOT NULL;

-- Set defaults for existing NULLs
ALTER TABLE purchase_order_verifications
  ALTER COLUMN supplier_document_url SET DEFAULT '',
  ALTER COLUMN supplier_document_type SET DEFAULT '';
