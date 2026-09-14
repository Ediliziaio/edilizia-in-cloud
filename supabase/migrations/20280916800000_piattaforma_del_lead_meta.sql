-- Facebook o Instagram: da dove arriva un lead Meta.
--
-- BeMade, 14/09: nel registro attività si leggeva solo «Fonte: Meta Lead Ads».
-- Campagna e inserzione erano già salvate (attr_campaign, attr_content), la
-- piattaforma no: attr_source era scritto fisso a "facebook" anche per i
-- lead nati su Instagram. meta-process-leads la chiede a Meta a parte e la
-- scrive qui; i lead già entrati restano vuoti.

ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS meta_platform text;

COMMENT ON COLUMN public.marketing_contacts.meta_platform IS
  'Piattaforma del lead Meta (campo platform del lead Graph): facebook, instagram, messenger, audience_network.';
