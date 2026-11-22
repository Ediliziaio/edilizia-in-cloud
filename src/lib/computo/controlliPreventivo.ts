import { normalizzaUnita } from "@/lib/prezzario/confronto";
import { calcolaVoce, quantitaMisura, type VoceEditor } from "./editorNativo";

const normalizza = (testo: string) => testo.toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();

export function controlliPreventivo(voci: readonly VoceEditor[]) {
  const daControllare: { voce: VoceEditor; motivo: string }[] = [];
  const lavori = new Map<string, { fornituraPosa: VoceEditor[]; singole: VoceEditor[] }>();
  const misure = new Map<string, VoceEditor>();
  const sovrapposizioni: { voce: VoceEditor; altra: VoceEditor; motivo: string }[] = [];
  for (const voce of voci) {
    if (voce.opzionale || voce.detrazione || voce.daQuantificare || !voce.descrizione.trim()) continue;
    const dati = calcolaVoce(voce);
    if (dati.quantita === null || dati.prezzo === null) continue; // già segnalate nei controlli obbligatori
    if (voce.misure.some(m => m.dallaPianta?.origine === "stimata")) {
      daControllare.push({ voce, motivo: "Misura stimata nella planimetria" });
    }
    if (/\b(?:stim[ae]|indicativ[oaie])\b/i.test(voce.fonte)) {
      daControllare.push({ voce, motivo: "Prezzo indicativo da verificare" });
    }
    const titolo = normalizza(voce.descrizione.split("\n")[0]);
    const fase = normalizza(voce.capitolo);
    const unita = normalizzaUnita(voce.unita);
    for (const misura of voce.misure) {
      const descrizione = normalizza(misura.descrizione);
      const q = quantitaMisura(misura);
      if (descrizione.length < 16 || q === null || q <= 0) continue;
      const chiave = JSON.stringify([fase, titolo, unita, descrizione, q]);
      const altra = misure.get(chiave);
      if (altra && altra.id !== voce.id) sovrapposizioni.push({ voce, altra, motivo: "Stessa misura presente in due voci" });
      else misure.set(chiave, voce);
    }
    const perimetro = /^(fornitura\s+e\s+posa(?:\s+in\s+opera)?|fornitura|posa(?:\s+in\s+opera)?)\s+(?:(?:di|del|della|dei|delle)\s+)?(.+)$/.exec(titolo);
    if (!perimetro || !unita || dati.quantita <= 0 || perimetro[2].length < 4) continue;
    const chiave = JSON.stringify([fase, perimetro[2], unita, dati.quantita]);
    const gruppo = lavori.get(chiave) ?? { fornituraPosa: [], singole: [] };
    (perimetro[1].startsWith("fornitura e posa") ? gruppo.fornituraPosa : gruppo.singole).push(voce);
    lavori.set(chiave, gruppo);
  }
  for (const { fornituraPosa, singole } of lavori.values()) {
    if (!fornituraPosa.length) continue;
    for (const voce of singole) sovrapposizioni.push({ voce, altra: fornituraPosa[0], motivo: "Possibile doppio conteggio con una voce di fornitura e posa" });
  }
  return { daControllare, sovrapposizioni };
}
