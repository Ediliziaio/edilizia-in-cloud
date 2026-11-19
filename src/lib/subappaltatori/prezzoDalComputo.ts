type AmbitoPrezzo = "posa" | "fornitura_e_posa";
type PropostaPrezzo = { prezzo: number | null; origine: string };

export function prezzoSubappalto({
  manuale, offerta, quantita, comprende, proposta, salvato, esigiPrezzoDitta,
}: {
  manuale?: number | null;
  offerta?: { prezzo: number; quantita: number; comprende: AmbitoPrezzo };
  quantita: number | null;
  comprende: AmbitoPrezzo;
  proposta?: PropostaPrezzo;
  salvato?: PropostaPrezzo & { comprende: AmbitoPrezzo };
  esigiPrezzoDitta: boolean;
}): { valore: number | null; fonte: string } {
  if (manuale !== undefined) return { valore: manuale, fonte: manuale == null ? "Da concordare" : "Inserito a mano" };
  if (offerta) {
    if (Math.abs((quantita ?? 0) - offerta.quantita) > 0.0005 || comprende !== offerta.comprende) {
      return { valore: null, fonte: "Offerta da riconfermare" };
    }
    return { valore: offerta.prezzo, fonte: "Offerta ricevuta" };
  }
  const disponibile = salvato?.prezzo != null ? salvato : proposta;
  const prezzo = disponibile?.prezzo;
  if (prezzo == null || prezzo <= 0) return { valore: null, fonte: "Da concordare" };
  const valore = Math.round(prezzo * 100) / 100;
  const daListino = disponibile.origine === "listino_ditta";
  if (!esigiPrezzoDitta) {
    return { valore, fonte: daListino ? "Listino ditta" : disponibile.origine === "costo_aziendale" ? "Stima aziendale" : "Prezzo già inserito" };
  }
  if (daListino && comprende === "posa") return { valore, fonte: "Listino ditta" };
  if (salvato && disponibile === salvato && disponibile.origine === "manuale" && salvato.comprende === comprende) {
    return { valore, fonte: "Prezzo già inserito" };
  }
  return { valore: null, fonte: disponibile.origine === "costo_aziendale" ? "Stima aziendale · da concordare" : "Da concordare" };
}
