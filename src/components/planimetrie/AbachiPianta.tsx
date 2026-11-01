/**
 * Abachi della pianta (fase 2): serramenti e stanze, con i numeri del computo, scaricabili in Excel.
 */
import { useMemo } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { abacoSerramenti, abacoStanze, csvSerramenti, csvStanze } from "@/lib/planimetrie/abachi";
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
              <div className="flex justify-end px-3 pt-2">
                <Button size="sm" variant="outline" disabled={!serramenti.length} onClick={() => scaricaCsv(`${base}-serramenti.csv`, csvSerramenti(serramenti))}>
                  <Download className="mr-1.5 h-4 w-4" />Scarica in Excel
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 font-medium">Codice</th><th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Manovra</th><th className="px-3 py-2 text-right font-medium">L × H cm</th>
                      <th className="px-3 py-2 text-right font-medium">Davanzale</th><th className="px-3 py-2 text-right font-medium">m²</th>
                      <th className="px-3 py-2 font-medium">Stanze</th><th className="px-3 py-2 font-medium">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serramenti.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-semibold tabular-nums">{r.codice}</td>
                        <td className="px-3 py-2">{r.tipo}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.manovra}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.stimata ? "italic text-violet-700" : ""}`} title={r.stimata ? "Misure stimate: da controllare" : undefined}>
                          {r.stimata && "≈ "}{r.larghezza} × {r.altezza}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.davanzale || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{n2(r.superficieMq)}</td>
                        <td className="px-3 py-2">{r.stanze}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className={COLORE_STATO[r.stato] ?? ""}>{r.stato}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="stanze" className="m-0">
              <div className="flex justify-end px-3 pt-2">
                <Button size="sm" variant="outline" disabled={!stanze.length} onClick={() => scaricaCsv(`${base}-stanze.csv`, csvStanze(stanze))}>
                  <Download className="mr-1.5 h-4 w-4" />Scarica in Excel
                </Button>
              </div>
              <div className="overflow-x-auto">
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
                          <p className="font-medium">{r.nome}{r.stimata && <span className="ml-1 text-violet-700" title="Misure stimate">≈</span>}</p>
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
