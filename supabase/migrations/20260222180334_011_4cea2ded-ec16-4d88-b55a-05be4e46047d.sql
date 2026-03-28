CREATE TRIGGER trg_document_uploaded
  AFTER INSERT ON public.marketing_documents
  FOR EACH ROW EXECUTE FUNCTION public.log_document_uploaded();
