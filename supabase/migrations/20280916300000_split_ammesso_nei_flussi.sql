-- Lo "Split A/B" delle automazioni si può salvare.
--
-- L'editor dei flussi propone il nodo "Split A/B" e il motore (process-automation)
-- lo sa eseguire — `case "split"` e rami "A: …%" / "B: …%" — ma il vincolo sulla
-- tabella ammetteva solo trigger, action, condition, delay e goal. Ogni split
-- veniva rifiutato al salvataggio: in tutto il database non ce n'è mai stato uno.
--
-- Serve adesso per BeMade: i lead del flusso "FB - Nuovo" vanno divisi tra due
-- call center, 60% e 40%.
alter table public.automation_nodes
  drop constraint if exists automation_nodes_node_type_check;

alter table public.automation_nodes
  add constraint automation_nodes_node_type_check
  check (node_type = any (array['trigger', 'action', 'condition', 'delay', 'goal', 'split']));
