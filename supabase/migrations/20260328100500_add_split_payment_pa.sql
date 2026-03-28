-- Add split_payment_pa column to anagrafica_azienda
-- Default TRUE: split payment è la prassi standard per fatture verso PA

ALTER TABLE public.anagrafica_azienda
ADD COLUMN IF NOT EXISTS split_payment_pa BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.anagrafica_azienda.split_payment_pa
IS 'Abilita scissione dei pagamenti (split payment) per fatture verso Pubblica Amministrazione. Quando attivo, EsigibilitaIVA = S e IVA non inclusa nel totale da pagare.';
