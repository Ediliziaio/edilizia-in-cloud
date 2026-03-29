ALTER TABLE public.article_templates
  ADD CONSTRAINT fk_at_montaggio_tariffa
    FOREIGN KEY (montaggio_tariffa_id)
    REFERENCES public.tariffe_aziendali(id)
    ON DELETE SET NULL
    NOT VALID;
