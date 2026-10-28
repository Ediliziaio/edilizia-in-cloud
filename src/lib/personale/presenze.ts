import type { GiornataWithProfilo } from "@/hooks/useGiornate";

export const STATI_PRESENZA: Record<
  string,
  { label: string; className: string }
> = {
  presente: { label: "Presente", className: "bg-blue-50 text-blue-700" },
  assente: { label: "Assente", className: "bg-red-50 text-red-700" },
  ferie: { label: "Ferie", className: "bg-sky-50 text-sky-700" },
  permesso: { label: "Permesso", className: "bg-violet-50 text-violet-700" },
  malattia: { label: "Malattia", className: "bg-amber-50 text-amber-800" },
  smart_working: {
    label: "Smart working",
    className: "bg-blue-50 text-blue-700",
  },
  trasferta: { label: "Trasferta", className: "bg-indigo-50 text-indigo-700" },
  festivita: { label: "Festività", className: "bg-slate-100 text-slate-600" },
  infortunio: { label: "Infortunio", className: "bg-red-50 text-red-700" },
  maternita: { label: "Maternità", className: "bg-violet-50 text-violet-700" },
  paternita: { label: "Paternità", className: "bg-violet-50 text-violet-700" },
  lutto: { label: "Lutto", className: "bg-slate-100 text-slate-700" },
  rol: { label: "ROL", className: "bg-violet-50 text-violet-700" },
  non_lavorativo: {
    label: "Non lavorativo",
    className: "bg-slate-100 text-slate-600",
  },
  missione: { label: "Missione", className: "bg-indigo-50 text-indigo-700" },
};
export const statoPresenzaHr = (stato: string) =>
  STATI_PRESENZA[stato] ?? {
    label: stato.replaceAll("_", " "),
    className: "bg-slate-100 text-slate-700",
  };
export const orePresenze = (ore: number) =>
  `${ore.toLocaleString("it-IT", { maximumFractionDigits: 2 })} h`;
export const meseValido = (value: string) =>
  /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
export function spostaMese(mese: string, delta: number): string {
  const date = new Date(
    Number(mese.slice(0, 4)),
    Number(mese.slice(5, 7)) - 1 + delta,
    1,
  );
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function giorniMese(mese: string): (string | null)[] {
  const [anno, numero] = mese.split("-").map(Number);
  const offset = (new Date(anno, numero - 1, 1).getDay() + 6) % 7;
  const days: (string | null)[] = Array.from({ length: offset }, (): null => null);
  for (let d = 1; d <= new Date(anno, numero, 0).getDate(); d++)
    days.push(`${mese}-${String(d).padStart(2, "0")}`);
  while (days.length % 7) days.push(null);
  return days;
}
export function filtraPresenze(
  rows: GiornataWithProfilo[],
  ricerca: string,
  reparto: string,
  stato: string,
  anomalie: boolean,
  oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }),
) {
  const query = ricerca.trim().toLocaleLowerCase("it-IT");
  return rows.filter(
    (g) =>
      (!query ||
        `${g.profilo_nome} ${g.profilo_cognome} ${g.profilo_mansione ?? ""}`
          .toLocaleLowerCase("it-IT")
          .includes(query)) &&
      (!reparto || (g.profilo_reparto?.trim() || "Non indicato") === reparto) &&
      (!stato || g.stato === stato) &&
      (!anomalie || giornataDaVerificare(g, oggi)),
  );
}
export function giornataDaVerificare(g: Pick<GiornataWithProfilo, "anomalia" | "data" | "prima_entrata" | "ultima_uscita">, oggi: string) {
  return !!g.anomalia || (g.data < oggi && !!g.prima_entrata && !g.ultima_uscita);
}
export function riepilogoPresenze(rows: GiornataWithProfilo[], oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })) {
  return {
    lavorate: rows.filter((g) =>
      ["presente", "smart_working", "trasferta", "missione"].includes(g.stato),
    ).length,
    ore: rows.reduce((sum, g) => sum + (Number(g.ore_lavorate) || 0), 0),
    assenze: rows.filter((g) =>
      [
        "assente",
        "ferie",
        "permesso",
        "malattia",
        "infortunio",
        "maternita",
        "paternita",
        "lutto",
        "rol",
      ].includes(g.stato),
    ).length,
    anomalie: rows.filter((g) => giornataDaVerificare(g, oggi)).length,
  };
}
