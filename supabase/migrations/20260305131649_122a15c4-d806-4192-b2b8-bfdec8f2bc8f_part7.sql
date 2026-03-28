-- 4. Aggiorna create_order_atomic per supportare installments
DROP FUNCTION IF EXISTS public.create_order_atomic(jsonb, jsonb, jsonb, uuid);
