-- ═══════════════════════════════════════════════════════════════════
-- PROPOSTA (NON è una migration — richiede decisione di business)
-- Audit referral 2026-07-09: il motore commissioni e la landing
-- /diventa-partner raccontano due programmi diversi.
--
--   Motore reale (referral_tiers oggi in prod):
--     Bronze   0 aziende → 20% × 1.00 = 20.0% effettivo
--     Silver   3 aziende → 24% × 1.15 = 27.6% effettivo
--     Gold    10 aziende → 30% × 1.25 = 37.5% effettivo
--     Platinum 25 aziende → 30% × 1.40 = 42.0% effettivo
--
--   Business plan promesso dalla landing /diventa-partner:
--     Partner   dal 1° cliente → 15%
--     Silver    da 6 clienti  → 20%
--     Gold      da 16 clienti → 25%
--     Platinum  da 31 clienti → 30%
--
-- Il motore paga FINO AL 42% dove la landing promette max 30%: se il
-- programma parte con i tier attuali, i payout superano il business plan
-- del 30-40%. Questa proposta allinea i tier al business plan (multiplier
-- neutralizzato a 1.00, la % è tutta in commission_plan_pct).
--
-- APPLICARE SOLO DOPO CONFERMA — il programma ha 0 partner attivi, quindi
-- non c'è retroattività da gestire: è il momento giusto per decidere.
-- ═══════════════════════════════════════════════════════════════════

update referral_tiers set name = 'Partner',  min_active_companies = 0,  commission_plan_pct = 15, commission_multiplier = 1.00 where slug = 'bronze';
update referral_tiers set name = 'Silver',   min_active_companies = 6,  commission_plan_pct = 20, commission_multiplier = 1.00 where slug = 'silver';
update referral_tiers set name = 'Gold',     min_active_companies = 16, commission_plan_pct = 25, commission_multiplier = 1.00 where slug = 'gold';
update referral_tiers set name = 'Platinum', min_active_companies = 31, commission_plan_pct = 30, commission_multiplier = 1.00 where slug = 'platinum';

-- Nota collegata (non SQL): la landing promette anche che "la commissione
-- matura quando il cliente paga la fattura", ma calculate_monthly_commissions
-- calcola sul LISTINO del piano (subscription_plans.price_monthly) per ogni
-- azienda active, senza guardare gli incassi reali. Con l'attuale volume è
-- accettabile, ma va deciso se agganciare il calcolo a invoices pagate.
