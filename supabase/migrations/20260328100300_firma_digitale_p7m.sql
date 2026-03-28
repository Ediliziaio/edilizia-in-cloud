-- GAP3: Supporto firma digitale p7m per fatture PA
-- Le fatture verso la PA (FPA12) devono essere firmate digitalmente (CAdES-BES)

-- Aggiungi colonne per tracciare lo stato della firma
ALTER TABLE public.documenti_fiscali
ADD COLUMN IF NOT EXISTS sdi_firmato boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sdi_file_p7m_url text;
