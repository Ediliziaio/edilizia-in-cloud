// Fasi commessa di un'azienda nuova, dal modello del suo settore (24/09/2026).
//
// Appena l'azienda nasce, il trigger `trg_ensure_assistenza_status` su
// `companies` le crea da solo la fase «Assistenza» (posizione 0), e l'indice
// `order_statuses_one_support_phase_per_company` ne ammette una sola. Il modello
// del settore contiene anche lei: create-company e public-checkout inserivano il
// modello intero in un colpo solo, l'indice rifiutava l'INSERT tutto intero e
// l'errore finiva nel log. Dal 24/04/2026 ogni azienda creata dal form è nata
// con la sola «Assistenza»: 11 aziende, e le commesse importate in renova e in
// Ser Style sono rimaste senza fase.
//
// Qui si inseriscono le fasi del modello tranne quella di supporto, e
// l'«Assistenza» del trigger scende in fondo, alla posizione che ha nel modello.
// Se un giorno il trigger sparisce, l'«Assistenza» la inserisce questa funzione.
//
// I modelli vivono solo qui: l'anteprima del form admin
// (src/lib/orderStatusTemplates.ts) li importa da questo file.

export type CompanySector =
  | "serramenti"
  | "infissi"
  | "bagni"
  | "tetti"
  | "fotovoltaico"
  | "pittura"
  | "ristrutturazioni"
  | "altro";

export interface OrderStatusTemplate {
  name: string;
  icon: string;
  color: string;
  position: number;
  is_support_phase?: boolean;
}

const serramentiInfissiTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
  { name: "In Produzione", icon: "Factory", color: "#7C3AED", position: 3 },
  { name: "Produzione Finita", icon: "Package", color: "#0891B2", position: 4 },
  { name: "Merce in Magazzino", icon: "Package", color: "#EA580C", position: 5 },
  { name: "Posa Programmata", icon: "Calendar", color: "#DB2777", position: 6 },
  { name: "Posa Completata", icon: "Home", color: "#16A34A", position: 7 },
  { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 8, is_support_phase: true },
];

const fotovoltaicoTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Sopralluogo Tecnico", icon: "Clipboard", color: "#CA8A04", position: 2 },
  { name: "Progettazione", icon: "Ruler", color: "#7C3AED", position: 3 },
  { name: "Materiale Ordinato", icon: "Package", color: "#EA580C", position: 4 },
  { name: "Installazione Programmata", icon: "Calendar", color: "#DB2777", position: 5 },
  { name: "Installazione Completata", icon: "Wrench", color: "#2563EB", position: 6 },
  { name: "Collaudo", icon: "Shield", color: "#CA8A04", position: 7 },
  { name: "Pratica GSE", icon: "FileText", color: "#0891B2", position: 8 },
  { name: "Allaccio Rete", icon: "Zap", color: "#16A34A", position: 9 },
  { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 10, is_support_phase: true },
];

const bagniRistrutturazioniTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "Acconto Pagato", icon: "CheckCircle", color: "#16A34A", position: 1 },
  { name: "Rilievo Tecnico", icon: "Ruler", color: "#CA8A04", position: 2 },
  { name: "Progettazione", icon: "Clipboard", color: "#7C3AED", position: 3 },
  { name: "Ordine Materiali", icon: "Package", color: "#0891B2", position: 4 },
  { name: "Demolizioni", icon: "Hammer", color: "#DC2626", position: 5 },
  { name: "Impianti", icon: "Wrench", color: "#EA580C", position: 6 },
  { name: "Posa", icon: "Factory", color: "#DB2777", position: 7 },
  { name: "Finiture", icon: "PaintBucket", color: "#7C3AED", position: 8 },
  { name: "Consegna", icon: "Home", color: "#16A34A", position: 9 },
  { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 10, is_support_phase: true },
];

const defaultTemplate: OrderStatusTemplate[] = [
  { name: "Contratto Firmato", icon: "FileText", color: "#2563EB", position: 0 },
  { name: "In Lavorazione", icon: "Settings", color: "#CA8A04", position: 1 },
  { name: "Completato", icon: "CheckCircle", color: "#16A34A", position: 2 },
  { name: "Assistenza", icon: "LifeBuoy", color: "#F59E0B", position: 3, is_support_phase: true },
];

export function getOrderStatusTemplate(sector: CompanySector): OrderStatusTemplate[] {
  switch (sector) {
    case "serramenti":
    case "infissi":
      return serramentiInfissiTemplate;
    case "fotovoltaico":
      return fotovoltaicoTemplate;
    case "bagni":
    case "ristrutturazioni":
      return bagniRistrutturazioniTemplate;
    case "tetti":
    case "pittura":
    case "altro":
    default:
      return defaultTemplate;
  }
}

/**
 * Dà all'azienda appena creata le fasi commessa del suo settore. Da chiamare
 * subito dopo l'INSERT su `companies`, quando l'azienda non ha altre fasi che
 * l'«Assistenza» del trigger. `fasi` è il numero di fasi con cui l'azienda
 * resta; con `errore` l'azienda non ha le sue fasi, e chi chiama deve dirlo.
 */
export async function creaFasiCommessa(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  companyId: string,
  sector: CompanySector,
): Promise<{ fasi: number; errore?: string }> {
  const modello = getOrderStatusTemplate(sector);

  const { data: assistenza, error: erroreLettura } = await supabase
    .from("order_statuses")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_support_phase", true)
    .maybeSingle();
  if (erroreLettura) return { fasi: 0, errore: erroreLettura.message };

  const righe = modello
    .filter((fase) => !(fase.is_support_phase && assistenza))
    .map((fase, indice) => ({
      company_id: companyId,
      name: fase.name,
      icon: fase.icon,
      color: fase.color,
      position: fase.position,
      is_default: indice === 0,
      is_support_phase: fase.is_support_phase === true,
    }));

  const { error: erroreInserimento } = await supabase.from("order_statuses").insert(righe);
  if (erroreInserimento) return { fasi: 0, errore: erroreInserimento.message };

  if (!assistenza) return { fasi: righe.length };

  const supporto = modello.find((fase) => fase.is_support_phase);
  const inFondo = supporto?.position ?? Math.max(...modello.map((fase) => fase.position)) + 1;
  const { error: erroreSpostamento } = await supabase
    .from("order_statuses")
    .update({ position: inFondo })
    .eq("id", assistenza.id);
  if (erroreSpostamento) {
    return { fasi: righe.length + 1, errore: `«Assistenza» non spostata in fondo: ${erroreSpostamento.message}` };
  }

  return { fasi: righe.length + 1 };
}
