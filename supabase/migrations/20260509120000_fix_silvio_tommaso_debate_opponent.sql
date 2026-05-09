-- Fix data quality per Silvio Superadmin 21 personas:
-- la migration iniziale aveva un refuso ("gabriese") che rompeva il debate/handoff
-- di Tommaso verso Gabriele nelle installazioni gia migrate.

UPDATE public.silvio_admin_personas
SET debate_opponent = 'gabriele'
WHERE persona_key = 'tommaso'
  AND debate_opponent = 'gabriese';
