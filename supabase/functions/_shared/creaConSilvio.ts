// «Crea con Silvio» è acceso per questa azienda? (revisione dell'1/11/2026, E2)
//
// Lo stesso interruttore del browser (src/components/silvio-commessa/useCreaConSilvioAttivo.ts):
// la chiave `silvio_crea_commessa` deve essere vera nel database, senza il «bypass» che
// apre tutto alle demo; Demo Azienda 2 è accesa sempre. Prima lo guardava solo il browser:
// la edge si chiamava lo stesso e lo strumento della chat mandava il link anche alle
// aziende spente. Un errore di lettura vale «spento».
import { moduloAttivo } from "./moduloAttivo.ts";

export const FEATURE_CREA_CON_SILVIO = "silvio_crea_commessa";
const DEMO_AZIENDA_2 = "d2000000-0000-4000-a000-000000000002";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function creaConSilvioAcceso(db: any, companyId: string): Promise<boolean> {
  if (companyId === DEMO_AZIENDA_2) return true;
  try {
    return await moduloAttivo(db, companyId, FEATURE_CREA_CON_SILVIO);
  } catch {
    return false;
  }
}
