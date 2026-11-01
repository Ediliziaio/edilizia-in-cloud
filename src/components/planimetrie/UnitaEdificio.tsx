/**
 * Le unità dell'edificio nella scheda della pianta (condomini, bifamiliari, box): superfici,
 * millesimi proposti, listino (prezzo al mq e stato) e la scheda PDF di ogni unità.
 * Il listino si salva come una nuova versione della pianta (con la nota «Listino unità»).
 */
import { useMemo, useState } from "react";
import { FileDown, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalvaVersionePlanimetria } from "@/lib/planimetrie/archivio";
import { esportaSvg, vistaDaPlanimetria } from "@/lib/planimetrie/esporta";
import { conVendita, NOMI_STATO_VENDITA, unitaDellEdificio, type Unita } from "@/lib/planimetrie/unita";
import { STATI_VENDITA, type Planimetria, type StatoVendita, type VenditaUnita } from "../../../shared/planimetrie/modello.ts";

interface Props {
  documento: Planimetria;
  titolo: string;
  planimetriaId: string;
  versione: number;
}

const euro = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const mq = (v: number) => `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²`;
const COLORE_STATO: Record<StatoVendita, string> = { libera: "border-emerald-300 text-emerald-800", prenotata: "border-amber-300 text-amber-800", venduta: "border-slate-300 text-slate-600" };

async function pngDaSvg(svg: string, larghezza = 1600): Promise<Uint8Array> {
  const img = new Image();
  await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Pianta non disegnata.")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
  const c = document.createElement("canvas");
  c.width = larghezza;
  c.height = Math.round((larghezza * (img.naturalHeight || 1)) / (img.naturalWidth || 1));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise<Blob>((ok, ko) => c.toBlob((x) => (x ? ok(x) : ko(new Error("Immagine non creata."))), "image/png"));
  return new Uint8Array(await b.arrayBuffer());
}

