-- Seed 5 render credits for all existing companies (test/dev purposes)
-- ON CONFLICT DO NOTHING ensures existing balances are not overwritten
INSERT INTO render_credits (company_id, balance)
SELECT id, 5
FROM companies
ON CONFLICT (company_id) DO NOTHING;
