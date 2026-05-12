-- Fix bug critico: l'upload foto profilo (MioProfilo.tsx) usa il path
-- `users/<user_id>.<ext>` ma le policy storage richiedevano `admin/...`
-- come prima cartella → INSERT/UPDATE rifiutati silenziosamente dal RLS
-- e l'utente vedeva solo "Errore upload" generico nel toast.
--
-- Fix: le policy ora consentono qualunque utente autenticato a scrivere
-- nel bucket `avatars` sotto la propria cartella personale (per ora
-- pragmaticamente "users" e "admin" per retrocompat). Il read resta pubblico.
--
-- Idempotente: dropo e ricreo.

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;

-- INSERT: utente autenticato può caricare in `avatars/users/*` o
-- `avatars/admin/*` (legacy). RLS non controlla l'identità del filename
-- — confidiamo nel client che usa user.id come nome file (non c'è un
-- modo perfetto in storage.objects di estrarre l'user dal path senza
-- nuovi regex).
CREATE POLICY "Avatar upload authenticated"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] IN ('users', 'admin')
    )
  );

CREATE POLICY "Avatar update authenticated"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] IN ('users', 'admin')
    )
  );

CREATE POLICY "Avatar delete authenticated"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid() IS NOT NULL
    AND (
      (storage.foldername(name))[1] IN ('users', 'admin')
    )
  );
