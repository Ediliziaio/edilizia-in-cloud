-- Insert default tiers
INSERT INTO public.referral_tiers (name, slug, min_active_companies, commission_multiplier, color, icon, perks, position) VALUES
  ('Bronze',   'bronze',   0,  1.00, '#CD7F32', '🥉', '["Link referral personale", "Dashboard base"]', 1),
  ('Silver',   'silver',   3,  1.15, '#C0C0C0', '🥈', '["Commission +15%", "Report mensile", "Supporto prioritario"]', 2),
  ('Gold',     'gold',     10, 1.25, '#FFD700', '🥇', '["Commission +25%", "Materiali marketing", "Account manager dedicato"]', 3),
  ('Platinum', 'platinum', 25, 1.40, '#E5E4E2', '💎', '["Commission +40%", "White-label co-brand", "Revenue share sugli upgrade"]', 4)
ON CONFLICT (slug) DO NOTHING;
