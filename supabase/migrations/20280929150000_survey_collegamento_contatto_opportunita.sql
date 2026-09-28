-- Sopralluogo collegabile anche a un contatto/opportunità del CRM (28/09/2026).
--
-- Il sopralluogo si fa spesso in fase di VENDITA, quando la controparte è
-- ancora un prospect — un contatto o un'opportunità del CRM — e non un cliente.
-- Finora surveys aveva solo client_id + order_id, quindi non c'era modo di fare
-- un sopralluogo per un contatto/opportunità. Aggiungiamo contact_id e
-- opportunity_id, opzionali: un sopralluogo può stare su cliente, su commessa,
-- oppure su un contatto/opportunità (il contatto NON è un cliente).
--
-- Colonne nuove tutte NULL: la validazione delle FK sul lato surveys è
-- immediata. Un lock breve sulle tabelle CRM (che possono essere grandi) è
-- protetto da lock_timeout: meglio fallire in fretta che bloccare la produzione.
set local lock_timeout = '5s';

alter table public.surveys
  add column if not exists contact_id uuid references public.marketing_contacts(id) on delete set null,
  add column if not exists opportunity_id uuid references public.marketing_opportunities(id) on delete set null;

comment on column public.surveys.contact_id is
  'Contatto CRM (marketing_contacts) a cui si riferisce il sopralluogo, quando la controparte non è ancora un cliente.';
comment on column public.surveys.opportunity_id is
  'Opportunità CRM (marketing_opportunities) collegata; scegliendo l''opportunità il suo contatto si eredita in contact_id.';

create index if not exists idx_surveys_contact on public.surveys (contact_id) where contact_id is not null;
create index if not exists idx_surveys_opportunity on public.surveys (opportunity_id) where opportunity_id is not null;
