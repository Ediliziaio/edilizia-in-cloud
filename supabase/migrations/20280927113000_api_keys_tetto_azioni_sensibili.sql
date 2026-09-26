-- Tetto giornaliero di AZIONI SENSIBILI per chiave API/MCP.
--
-- Le azioni sensibili sono gli invii reali (email, solleciti, follow-up) e gli
-- strumenti con costo AI: quelli dietro scope `actions:sensitive` o `email:send`.
-- Questo tetto è SEPARATO — e molto più basso — del rate limit generale
-- (`rate_limit_per_day`): una chiave può leggere migliaia di volte al giorno ma
-- inviare/spendere solo un numero contenuto di volte. Serve a contenere costi e
-- abusi se l'assistente AI collegato parte per la tangente (es. cento email).
--
-- Il server MCP (platform-mcp) conta le chiamate RIUSCITE (status 200) agli
-- strumenti sensibili nelle ultime 24 h e blocca oltre il tetto.
--
-- Aggiunta di colonna con default costante: cambio di soli metadati, istantaneo
-- anche su tabella grande (nessuna riscrittura).

alter table public.api_keys
  add column if not exists sensitive_actions_per_day integer not null default 100;

comment on column public.api_keys.sensitive_actions_per_day is
  'Tetto giornaliero di azioni sensibili (invii reali, strumenti a costo AI) per questa chiave: separato dal rate limit generale. Il server MCP conta le chiamate riuscite agli strumenti con scope actions:sensitive o email:send.';
