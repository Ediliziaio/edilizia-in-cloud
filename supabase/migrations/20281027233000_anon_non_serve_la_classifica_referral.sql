-- Ultimo passo del giro. `referral_leaderboard_public` sembrava una vista
-- pubblica dal nome, ma la legge `PartnerLeaderboard` dentro `PartnerDashboard`,
-- cioè il portale partner: chi la guarda ha fatto l'accesso ed è
-- `authenticated`. Ad `anon` non serviva, e infatti anche prima non le dava
-- nessuna riga (la RLS di `referrers` la svuotava).
--
-- Si toglie quindi la vista e le due tabelle che le avevo concesso nel passo
-- precedente solo per farla rispondere «vuoto» invece di «permission denied».

revoke all on table public.referral_leaderboard_public from anon;
revoke all on table public.referrers      from anon;
revoke all on table public.referral_tiers from anon;
