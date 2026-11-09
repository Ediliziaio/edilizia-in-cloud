-- signature_requests ha il GRANT per colonna: quella del rendiconto serve allo stato di firma in ufficio.
set local lock_timeout = '3s';
grant select (appalto_sal_id) on public.signature_requests to authenticated;
