import type { RigaOrdine } from "./abbinaRigheOrdine";

export interface RigaControlloOrdine extends RigaOrdine {
  inBolla: number;
  accettataQui: number;
  daRicevere: number;
  eccedenza: number;
  stato: "da_ricevere" | "parziale" | "completa" | "eccedenza";
}
const cifra = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const arrotonda = (n: number) => Math.round(n * 1e6) / 1e6;
export function controllaOrdini(
  ordini: RigaOrdine[],
  bolle: Array<{
    id?: string;
    purchase_order_item_id?: string | null;
    quantita: number | null;
  }>,
  consegne: Array<{
    riga_id?: string;
    purchase_order_item_id?: string | null;
    quantita: number;
    tipo: string;
  }>,
): RigaControlloOrdine[] {
  return ordini.map((r) => {
    const ricevuta = cifra(r.quantity_received);
    const daRicevere = Math.max(0, arrotonda(cifra(r.quantity) - ricevuta));
    const eccedenza = Math.max(0, arrotonda(ricevuta - cifra(r.quantity)));
    return {
      ...r,
      inBolla: arrotonda(
        bolle
          .filter((b) => b.purchase_order_item_id === r.id)
          .reduce(
            (s, b) =>
              s +
              Math.max(
                0,
                cifra(b.quantita) -
                  consegne
                    .filter(
                      (c) =>
                        !!b.id &&
                        c.riga_id === b.id &&
                        c.purchase_order_item_id !== r.id,
                    )
                    .reduce((q, c) => q + cifra(c.quantita), 0),
              ),
            0,
          ) +
          consegne
            .filter(
              (c) =>
                c.purchase_order_item_id === r.id &&
                !!c.riga_id &&
                bolle.find((b) => b.id === c.riga_id)
                  ?.purchase_order_item_id !== r.id,
            )
            .reduce((q, c) => q + cifra(c.quantita), 0),
      ),
      accettataQui: arrotonda(
        consegne
          .filter(
            (c) => c.purchase_order_item_id === r.id && c.tipo !== "servizio",
          )
          .reduce(
            (s, c) => s + (c.tipo === "reso" ? -1 : 1) * cifra(c.quantita),
            0,
          ),
      ),
      daRicevere,
      eccedenza,
      stato:
        eccedenza > 0
          ? "eccedenza"
          : daRicevere === 0
            ? "completa"
            : ricevuta > 0
              ? "parziale"
              : "da_ricevere",
    };
  });
}

/** Ogni riga pesa una volta: metri, pezzi e ore non sono sommabili fra loro. */
export function progressoOrdine(
  righe: Array<{ quantity: number; quantity_received: number | null }>,
) {
  const valide = righe.filter((r) => cifra(r.quantity) > 0);
  const complete = valide.filter(
    (r) => cifra(r.quantity_received) >= cifra(r.quantity),
  ).length;
  const percentuale = valide.length
    ? Math.floor(
        (100 *
          valide.reduce(
            (s, r) =>
              s +
              Math.max(
                0,
                Math.min(1, cifra(r.quantity_received) / cifra(r.quantity)),
              ),
            0,
          )) /
          valide.length,
      )
    : 0;
  return {
    complete,
    totali: valide.length,
    percentuale,
    daCompletare: valide.length - complete,
  };
}

/**
 * Che cosa dire quando non c'è niente da confrontare. 11/11/2026 — Il testo
 * «Nessun ordine collegato» guardava le righe degli ordini, il chip accanto
 * gli ordini: un ordine senza articoli li faceva comparire insieme («ODA-…»
 * e «Nessun ordine collegato»). Ora sono due casi distinti.
 */
export function avvisoSenzaConfronto(
  ordiniCollegati: number,
  righeOrdine: number,
): "nessun_ordine" | "ordine_senza_articoli" | null {
  if (righeOrdine > 0) return null;
  return ordiniCollegati > 0 ? "ordine_senza_articoli" : "nessun_ordine";
}
