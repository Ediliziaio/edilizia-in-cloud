export const MAX_DWG_BYTE = 64 * 1024 * 1024;
export const MAX_DXF_CONVERTITO_BYTE = 128 * 1024 * 1024;
export const ENDPOINT_DWG_LOCALE = "/__commessa-cad/dxf";
export const UUID_CAD = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export interface ProvenienzaConversioneDwg {
  trattamento?: "servizio";
  formato_originale: "dwg";
  formato_lettura: "dxf";
  sha256_originale: string;
  motore: string;
  segnalazioni: boolean;
}
