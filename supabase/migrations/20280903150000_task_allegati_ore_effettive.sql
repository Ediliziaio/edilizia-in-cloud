-- Attività: allegati e ore effettive.
-- Fino a qui una task poteva avere solo una stima ore e nessun file: foto di
-- cantiere, bolle e DDT non si agganciavano a un'attività e il consuntivo ore
-- per commessa via task non esisteva. Idempotente.

-- ── Ore effettive accanto alla stima ──
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS actual_hours numeric(8,2);
COMMENT ON COLUMN public.tasks.actual_hours IS 'Ore effettivamente spese (consuntivo), accanto a estimated_hours';

-- ── Allegati ──
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name    text NOT NULL,
  storage_path text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- Vede e gestisce gli allegati chi vede la task (le policy di tasks valgono
-- dentro la subquery) ed è della stessa azienda.
DROP POLICY IF EXISTS "Company members manage task attachments" ON public.task_attachments;
CREATE POLICY "Company members manage task attachments"
  ON public.task_attachments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = task_attachments.company_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = task_attachments.company_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_attachments.task_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;

-- ── Bucket privato, cartella per azienda: <company_id>/<task_id>/<file> ──
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('task-attachments', 'task-attachments', false, 20971520)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS company_read_task_attachments ON storage.objects;
CREATE POLICY company_read_task_attachments ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] = (SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS company_upload_task_attachments ON storage.objects;
CREATE POLICY company_upload_task_attachments ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] = (SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS company_delete_task_attachments ON storage.objects;
CREATE POLICY company_delete_task_attachments ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments'
    AND (storage.foldername(name))[1] = (SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()));
