alter table public.appointments add column if not exists cancelled_reason text;
comment on column public.appointments.cancelled_reason is 'Motivo della disdetta inserito dal cliente sul link personale.';
notify pgrst, 'reload schema';
