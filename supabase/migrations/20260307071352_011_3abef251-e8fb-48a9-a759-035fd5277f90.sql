-- Seed default pricing row
INSERT INTO public.email_pricing (provider, label, cost_real_per_email, cost_billed_per_email, markup_multiplier)
VALUES ('sendgrid', 'SendGrid Standard', 0.0001, 0.0003, 3.0);
