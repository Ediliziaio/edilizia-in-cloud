set local lock_timeout='3s';set local statement_timeout='60s';
-- La stessa uscita può essere attribuita al medesimo SAL in più passaggi,
-- ciascuno idempotente. Non cambia la quantità di denaro registrato.
alter table public.sal_sub_pagamenti drop constraint if exists sal_sub_pagamenti_pkey;
alter table public.sal_sub_pagamenti add primary key(company_id,request_id);
