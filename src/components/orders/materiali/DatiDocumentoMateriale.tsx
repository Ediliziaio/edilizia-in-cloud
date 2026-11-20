import type { DatiDocumentaliMateriale } from "@/lib/distinta/materialiDocumentali";

export function DatiDocumentoMateriale({ dati }: { dati?: DatiDocumentaliMateriale }) {
  if (!dati) return null;
  return <details className="mt-2 rounded border bg-background p-2 text-xs" aria-label="Dati recuperati dal documento">
    <summary className="cursor-pointer font-medium">Dati dal PDF · {dati.quantita === "stimata" ? "resa da ricetta" : dati.quantita === "ricostruita" ? "quantità ricostruita" : "quantità documentata"}</summary>
    {dati.quantita_documento !== null && <p className="mt-2">Base documentale: {dati.quantita_documento.toLocaleString("it-IT", { maximumFractionDigits: 4 })} {dati.unita_documento}</p>}
    <p className="mt-1 text-muted-foreground">Voci: {dati.fonti.map(f => f.numero || "—").join(", ")}</p>
    {dati.fonti.length > 0 && <details className="mt-2 rounded bg-muted/30 p-2"><summary className="cursor-pointer font-medium">Testo delle voci già lette ({dati.fonti.length})</summary>
      <ul className="mt-2 space-y-3">{dati.fonti.map(f => <li key={f.voce_id}>
        <p className="font-medium">Voce {f.numero || "—"}{f.quantita != null ? " · " + f.quantita.toLocaleString("it-IT") + " " + (f.unita ?? "") : ""}</p>
        <p className="mt-1 whitespace-pre-line leading-5 text-muted-foreground">{f.descrizione}</p>
      </li>)}</ul></details>}
    {dati.specifiche.map(s => <p key={s} className="mt-1 text-muted-foreground">{s}</p>)}
    {dati.componenti_inclusi.length > 0 && <div className="mt-2"><p className="font-medium">Componenti esplicitamente elencati nel lotto</p>
      <ul className="list-disc pl-4">{dati.componenti_inclusi.map((c, i) => <li key={i}>{c.quantita ?? "Da quantificare"} {c.unita} · {c.descrizione}</li>)}</ul></div>}
    {dati.dati_mancanti.length > 0 && <div className="mt-2 text-amber-800"><p className="font-medium">Dati ancora mancanti</p><ul className="list-disc pl-4">{dati.dati_mancanti.map(s => <li key={s}>{s}</li>)}</ul></div>}
  </details>;
}
