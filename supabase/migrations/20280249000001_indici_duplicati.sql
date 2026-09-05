-- Advisor performance: tre coppie di indici identici. Un indice doppio non
-- serve a niente in lettura e raddoppia il lavoro a ogni scrittura, oltre a
-- occupare spazio. Si tiene quello col nome piu' chiaro e si droppa l'altro.

-- contact_id: due nomi, stesso btree.
DROP INDEX IF EXISTS public.aedix_service_clients_contact_idx;

-- (api_key_id, created_at DESC): tengo _key_time, che descrive le colonne;
-- _key da solo e' fuorviante perche' l'indice non e' solo sulla chiave.
DROP INDEX IF EXISTS public.idx_api_usage_log_key;

-- (company_id, province): due prefissi diversi per la stessa cosa.
DROP INDEX IF EXISTS public.idx_mc_company_province;
