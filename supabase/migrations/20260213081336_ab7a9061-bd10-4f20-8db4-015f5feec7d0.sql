
ALTER TABLE subscription_plans 
ADD COLUMN included_modules jsonb DEFAULT '["orders","warehouse","calendar","customers","employees","tickets","forecast"]'::jsonb;

UPDATE subscription_plans SET included_modules = '["orders","warehouse","calendar","customers","employees","tickets","forecast"]'::jsonb;
