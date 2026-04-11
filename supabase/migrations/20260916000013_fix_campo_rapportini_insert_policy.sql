-- Fix RLS policy on campo_rapportini to allow insert for employees
-- assigned via order_employees (not only order_campo_assignments).
-- The trigger on order_campo_assignments is broken (references non-existent
-- chat_channels table), so employees are assigned through order_employees.

DROP POLICY IF EXISTS cr_insert ON campo_rapportini;

CREATE POLICY cr_insert ON campo_rapportini FOR INSERT WITH CHECK (
  user_id = auth.uid()
  AND (
    -- Check order_campo_assignments (legacy)
    EXISTS (
      SELECT 1 FROM order_campo_assignments oca
      WHERE oca.order_id = campo_rapportini.order_id
        AND oca.user_id = auth.uid()
    )
    OR
    -- Check order_employees (employee linked to user via employees table)
    EXISTS (
      SELECT 1 FROM order_employees oe
      JOIN employees e ON e.id = oe.employee_id
      WHERE oe.order_id = campo_rapportini.order_id
        AND e.user_id = auth.uid()
    )
  )
);
