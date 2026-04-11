-- Add missing columns to tickets table for campo ticket creation.
-- The original table only has: id, order_id, company_id, customer_id, subject, status, created_at, updated_at, fonte.
-- The campo ticket form needs: titolo, descrizione, priorita, created_by.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='titolo') THEN
    ALTER TABLE tickets ADD COLUMN titolo TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='descrizione') THEN
    ALTER TABLE tickets ADD COLUMN descrizione TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='priorita') THEN
    ALTER TABLE tickets ADD COLUMN priorita TEXT DEFAULT 'media' CHECK (priorita IN ('bassa','media','alta','urgente'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tickets' AND column_name='created_by') THEN
    ALTER TABLE tickets ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Make customer_id nullable (campo tickets don't have a customer, they're from employees)
ALTER TABLE tickets ALTER COLUMN customer_id DROP NOT NULL;

-- RLS: allow employees to insert tickets for their company
DROP POLICY IF EXISTS tickets_campo_insert ON tickets;
CREATE POLICY tickets_campo_insert ON tickets FOR INSERT WITH CHECK (
  created_by = auth.uid()
  OR customer_id = auth.uid()
);

-- RLS: allow employees to read their own tickets
DROP POLICY IF EXISTS tickets_campo_select ON tickets;
CREATE POLICY tickets_campo_select ON tickets FOR SELECT USING (
  created_by = auth.uid()
  OR customer_id = auth.uid()
  OR company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
);
