export interface RigaConfronto {
  id: string;
  descrizione: string;
  codice: string | null;
  um: string | null;
  quantita: number | null;
  prezzo: number | null;
  importo: number | null;
}
export interface RigaBollaConfronto extends RigaConfronto {
  documentoId: string;
  giaFatturata: number;
  residuoIncerto: boolean;
}
export interface EsitoRigaConfronto {
  stato: "coerente" | "scostamento" | "da_controllare" | "senza_riferimento";
  motivo: string;
  quantitaDisponibile: number | null;
  prezzoConcordato: number | null;
  deltaPrezzo: number | null;
  ddtRighe: string[];
  deltaImporto: number | null;
}
export function documentoCompatibileConFornitore(
  fornitoreFattura: string | null,
  fornitoreDocumento: unknown,
): boolean {
  return (
    !fornitoreFattura ||
    !fornitoreDocumento ||
    fornitoreDocumento === fornitoreFattura
  );
}
export const recordDocumento = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const testo = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export function numeroDocumento(v: unknown): number | null {
  if (v == null || v === "" || typeof v === "boolean") return null;
  const n =
    typeof v === "number"
      ? v
      : Number(
          String(v).includes(",")
            ? String(v).replace(/\./g, "").replace(",", ".")
            : v,
        );
  return Number.isFinite(n) ? n : null;
}
const pulito = (v: string | null) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function unitaConfronto(v: string | null): string | null {
  const n = pulito(v?.replace(/²/g, "2").replace(/³/g, "3") ?? null);
  if (!n) return null;
  return (
    (
      {
        pz: "pz",
        pzi: "pz",
        pezzo: "pz",
        pezzi: "pz",
        nr: "pz",
        n: "pz",
        mq: "mq",
        m2: "mq",
        mc: "mc",
        m3: "mc",
        ml: "m",
        mt: "m",
        metri: "m",
        ora: "h",
        ore: "h",
        lt: "l",
      } as Record<string, string>
    )[n] ?? n
  );
}
export function righeFatturaConfronto(v: unknown): RigaConfronto[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r, i) => {
      const x = recordDocumento(r);
      const q = numeroDocumento(x.quantita);
      const lordo = numeroDocumento(x.prezzo_unitario);
      const netto = numeroDocumento(x.imponibile);
      const codice = Array.isArray(x.codici_articolo)
        ? recordDocumento(x.codici_articolo[0]).valore
        : null;
      return {
        id: String(x.numero_linea ?? i + 1),
        descrizione: testo(x.descrizione),
        codice: testo(x.codice_articolo ?? x.codice ?? x.sku ?? codice) || null,
        um: testo(x.unita_misura ?? x.unita ?? x.um) || null,
        quantita: q,
        // L’imponibile include sconti e maggiorazioni dell’XML. Il prezzo lordo li ignorerebbe.
        prezzo:
          lordo != null && netto != null && q != null && q > 0
            ? netto / q
            : lordo,
        importo: netto,
      };
    })
    .filter((r) => r.descrizione || r.importo != null);
}
export function stessaVoce(a: RigaConfronto, b: RigaConfronto): boolean {
  // Codici presenti ma diversi prevalgono su descrizioni generiche uguali.
  if (a.codice && b.codice) return pulito(a.codice) === pulito(b.codice);
  return (
    !!pulito(a.descrizione) && pulito(a.descrizione) === pulito(b.descrizione)
  );
}

/** Quantità e prezzi si controllano senza trasformare kg in sacchi o dati assenti in zero. */
export function confrontaRigheDocumenti(
  fattura: RigaConfronto[],
  bolle: RigaBollaConfronto[],
  ordini: RigaConfronto[],
  abbinamenti?: ReadonlyMap<string, { ddt: string[]; oda: string[] }>,
): EsitoRigaConfronto[] {
  const restanti = new Map(
    bolle.map((b) => [
      b.id,
      b.quantita == null ? null : Math.max(0, b.quantita - b.giaFatturata),
    ]),
  );
  return fattura.map((r): EsitoRigaConfronto => {
    const scelta = abbinamenti?.get(r.id);
    const candidati = bolle.filter((b) =>
      scelta ? scelta.ddt.includes(b.id) : stessaVoce(r, b),
    );
    const concordati = ordini.filter((o) =>
      scelta ? scelta.oda.includes(o.id) : stessaVoce(r, o),
    );
    const prezzi = [
      ...new Set(
        concordati
          .filter(
            (o) =>
              unitaConfronto(o.um) === unitaConfronto(r.um) &&
              !!unitaConfronto(r.um),
          )
          .map((o) => o.prezzo)
          .filter((p): p is number => p != null),
      ),
    ];
    const prezzo = prezzi.length === 1 ? prezzi[0] : null;
    const delta =
      prezzo != null && r.prezzo != null
        ? Math.round((r.prezzo - prezzo) * 10000) / 10000
        : null;
    const deltaImporto =
      prezzo != null && r.prezzo != null && r.quantita != null
        ? Math.round((r.prezzo - prezzo) * r.quantita * 100) / 100
        : null;
    const base = {
      deltaImporto,
      prezzoConcordato: prezzo,
      deltaPrezzo: delta,
      ddtRighe: candidati.map((b) => b.id),
    };
    if (!candidati.length)
      return {
        ...base,
        stato: "senza_riferimento",
        quantitaDisponibile: null,
        motivo: concordati.length
          ? "Presente nell’ordine, manca un DDT abbinabile. Controlla la consegna o se è un servizio."
          : "Nessuna riga abbinata: confronta gli originali, anche per servizi e trasporti.",
      };
    if (
      !unitaConfronto(r.um) ||
      candidati.some(
        (b) =>
          !unitaConfronto(b.um) ||
          unitaConfronto(b.um) !== unitaConfronto(r.um),
      )
    )
      return {
        ...base,
        stato: "da_controllare",
        quantitaDisponibile: null,
        motivo:
          "Unità mancanti o diverse: serve un controllo manuale delle quantità.",
      };
    if (
      r.quantita == null ||
      r.quantita <= 0 ||
      candidati.some((b) => b.quantita == null || b.residuoIncerto)
    )
      return {
        ...base,
        stato: "da_controllare",
        quantitaDisponibile: null,
        motivo:
          "Quantità o confronti precedenti incompleti. Verifica anche le altre fatture collegate.",
      };
    const disponibile = candidati.reduce(
      (s, b) => s + (restanti.get(b.id) ?? 0),
      0,
    );
    // Le righe successive della stessa fattura non possono riutilizzare la stessa quantità.
    let daAssegnare = r.quantita;
    for (const b of candidati) {
      const q = restanti.get(b.id) ?? 0;
      const presa = Math.min(q, daAssegnare);
      restanti.set(b.id, q - presa);
      daAssegnare -= presa;
    }
    const superata = r.quantita - disponibile > 0.000001;
    const prezzoDiverso = deltaImporto != null && Math.abs(deltaImporto) > 0.01;
    return {
      ...base,
      quantitaDisponibile: disponibile,
      stato:
        superata || prezzoDiverso
          ? "scostamento"
          : prezzo == null || r.prezzo == null || prezzi.length !== 1
            ? "da_controllare"
            : "coerente",
      motivo: superata
        ? "La fattura supera la quantità disponibile nei DDT selezionati."
        : prezzoDiverso
          ? "Quantità coperte, prezzo diverso dall’ordine."
          : prezzo == null || r.prezzo == null
            ? "Quantità coperte. Il prezzo concordato è assente, ambiguo o da confermare."
            : "Quantità coperte dai DDT e prezzo coerente con l’ordine.",
    };
  });
}
