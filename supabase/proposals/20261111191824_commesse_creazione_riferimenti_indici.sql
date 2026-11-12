-- Indici di supporto dei riferimenti interni, senza esposizione al client.
create index if not exists order_creation_requests_order_idx on private.order_creation_requests(order_id);
create index if not exists order_creation_requests_actor_idx on private.order_creation_requests(actor_id);
