-- Contatti dell'impresa nel preventivo, scritti nel modello (25/09/2026).
--
-- Il PDF del preventivo generico (generate-quote-pdf) stampava sotto
-- «L'impresa» e nel modulo di recesso la mail e il telefono del profilo
-- aziendale (companies.email / phone). Ener Italia aveva nel profilo la mail
-- di un consulente, e il cliente se la trovava sul preventivo. Nel modello
-- «offerta» (Impostazioni → Modelli di preventivo → Elementi da mostrare) ora
-- si scrivono mail e telefono da mostrare; vuoti = quelli del profilo.
--
-- Solo due colonne nuove: istantaneo, nessuna riga toccata. I permessi su
-- quote_templates sono per tabella, quindi valgono anche per queste.

alter table public.quote_templates add column if not exists email_impresa text;
alter table public.quote_templates add column if not exists telefono_impresa text;

comment on column public.quote_templates.email_impresa is
  'Mail dell''impresa stampata nel preventivo (blocco «L''impresa», modulo di recesso). Vuota = companies.email.';
comment on column public.quote_templates.telefono_impresa is
  'Telefono dell''impresa stampato nel preventivo. Vuoto = companies.phone.';
