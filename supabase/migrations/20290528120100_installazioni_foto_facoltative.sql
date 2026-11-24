-- Le foto non sono mai obbligatorie (founder, 24/11/2026). L'installazione dal magazzino si registrava solo con le
-- foto «prima» e «dopo» (colonne NOT NULL): ora si registra anche senza; se ci sono, restano come prima.
alter table public.installations alter column photo_before_url drop not null;
alter table public.installations alter column photo_after_url drop not null;
