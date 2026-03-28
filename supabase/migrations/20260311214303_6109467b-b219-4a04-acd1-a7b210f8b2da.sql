-- Fix FK constraints: NO ACTION → ON DELETE SET NULL for user/contact deletion integrity

-- === FKs referencing auth.users (profiles.id) that block user deletion ===

-- referrers.user_id
ALTER TABLE public.referrers DROP CONSTRAINT IF EXISTS referrers_user_id_fkey;
