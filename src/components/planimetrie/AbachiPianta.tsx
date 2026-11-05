/**
 * Abachi della pianta (fase 2): serramenti e stanze, con i numeri del computo, scaricabili in Excel.
 */
import { useMemo } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { abacoSerramenti, abacoStanze, csvSerramenti, csvStanze, riepilogoControtelai, riepilogoOscuranti } from "@/lib/planimetrie/abachi";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const n2 = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function scaricaCsv(nome: string, testo: string) {
  const url = URL.createObjectURL(new Blob([testo], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const COLORE_STATO: Record<string, string> = {
  Nuovo: "border-red-300 text-red-700",
  "Da demolire": "border-amber-300 text-amber-800",
};

export function AbachiPianta({ documento, livelloId, ambito, titolo }: {
  documento: Planimetria; livelloId: string; ambito: string; titolo: string;
}) {
  const serramenti = useMemo(() => abacoSerramenti(documento, livelloId, ambito), [documento, livelloId, ambito]);
  const controtelai = useMemo(() => riepilogoControtelai(serramenti), [serramenti]);
  const oscuranti = useMemo(() => riepilogoOscuranti(serramenti), [serramenti]);
  const stanze = useMemo(() => abacoStanze(documento, livelloId, ambito), [documento, livelloId, ambito]);
  const base = (titolo || "pianta").replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();
  const totale = (k: "pavimentoMq" | "paretiNetteMq" | "battiscopaMl" | "volumeMc") => stanze.reduce((s, r) => s + r[k], 0);

  if (serramenti.length === 0 && stanze.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
        Abachi
      </h2>
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="serramenti">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <TabsList>
                <TabsTrigger value="serramenti">Porte e finestre ({serramenti.length})</TabsTrigger>
                <TabsTrigger value="stanze">Stanze ({stanze.length})</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="serramenti" className="m-0">
              <div className="flex justify-end px-3 pt-2 max-md:hidden">
                <Button size="sm" variant="outline" disabled={!serramenti.length} onClick={() => scaricaCsv(`${base}-serramenti.csv`, csvSerramenti(serramenti))}>
                  <Download className="mr-1.5 h-4 w-4" />Scarica in Excel
                </Button>
              </div>
              {/* telefono: una scheda per serramento, niente tabella larga */}
              <ul className="divide-y md:hidden">
                {serramenti.map((r) => (
                  <li key={r.id} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{r.codice} <span className="font-normal text-muted-foreground">· {r.tipo}{r.sistema !== "—" ? ` · ${r.sistema}${r.ante > 1 ? `, ${r.ante} ante` : ""}` : r.manovra ? ` · ${r.manovra}` : ""}</span></p>
                      <Badge variant="outline" className={COLORE_STATO[r.stato] ?? ""}>{r.stato}</Badge>
                    </div>
                    <p className={`text-xs tabular-nums ${r.stimata ? "italic text-primary" : "text-muted-foreground"}`}>
                      {r.stimata && "≈ "}{r.larghezza} × {r.altezza} cm{r.davanzale ? ` · davanzale ${r.davanzale}` : ""} · {n2(r.superficieMq)} m²{r.controtelaio.larghezza ? ` · controtelaio ${r.controtelaio.larghezza} × ${r.controtelaio.altezza}` : ""}{r.oscurante !== "—" ? ` · ${r.oscurante}` : ""}{r.cassonetto !== "—" ? ` · ${r.cassonetto}` : ""}{r.zanzariera !== "—" ? ` · ${r.zanzariera}` : ""}{r.stanze ? ` · ${r.stanze}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="overflow-x-auto max-md:hidden">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Codice</th><th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Sistema</th><th className="px-3 py-2 text-right font-medium">L × H cm</th><th className="px-3 py-2 text-right font-medium">Controtelaio</th>
                      <th className="px-3 py-2 font-medium">Oscurante</th><th className="px-3 py-2 text-right font-medium">Davanzale</th><th className="px-3 py-2 text-right font-medium">m²</th>
                      <th className="px-3 py-2 font-medium">Stanze</th><th className="px-3 py-2 font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serramenti.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-semibold tabular-nums">{r.codice}</td>
                        <td className="px-3 py-2">{r.tipo}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.sistema !== "—" ? `${r.sistema}${r.ante > 1 ? ` · ${r.ante} ante` : ""}` : r.manovra}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.stimata ? "italic text-primary" : ""}`} title={r.stimata ? "Misure stimate: da controllare" : undefined}>
                          {r.stimata && "≈ "}{r.larghezza} × {r.altezza}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" title={r.controtelaio.speciale ? "Controtelaio speciale per porta a scomparsa" : r.anta ? `Anta ${r.anta} cm` : undefined}>{r.controtelaio.larghezza ? `${r.controtelaio.larghezza} × ${r.controtelaio.altezza}${r.controtelaio.speciale ? " ★" : ""}` : "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground" title={[r.cassonetto !== "—" ? `Cassonetto: ${r.cassonetto}` : "", r.zanzariera !== "—" ? r.zanzariera : ""].filter(Boolean).join(" · ") || undefined}>{r.oscurante}{r.zanzariera !== "—" ? <span className="block text-xs">{r.zanzariera}</span> : null}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.davanzale || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.superficieMq)}</td>
                        <td className="px-3 py-2">{r.stanze}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className={COLORE_STATO[r.stato] ?? ""}>{r.stato}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {controtelai.length > 0 && (
                <div className="border-t px-3 py-2.5 text-xs">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Controtelai da ordinare (serramenti nuovi)</p>
                  <ul className="grid gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-2">
                    {controtelai.map((c) => <li key={c.descrizione}><span className="font-semibold">{c.numero} ×</span> {c.descrizione}</li>)}
                  </ul>
                </div>
              )}
              {oscuranti.length > 0 && (
                <div className="border-t px-3 py-2.5 text-xs">
                  <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Oscuranti, cassonetti e zanzariere da ordinare (serramenti nuovi)</p>
                  <ul className="grid gap-x-4 gap-y-0.5 tabular-nums sm:grid-cols-2">
                    {oscuranti.map((c) => <li key={c.descrizione}><span className="font-semibold">{c.numero} ×</span> {c.descrizione}</li>)}
                  </ul>
                </div>
              )}
            </TabsContent>

            <TabsContent value="stanze" className="m-0">
              <div className="flex justify-end px-3 pt-2 max-md:hidden">
                <Button size="sm" variant="outline" disabled={!stanze.length} onClick={() => scaricaCsv(`${base}-stanze.csv`, csvStanze(stanze))}>
                  <Download className="mr-1.5 h-4 w-4" />Scarica in Excel
                </Button>
              </div>
              <ul className="divide-y md:hidden">
                {stanze.map((r) => (
                  <li key={r.id} className="space-y-1.5 px-3 py-2.5 text-sm">
                    <p className="font-medium">{r.nome}{r.stimata && <span className="ml-1 text-primary" title="Misure stimate">≈</span>}{r.finiture !== "—" && <span className="ml-1 text-xs font-normal text-muted-foreground">· {r.finiture}</span>}</p>
                    <p className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
                      <span>Pavimento {n2(r.pavimentoMq)} m²</span><span>Perimetro {n2(r.perimetroMl)} m</span>
                      <span>Pareti nette {n2(r.paretiNetteMq)} m²</span><span>Volume {n2(r.volumeMc)} m³</span>
                      <span>Altezza {r.altezzaCm} cm</span><span>Battiscopa {n2(r.battiscopaMl)} m</span>
                      {r.rivestimentoMq != null && <span>Rivestimento {n2(r.rivestimentoMq)} m²</span>}
                    </p>
                  </li>
                ))}
                <li className="grid grid-cols-2 gap-x-3 bg-muted/40 px-3 py-2 text-xs font-semibold tabular-nums">
                  <span>Totale pavimento {n2(totale("pavimentoMq"))} m²</span><span>Volume {n2(totale("volumeMc"))} m³</span>
                </li>
              </ul>
              <div className="overflow-x-auto max-md:hidden">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Stanza</th><th className="px-3 py-2 text-right font-medium">Pavimento m²</th>
                      <th className="px-3 py-2 text-right font-medium">Perimetro m</th><th className="px-3 py-2 text-right font-medium">Pareti nette m²</th>
                      <th className="px-3 py-2 text-right font-medium">Altezza</th><th className="px-3 py-2 text-right font-medium">Volume m³</th>
                      <th className="px-3 py-2 text-right font-medium">Battiscopa m</th><th className="px-3 py-2 text-right font-medium">Rivestimento m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stanze.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium">{r.nome}{r.stimata && <span className="ml-1 text-primary" title="Misure stimate">≈</span>}</p>
                          {r.finiture !== "—" && <p className="text-xs text-muted-foreground">{r.finiture}</p>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.pavimentoMq)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.perimetroMl)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.paretiNetteMq)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.altezzaCm} cm</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.volumeMc)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.battiscopaMl)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.rivestimentoMq == null ? "—" : n2(r.rivestimentoMq)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-semibold">
                      <td className="px-3 py-2">Totale</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n2(totale("pavimentoMq"))}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">{n2(totale("paretiNetteMq"))}</td>
                      <td className="px-3 py-2" />
                      <td className="px-3 py-2 text-right tabular-nums">{n2(totale("volumeMc"))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n2(totale("battiscopaMl"))}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="px-3 py-2 text-[11px] text-muted-foreground">Pareti nette: vuoto per pieno, dedotti i vani oltre 4 m². Sono gli stessi numeri di «Prendi dalla pianta» nel computo.</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}
