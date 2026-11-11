import {
  datiRiconciliazione,
  validaPropostaRiconciliazione,
  type ContestoRiconciliazione,
  type PropostaRiconciliazione,
  type PropostaRigaAI,
} from "./riconciliazioneFattureAI.ts";
import { equivalenzeConfermate } from "./ripartizioneFatture.ts";
export interface LottoRiconciliazione {
  fattura: string[];
  ddt: string[];
  oda: string[];
}
export function pianificaLotti(
  c: ContestoRiconciliazione,
): LottoRiconciliazione[] {
  const d = datiRiconciliazione(c),
    note = equivalenzeConfermate(c);
  const conosciute = new Set(note.righe.flatMap((r) => [...r.ddt, ...r.oda]));
  const tutteFontiNote = [...d.bolle, ...d.ordini].every((r) =>
    conosciute.has(r.id),
  );
  const noteIds = new Set(
    tutteFontiNote
      ? note.righe
          .filter((r) => r.ddt.length || r.oda.length)
          .map((r) => r.fattura)
      : [],
  );
  if (d.fattura.length > 800 || d.bolle.length + d.ordini.length > 6000)
    throw new Error(
      "La selezione supera 800 voci fattura o 6.000 righe di confronto. Suddividi i documenti in due confronti.",
    );
  if (tutteFontiNote && d.fattura.every((f) => noteIds.has(f.id))) return [];
  const fattura = d.fattura;
  const fonti = [
    ...d.bolle.map((r) => ({ id: r.id, tipo: "ddt" })),
    ...d.ordini.map((r) => ({ id: r.id, tipo: "oda" })),
  ];
  const lotti: LottoRiconciliazione[] = [];
  for (let f = 0; f < fattura.length; f += 30)
    for (let r = 0; r < Math.max(1, fonti.length); r += 200) {
      const righe = fonti.slice(r, r + 200);
      lotti.push({
        fattura: fattura.slice(f, f + 30).map((r) => r.id),
        ddt: righe.filter((r) => r.tipo === "ddt").map((r) => r.id),
        oda: righe.filter((r) => r.tipo === "oda").map((r) => r.id),
      });
    }
  return lotti;
}
export function contestoLotto(
  c: ContestoRiconciliazione,
  l: LottoRiconciliazione,
): ContestoRiconciliazione {
  const raw = Array.isArray(c.fattura.righe) ? c.fattura.righe : [];
  return {
    ...c,
    fattura: {
      ...c.fattura,
      righe: raw.flatMap((r, i) =>
        l.fattura.includes(String(r.numero_linea ?? i + 1))
          ? [{ ...r, numero_linea: r.numero_linea ?? i + 1 }]
          : [],
      ),
    },
    ddt: c.ddt.map((d) => ({
      ...d,
      righe: (d.righe as Record<string, unknown>[]).filter((r) =>
        l.ddt.includes(String(r.id)),
      ),
    })),
    oda: c.oda.map((d) => ({
      ...d,
      righe: (d.righe as Record<string, unknown>[]).filter((r) =>
        l.oda.includes(String(r.id)),
      ),
    })),
  };
}
export function unisciLotti(
  c: ContestoRiconciliazione,
  parti: PropostaRiconciliazione[],
): PropostaRiconciliazione {
  const note = equivalenzeConfermate(c);
  const tutteFontiNote = [
    ...datiRiconciliazione(c).bolle,
    ...datiRiconciliazione(c).ordini,
  ].every((r) => note.righe.some((n) => [...n.ddt, ...n.oda].includes(r.id)));
  const idsNote = new Set(
    tutteFontiNote
      ? note.righe
          .filter((r) => r.ddt.length || r.oda.length)
          .map((r) => r.fattura)
      : [],
  );
  const righe = datiRiconciliazione(c).fattura.map((f): PropostaRigaAI => {
    if (idsNote.has(f.id)) return note.righe.find((r) => r.fattura === f.id)!;
    const tutte = parti.flatMap((p) =>
      p.righe.filter((r) => r.fattura === f.id),
    );
    if (!tutte.length)
      throw new Error(
        "Analisi incompleta: una voce della fattura non è stata elaborata.",
      );
    const collegate = tutte.filter((r) => r.ddt.length || r.oda.length),
      scelte = collegate.length ? collegate : tutte;
    return {
      fattura: f.id,
      ddt: [...new Set(collegate.flatMap((r) => r.ddt))],
      oda: [...new Set(collegate.flatMap((r) => r.oda))],
      affidabilita: scelte.some((r) => r.affidabilita === "bassa")
        ? "bassa"
        : scelte.some((r) => r.affidabilita === "media") || collegate.length > 1
          ? "media"
          : "alta",
      motivo: [...new Set(scelte.map((r) => r.motivo))].join(" ").slice(0, 700),
    };
  });
  return validaPropostaRiconciliazione(
    { righe, avvisi: [...new Set(parti.flatMap((p) => p.avvisi))] },
    c,
  );
}
