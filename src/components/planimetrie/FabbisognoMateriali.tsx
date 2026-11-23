/**
 * «Materiali da comprare» dalla pianta (23/11/2026): litri di pittura, scatole di
 * pavimento, sacchi di colla e stucco, pezzi di battiscopa, con il calcolo spiegato
 * e il dettaglio per stanza. Cambia con la pianta: frazionare una stanza o spostare
 * un tramezzo aggiorna subito i numeri. Mani di pittura e sfrido si possono
 * cambiare qui; il calcolo è in `shared/planimetrie/fabbisogno.ts`.
 */
import { useMemo, useState } from "react";
import { ChevronDown, PaintBucket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fabbisognoMateriali, IPOTESI_FABBISOGNO } from "../../../shared/planimetrie/fabbisogno.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const fmt = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });

export function FabbisognoMateriali({ documento, ambito, titolo = "Materiali da comprare" }: { documento: Planimetria; ambito: string; titolo?: string }) {
  const [mani, setMani] = useState(IPOTESI_FABBISOGNO.maniPittura);
  const [sfrido, setSfrido] = useState(Math.round(IPOTESI_FABBISOGNO.sfridoPavimento * 100));
  const [aperta, setAperta] = useState<string | null>(null);
  const righe = useMemo(() => fabbisognoMateriali(documento, ambito, { maniPittura: mani, sfridoPavimento: sfrido / 100 }), [documento, ambito, mani, sfrido]);
  if (!righe.length) return null;

  const scarica = () => {
    const csv = [["Materiale", "Quantità", "Unità", "Da comprare", "Come", "Per stanza"],
      ...righe.map((r) => [r.materiale, fmt(r.quantita), r.unita, r.confezioni?.nome ?? "", r.come, r.stanze.map((s) => `${s.nome}: ${fmt(s.valore)}`).join("; ")])]
      .map((riga) => riga.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "materiali-da-comprare.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section aria-label={titolo} className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold"><PaintBucket className="h-4 w-4 text-primary" />{titolo}</h3>
          <p className="text-xs text-muted-foreground">Dalle misure della pianta, con le rese tipiche di cantiere. Da confermare con le schede dei prodotti scelti.</p>
        </div>
        <Button size="sm" variant="outline" onClick={scarica}>Scarica CSV</Button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1.5">Mani di pittura
          <select value={mani} onChange={(e) => setMani(Number(e.target.value))} className="rounded-md border bg-background px-1.5 py-1">
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">Sfrido pavimento
          <select value={sfrido} onChange={(e) => setSfrido(Number(e.target.value))} className="rounded-md border bg-background px-1.5 py-1">
            {[5, 8, 10, 12, 15].map((n) => <option key={n} value={n}>{n}%</option>)}
          </select>
        </label>
      </div>
      <ul className="divide-y rounded-lg border">
        {righe.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setAperta((v) => (v === r.id ? null : r.id))} aria-expanded={aperta === r.id}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.materiale}</span>
                <span className="block text-xs text-muted-foreground">{r.come}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold tabular-nums">{fmt(r.quantita)} {r.unita}</span>
                {r.confezioni && <span className="block text-xs text-muted-foreground">{r.confezioni.nome}</span>}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aperta === r.id ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {aperta === r.id && (
              <ul className="space-y-0.5 bg-muted/30 px-3 py-2 text-xs">
                {r.stanze.map((s) => <li key={s.nome} className="flex justify-between gap-3"><span>{s.nome}</span><span className="tabular-nums">{fmt(s.valore)} {r.unita}</span></li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
