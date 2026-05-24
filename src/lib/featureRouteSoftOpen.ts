const SOFT_OPEN_ON_FEATURE_CHECK_DELAY = new Set([
  "render_ai",
  "marketing_reporting",
  "sales_os",
  "crm_modulo",
  "modulo_fotovoltaico_attivo",
  "firma_fea",
]);

export function shouldSoftOpenFeatureCheck({
  featureKey,
  isLoading,
  isError,
}: {
  featureKey: string;
  isLoading: boolean;
  isError: boolean;
}) {
  return SOFT_OPEN_ON_FEATURE_CHECK_DELAY.has(featureKey) && (isLoading || isError);
}
