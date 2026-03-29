-- 3) Replace generic ticket trigger with specific ones
DROP TRIGGER IF EXISTS trg_internal_auto_ticket_updated ON tickets;