export function UnitaEdificio({ documento, titolo, planimetriaId, versione }: Props) {
  const { effectiveCompany } = useAuth();
  const salva = useSalvaVersionePlanimetria();
  const [bozza, setBozza] = useState<Record<string, VenditaUnita>>({});
  const [pdf, setPdf] = useState<string | null>(null);
  const conBozza = useMemo(() => Object.entries(bozza).reduce((d, [s, v]) => conVendita(d, s, v), documento), [documento, bozza]);
  const unita = useMemo(() => unitaDellEdificio(conBozza), [conBozza]);
  if (unita.length < 2) return null;

  const cambia = (u: Unita, campi: VenditaUnita) => setBozza((b) => ({ ...b, [u.sigla]: { ...u.vendita, ...b[u.sigla], ...campi } }));
  const totale = unita.reduce((t, u) => t + (u.prezzo ?? 0), 0);
  const venduto = unita.filter((u) => u.vendita.stato === "venduta").reduce((t, u) => t + (u.prezzo ?? 0), 0);

  const salvaListino = async () => {
    try {
      await salva.mutateAsync({ planimetriaId, documento: conBozza, origine: "manuale", nota: "Listino unità", versioneAttesa: versione });
      setBozza({});
      toast.success("Listino salvato");
    } catch (e) {
      toast.error("Listino non salvato", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const scheda = async (u: Unita) => {
    setPdf(u.sigla);
    try {
      const piante: Array<{ piano: string; png: Uint8Array }> = [];
      for (const livelloId of [...new Set(u.locali.map((l) => l.livelloId))]) {
        const v = vistaDaPlanimetria(conBozza, { modo: "fatto", livelloId });
        // solo le stanze dell'unità: le altre restano bianche (muri e porte si vedono)
        const ids = new Set(u.locali.filter((l) => l.livelloId === livelloId).map((l) => l.id));
        const { aree: _esterni, ...senzaEsterni } = v;
        const solo = { ...senzaEsterni, locali: v.locali.filter((l) => ids.has(l.id)) };
        const svg = esportaSvg(solo, { scala: 50, stile: "presentazione", sfondo: "bianco" }).svg;
        piante.push({ piano: u.locali.find((l) => l.livelloId === livelloId)!.livello, png: await pngDaSvg(svg) });
      }
      const { pdfSchedaUnita } = await import("@/lib/planimetrie/unitaPdf");
      const dati = await pdfSchedaUnita({ titolo, azienda: effectiveCompany?.name ?? undefined, unita: u, piante });
      const url = URL.createObjectURL(new Blob([new Uint8Array(dati).buffer as ArrayBuffer], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${titolo.replace(/[^\w-]+/g, "-").toLowerCase()}-${u.sigla.replace(/[^\w-]+/g, "-").toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error("Scheda non creata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPdf(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Unità, millesimi e listino</h2>
        {Object.keys(bozza).length > 0 && (
          <Button size="sm" onClick={salvaListino} disabled={salva.isPending}>
            {salva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Salva il listino
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Unità</th>
                <th className="p-2 text-left">Piani</th>
                <th className="p-2 text-right">Netta</th>
                <th className="p-2 text-right">Commerciale</th>
                <th className="p-2 text-right">Millesimi</th>
                <th className="p-2 text-right">€/m²</th>
                <th className="p-2 text-right">Prezzo</th>
                <th className="p-2 text-left">Stato</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {unita.map((u) => (
                <tr key={u.sigla} className="border-b last:border-0">
                  <td className="p-2 font-medium">{u.sigla}</td>
                  <td className="p-2 text-xs text-muted-foreground">{u.piani.join(", ")}</td>
                  <td className="p-2 text-right tabular-nums">{mq(u.mqNetti)}</td>
                  <td className="p-2 text-right tabular-nums">{mq(u.mqCommerciali)}</td>
                  <td className="p-2 text-right tabular-nums">{u.millesimi.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</td>
                  <td className="p-2 text-right">
                    <Input className="ml-auto h-8 w-24 text-right" inputMode="decimal" key={`${u.sigla}-${u.vendita.prezzoMq ?? ""}`} defaultValue={u.vendita.prezzoMq ? String(u.vendita.prezzoMq) : ""} placeholder="—"
                      aria-label={`Prezzo al metro quadro di ${u.sigla}`}
                      onBlur={(e) => { const v = Number(e.target.value.replace(/\./g, "").replace(",", ".")); const nuovo = Number.isFinite(v) && v > 0 ? Math.round(v) : undefined; if (nuovo !== u.vendita.prezzoMq) cambia(u, { prezzoMq: nuovo }); }} />
                  </td>
                  <td className="p-2 text-right tabular-nums">{u.prezzo ? euro(u.prezzo) : "—"}</td>
                  <td className="p-2">
                    <Select value={u.vendita.stato ?? "libera"} onValueChange={(v) => cambia(u, { stato: v as StatoVendita })}>
                      <SelectTrigger className="h-8 w-32" aria-label={`Stato di ${u.sigla}`}>
                        <Badge variant="outline" className={COLORE_STATO[u.vendita.stato ?? "libera"]}>{NOMI_STATO_VENDITA[u.vendita.stato ?? "libera"]}</Badge>
                      </SelectTrigger>
                      <SelectContent>{STATI_VENDITA.map((s) => <SelectItem key={s} value={s}>{NOMI_STATO_VENDITA[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => scheda(u)} disabled={pdf === u.sigla} title="Scheda PDF dell'unità">
                      {pdf === u.sigla ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Commerciale: superfici nette con balconi e terrazzi al 30%, cantine al 25%, box al 50%. Millesimi proposti in proporzione, da far verificare a un tecnico.
        {totale > 0 && <> Totale listino {euro(totale)}{venduto > 0 && <>, venduto {euro(venduto)}</>}.</>}
      </p>
    </section>
  );
}
