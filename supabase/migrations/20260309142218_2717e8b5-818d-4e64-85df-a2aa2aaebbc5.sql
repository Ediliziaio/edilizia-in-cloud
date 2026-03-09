
-- Attach missing triggers for internal automations

CREATE OR REPLACE TRIGGER internal_auto_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('order_created', 'order');

CREATE OR REPLACE TRIGGER internal_auto_order_status
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_order_status();

CREATE OR REPLACE TRIGGER internal_auto_ticket_created
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('ticket_created', 'ticket');

CREATE OR REPLACE TRIGGER internal_auto_ticket_status
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_ticket_events();

CREATE OR REPLACE TRIGGER internal_auto_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('task_created', 'task');

CREATE OR REPLACE TRIGGER internal_auto_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_task_events();

CREATE OR REPLACE TRIGGER internal_auto_employee_added
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('employee_added', 'employee');

CREATE OR REPLACE TRIGGER internal_auto_warehouse_low
  AFTER UPDATE ON public.warehouse_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_auto_stock_events();

CREATE OR REPLACE TRIGGER internal_auto_cost_added
  AFTER INSERT ON public.company_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('cost_added', 'cost');
