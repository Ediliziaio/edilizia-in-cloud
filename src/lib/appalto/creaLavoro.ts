// Il riferimento resta uguale anche dopo un ricaricamento. La RPC condivisa
// salva ordine, rate e storico nella stessa transazione e recupera l'esito.
import type { StoredContractFile } from "@/lib/orders/contractPreparation";
export interface ScritturaLavoro {
  ordine: Record<string, unknown> & { id: string; company_id: string };
  rate: Array<Record<string, unknown> & { id: string; order_id: string }>;
  documento?: StoredContractFile | null;
}

export async function salvaLavoroConRate(
  // Le tabelle del modulo non sono ancora tutte nei tipi generati.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  scrittura: ScritturaLavoro,
): Promise<string> {
  const { data, error } = await db.rpc("crea_lavoro_appaltatore_atomic", {
    p_order_data: { ...scrittura.ordine, creation_request_id: scrittura.ordine.id },
    p_installments: scrittura.rate,
  });
  if (error) throw error;
  if (!data?.id || data.success !== true) throw new Error("Creazione non confermata: riprova per verificare lo stesso tentativo.");
  if (scrittura.documento) {
    const { collegaOriginaleAi } = await import("@/lib/orders/documentImportAi");
    await collegaOriginaleAi(db, String(data.id), scrittura.ordine.company_id, String(scrittura.ordine.created_by), scrittura.documento);
  }
  return String(data.id);
}

const chiave = (companyId: string, userId: string) => `eic:creazione-appaltatore:${companyId}:${userId}`;

export function recuperaScritturaLavoro(companyId: string | null, userId: string | undefined): ScritturaLavoro | null {
  if (!companyId || !userId) return null;
  try {
    const prefisso = chiave(companyId, userId);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || (k !== prefisso && !k.startsWith(prefisso + ":"))) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      let v: ScritturaLavoro;
      try { v = JSON.parse(raw) as ScritturaLavoro; } catch { continue; }
      if (v?.ordine?.company_id !== companyId || v.ordine.created_by !== userId ||
        typeof v.ordine.id !== "string" || v.ordine.order_type !== "appaltatore_lavoro" || !Array.isArray(v.rate)) continue;
      return v;
    }
    return null;
  } catch { return null; }
}

/** Il tentativo si conserva PRIMA della richiesta, anche se la risposta andrà persa. */
export function conservaScritturaLavoro(scrittura: ScritturaLavoro, userId: string): void {
  localStorage.setItem(chiave(scrittura.ordine.company_id, userId) + ":" + scrittura.ordine.id, JSON.stringify(scrittura));
}

export function completaScritturaLavoro(scrittura: ScritturaLavoro, userId: string): void {
  const prefisso = chiave(scrittura.ordine.company_id, userId);
  localStorage.removeItem(prefisso + ":" + scrittura.ordine.id);
  // Compatibilità con un eventuale tentativo conservato prima del registro per richiesta.
  const precedente = localStorage.getItem(prefisso);
  if (precedente && JSON.parse(precedente)?.ordine?.id === scrittura.ordine.id) localStorage.removeItem(prefisso);
}
