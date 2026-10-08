import type { FaseModello } from "./modelliFasi";

export type SettimanaLavorativa = 5 | 6;
export const dataValida = (data?: Date): data is Date => !!data && Number.isFinite(data.getTime());

/** Giorni inclusivi; calendario locale per non spostare le date al cambio d'ora. Non include festività. */
export function calcolaFineLavori(inizio: Date | undefined, giorni: number, settimana: SettimanaLavorativa = 5): Date | undefined {
  if (!dataValida(inizio) || !Number.isInteger(giorni) || giorni < 1 || giorni > 3660 || ![5, 6].includes(settimana)) return undefined;
  const fine = new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate());
  let contati = 0;
  while (true) {
    if (fine.getDay() !== 0 && (settimana === 6 || fine.getDay() !== 6)) contati++;
    if (contati === giorni) return fine;
    fine.setDate(fine.getDate() + 1);
  }
}

/** Le bozze vecchie restano compatibili. Dati corrotti non devono diventare fasi salvate. */
export function fasiDaBozza(valore: unknown): FaseModello[] | null {
  if (!Array.isArray(valore) || valore.length > 60) return null;
  const fasi: FaseModello[] = [];
  for (const fase of valore) {
    if (!fase || typeof fase.nome !== "string" || !Array.isArray(fase.sottofasi) || fase.sottofasi.length > 40) return null;
    const sottofasi: FaseModello["sottofasi"] = [];
    for (const sotto of fase.sottofasi) {
      if (!sotto || typeof sotto.nome !== "string" || !Number.isFinite(sotto.peso)) return null;
      sottofasi.push({ nome: sotto.nome.slice(0, 160), peso: Math.min(100, Math.max(1, Math.round(sotto.peso))) });
    }
    fasi.push({ nome: fase.nome.slice(0, 160), sottofasi });
  }
  return fasi;
}

type RpcFasi = (nome: "aggiungi_fasi_commessa", args: { p_order_id: string; p_fasi: FaseModello[] }) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Un fallimento successivo alla creazione non deve indurre a ricreare la commessa. Nessun retry alla cieca. */
export async function salvaFasiDiPartenza(orderId: string, fasi: FaseModello[], rpc: RpcFasi): Promise<string | null> {
  if (!fasi.length) return null;
  try {
    const { data, error } = await rpc("aggiungi_fasi_commessa", { p_order_id: orderId, p_fasi: fasi });
    if (error) return error.message;
    return data === fasi.length ? null : "Il server non ha confermato tutte le fasi richieste.";
  } catch (errore) {
    return errore instanceof Error ? errore.message : "Collegamento interrotto durante il salvataggio delle fasi.";
  }
}
