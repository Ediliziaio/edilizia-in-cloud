-- La company piattaforma (Platform Admin CRM) è l'unica legittima proprietaria
-- di mkt.ediliziaincloud.com (verificato su Elastic Email: SPF+DKIM). Senza una
-- riga in company_email_domains il gate anti-spam bloccava l'email marketing
-- DELL'ADMIN stesso. La regola "usa il tuo dominio" vale per i tenant clienti,
-- non per la piattaforma che possiede l'infrastruttura.
-- is_verified è una colonna generata → non inseribile.

WITH upserted_domain AS (
  INSERT INTO public.company_email_domains (
    company_id, domain, from_email, from_name,
    ee_domain_added, ee_spf_verified, ee_dkim_verified, ee_tracking_verified,
    is_active, verified_at, last_verified_at, updated_at
  )
  VALUES (
    '00000000-0000-0000-0000-000000000001',
    'mkt.ediliziaincloud.com',
    'no-reply',
    'EdiliziaInCloud',
    true, true, true, true,
    true, now(), now(), now()
  )
  ON CONFLICT (company_id, domain) DO UPDATE SET
    ee_domain_added = true,
    ee_spf_verified = true,
    ee_dkim_verified = true,
    is_active = true,
    verified_at = COALESCE(public.company_email_domains.verified_at, now()),
    updated_at = now()
  RETURNING id
)
UPDATE public.company_email_preferences p
SET marketing_domain_id = d.id,
    sender_name = COALESCE(NULLIF(p.sender_name, 'Platform Admin CRM'), 'EdiliziaInCloud'),
    reply_to_email = CASE
      WHEN p.reply_to_email = 'platform@internal.local' THEN 'no-reply@mkt.ediliziaincloud.com'
      ELSE p.reply_to_email
    END,
    updated_at = now()
FROM upserted_domain d
WHERE p.company_id = '00000000-0000-0000-0000-000000000001';
