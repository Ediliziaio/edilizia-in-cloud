import type { ConfiguredItem } from "@/types/catalogItem";

/** Una riga del riepilogo «cosa hai aggiunto» del popup prodotti. */
export interface VoceAggiunta {
  nome: string;
  dettaglio: string;
  importo: number;
}

/** Il prodotto con la sua eventuale manodopera è una voce sola: l'importo le somma. */
export function voceDaProdotto(righe: ConfiguredItem[]): VoceAggiunta {
  const prima = righe[0].quote_item;
  const misure =
    prima.misura_x && prima.misura_y ? `${prima.misura_x}×${prima.misura_y} mm · ` : "";
  return {
    nome: prima.name,
    dettaglio: `${misure}${prima.quantity} ${prima.unit_of_measure}`,
    importo: righe.reduce((totale, { quote_item: r }) => {
      const sconto = 1 - (Number(r.discount_percent) || 0) / 100;
      return totale + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0) * sconto;
    }, 0),
  };
}
