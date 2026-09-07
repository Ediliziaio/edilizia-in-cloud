-- Coerenza con la bonifica «delle 235 funzioni aperte ad anon ne restano 43»:
-- `ticket_segna_richiamo` era nata col GRANT EXECUTE implicito a PUBLIC, quindi
-- raggiungibile da anon. Le RLS la fermerebbero comunque (è SECURITY INVOKER),
-- ma una funzione che scrive sui ticket non ha motivo di essere esposta.
REVOKE ALL ON FUNCTION public.ticket_segna_richiamo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ticket_segna_richiamo(uuid, text) TO authenticated;
