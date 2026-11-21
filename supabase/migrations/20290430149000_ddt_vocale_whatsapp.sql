set local lock_timeout = '5s';
set local statement_timeout = '15s';

alter table public.ddt_document_jobs
  add column if not exists whatsapp_voice_message_id uuid
    references public.whatsapp_messages(id) on delete set null;

create index if not exists ddt_document_jobs_vocale_whatsapp
  on public.ddt_document_jobs(whatsapp_voice_message_id)
  where whatsapp_voice_message_id is not null;

comment on column public.ddt_document_jobs.whatsapp_voice_message_id is
  'Vocale WhatsApp originale che ha indicato la destinazione della bozza.';

notify pgrst, 'reload schema';
