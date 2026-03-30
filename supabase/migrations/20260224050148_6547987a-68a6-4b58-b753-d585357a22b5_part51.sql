DROP TRIGGER IF EXISTS update_meta_assets_updated_at ON public.meta_assets;
CREATE TRIGGER update_meta_assets_updated_at BEFORE UPDATE ON public.meta_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
