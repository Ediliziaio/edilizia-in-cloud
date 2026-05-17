/**
 * QuoteBuilder — types
 * Estratto da QuoteBuilder.tsx (MP-MKT-001).
 *
 * NOTA FISCALE: i tipi qui descrivono shape di anagrafica cliente per
 * fatturazione (P.IVA / CF / indirizzo). Non modificare campi senza
 * coordinarsi con il modulo Fatturazione (potenzialmente normativa).
 */

export interface ContactOption {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  fiscal_code: string | null;
  vat_number: string | null;
}

export interface ListinoCategoria {
  id: string;
  nome: string;
  margine_target_percentuale?: number | null;
}
