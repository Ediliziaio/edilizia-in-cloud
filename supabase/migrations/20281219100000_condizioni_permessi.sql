-- I permessi delle condizioni contrattuali (07/11/2026).
-- Oggi per riscrivere una clausola serve «Listino & Prezzi»: chi tocca i prezzi tocca i contratti.
-- Qui tre permessi separati. Colonne booleane su staff_permissions, come gli altri:
--  · can_view_condizioni       — vedere e usare i modelli di condizioni
--  · can_manage_condizioni     — creare e cambiare i modelli dell'azienda
--  · can_riscrivere_condizioni — riscrivere le condizioni di UN documento, senza toccare il modello
-- Additiva e idempotente: nasce tutto spento, nessun accesso cambia. Gli amministratori passano comunque,
-- perché has_permission_for_company li ammette prima di leggere la colonna.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.staff_permissions add column if not exists can_view_condizioni boolean not null default false;
alter table public.staff_permissions add column if not exists can_manage_condizioni boolean not null default false;
alter table public.staff_permissions add column if not exists can_riscrivere_condizioni boolean not null default false;
