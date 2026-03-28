-- Add split_payment_pa column to anagrafica_azienda
-- Default TRUE: split payment è la prassi standard per fatture verso PA

ALTER TABLE public.anagrafica_azienda
ADD COLUMN IF NOT EXISTS split_payment_pa BOOLEAN NOT NULL DEFAULT TRUE;
