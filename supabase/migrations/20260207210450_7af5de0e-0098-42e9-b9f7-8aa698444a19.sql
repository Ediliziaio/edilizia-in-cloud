-- Add vat_rate column to suppliers table (default VAT rate for the supplier)
ALTER TABLE public.suppliers ADD COLUMN vat_rate numeric DEFAULT 22;

-- Add vat_rate column to order_items table (inherits from supplier but can be overridden)
ALTER TABLE public.order_items ADD COLUMN vat_rate numeric DEFAULT 22;

-- Add vat_rate column to external_teams table (default VAT rate for the team)
ALTER TABLE public.external_teams ADD COLUMN vat_rate numeric DEFAULT 22;

-- Add vat_rate column to order_external_teams table (inherits from team but can be overridden)
ALTER TABLE public.order_external_teams ADD COLUMN vat_rate numeric DEFAULT 22;

-- Add comments for documentation
COMMENT ON COLUMN public.suppliers.vat_rate IS 'Default VAT rate for this supplier (22 for Italy, 0 for foreign/reverse charge)';
COMMENT ON COLUMN public.order_items.vat_rate IS 'VAT rate for this item purchase (inherited from supplier, can be overridden)';
COMMENT ON COLUMN public.external_teams.vat_rate IS 'Default VAT rate for this external team (22 for ordinary, 0 for flat-rate/exempt)';
COMMENT ON COLUMN public.order_external_teams.vat_rate IS 'VAT rate for this assignment (inherited from team, can be overridden)';