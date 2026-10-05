/**
 * Etichette con il QR da attaccare ad attrezzi e mezzi, su fogli A4 adesivi.
 *
 * Due usi: le etichette degli attrezzi già registrati (codice, nome, QR), e le
 * etichette «vuote» con codici riservati in anticipo, da attaccare prima e
 * collegare dopo (scansionando un'etichetta libera si registra l'attrezzo con
 * quel codice). Il QR porta a /q/<codice>?c=<azienda>: dal telefono apre la
 * scheda all'ufficio e le azioni rapide a chi sta in cantiere.
 *
 * La stampa apre il foglio in una finestra a parte (dalla finestra di stampa
 * si può anche salvare in PDF): fogli standard 70×37 (24 per foglio) o
 * 52,5×29,7 (40 per foglio).
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { indirizzoQr, useRiservaEtichette } from "@/hooks/useMezzi";
import type { MezzoClasse } from "@/types/mezzi";

export interface VoceEtichetta {
  id: string;
  codice: string | null;
  nome: string;
  sotto?: string | null;
}

type Formato = "grandi" | "piccole";

const FORMATI: Record<Formato, { label: string; colonne: number; righe: number; larghezza: number; altezza: number }> = {
  grandi: { label: "70 × 37 mm · 24 per foglio", colonne: 3, righe: 8, larghezza: 70, altezza: 37.125 },
  piccole: { label: "52,5 × 29,7 mm · 40 per foglio", colonne: 4, righe: 10, larghezza: 52.5, altezza: 29.7 },
};

interface Etichetta {
  codice: string;
  titolo: string;
  sotto: string | null;
}

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function qrDataUrl(testo: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(testo, { margin: 0, width: 300, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
}

/** Il foglio da stampare: HTML a sé, misure in millimetri, nessun margine di pagina. */
async function foglioHtml(etichette: Etichetta[], formato: Formato, azienda: string, companyId: string): Promise<string> {
  const f = FORMATI[formato];
  const qr = await Promise.all(etichette.map((e) => qrDataUrl(indirizzoQr(e.codice, companyId))));
  const lato = f.altezza - 6;
  const celle = etichette
    .map(
      (e, i) => `<div class="et">
  <img src="${qr[i]}" alt="" style="width:${lato}mm;height:${lato}mm" />
  <div class="tx">
    <div class="cod">${esc(e.codice)}</div>
    <div class="nome">${esc(e.titolo)}</div>
    ${e.sotto ? `<div class="sotto">${esc(e.sotto)}</div>` : ""}
    <div class="az">${esc(azienda)}</div>
  </div>
</div>`,
    )
    .join("\n");
  const perFoglio = f.colonne * f.righe;
  return `<!doctype html><html lang="it"><head><meta charset="utf-8" /><title>Etichette QR</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; }
  .foglio { display: grid; grid-template-columns: repeat(${f.colonne}, ${f.larghezza}mm); grid-auto-rows: ${f.altezza}mm; width: 210mm; }
  .et { display: flex; align-items: center; gap: 2mm; padding: 3mm; overflow: hidden; break-inside: avoid; }
  .et:nth-child(${perFoglio}n) { break-after: page; }
  .tx { min-width: 0; display: flex; flex-direction: column; gap: 0.6mm; }
  .cod { font-family: "SF Mono", Menlo, Consolas, monospace; font-weight: 700; font-size: ${formato === "grandi" ? 13 : 10}pt; letter-spacing: 0.3pt; }
  .nome { font-size: ${formato === "grandi" ? 8.5 : 7}pt; font-weight: 600; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
  .sotto { font-size: 6.5pt; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .az { font-size: 6pt; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  @media screen { body { background: #e2e8f0; } .foglio { background: #fff; margin: 8mm auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); } .et { outline: 1px dashed #cbd5e1; } }
</style></head><body><div class="foglio">${celle}</div>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Attrezzi o mezzi tra cui scegliere (di solito quelli dell'elenco filtrato). */
  voci: VoceEtichetta[];
  /** Quelli già spuntati all'apertura (es. dalla scheda: uno solo). */
  preselezionati?: string[];
  classe: MezzoClasse;
  companyId: string;
  azienda: string;
}

export function EtichetteQrDialog({ open, onOpenChange, voci, preselezionati, classe, companyId, azienda }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <Contenuto
          voci={voci}
          preselezionati={preselezionati}
          classe={classe}
          companyId={companyId}
          azienda={azienda}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function Contenuto({ voci, preselezionati, classe, companyId, azienda, onClose }: Omit<Props, "open" | "onOpenChange"> & { onClose: () => void }) {
  const conCodice = useMemo(() => voci.filter((v) => !!v.codice), [voci]);
  const [scheda, setScheda] = useState<"registrati" | "vuote">("registrati");
  const [scelti, setScelti] = useState<Set<string>>(
    () => new Set(preselezionati?.length ? preselezionati : conCodice.map((v) => v.id)),
  );
  const [quante, setQuante] = useState("24");
  const [formato, setFormato] = useState<Formato>("grandi");
  const [stampando, setStampando] = useState(false);
  const [anteprima, setAnteprima] = useState<{ codice: string; url: string } | null>(null);
  const riserva = useRiservaEtichette();

  // Anteprima del primo QR, così si vede cosa uscirà.
  const primo = scheda === "registrati" ? conCodice.find((v) => scelti.has(v.id)) : null;
  useEffect(() => {
    const codice = primo?.codice;
    if (!codice) return;
    let vivo = true;
    void qrDataUrl(indirizzoQr(codice, companyId)).then((url) => {
      if (vivo) setAnteprima({ codice, url });
    });
    return () => {
      vivo = false;
    };
  }, [primo?.codice, companyId]);
  // L'anteprima vale solo per il primo scelto adesso.
  const urlAnteprima = anteprima && primo?.codice === anteprima.codice ? anteprima.url : null;

  const nVuote = Math.max(0, Math.min(500, Math.floor(Number(quante) || 0)));
  const tutti = conCodice.length > 0 && conCodice.every((v) => scelti.has(v.id));

  const stampa = async () => {
    // La finestra si apre subito, nel clic: aperta dopo un'attesa il browser la blocca.
    const finestra = window.open("", "_blank");
    if (!finestra) {
      toast.error("Il browser ha bloccato la finestra di stampa: consenti i popup per questo sito.");
      return;
    }
    finestra.document.write("<p style='font-family:sans-serif;padding:24px'>Preparo le etichette…</p>");
    setStampando(true);
    try {
      let etichette: Etichetta[];
      if (scheda === "registrati") {
        etichette = conCodice
          .filter((v) => scelti.has(v.id))
          .map((v) => ({ codice: v.codice!, titolo: v.nome, sotto: v.sotto ?? null }));
      } else {
        const codici = await riserva.mutateAsync({ quante: nVuote, classe });
        etichette = codici.map((c): Etichetta => ({ codice: c, titolo: classe === "attrezzatura" ? "Attrezzatura" : "Mezzo", sotto: null }));
      }
      if (!etichette.length) throw new Error("Nessuna etichetta da stampare");
      const html = await foglioHtml(etichette, formato, azienda, companyId);
      finestra.document.open();
      finestra.document.write(html);
      finestra.document.close();
      if (scheda === "vuote") toast.success(`Riservati ${etichette.length} codici: da ${etichette[0].codice} a ${etichette[etichette.length - 1].codice}`);
      onClose();
    } catch (e) {
      finestra.close();
      if (!riserva.isError) toast.error(e instanceof Error ? e.message : "Non sono riuscito a preparare le etichette");
    } finally {
      setStampando(false);
    }
  };

  const fogli = (n: number) => Math.ceil(n / (FORMATI[formato].colonne * FORMATI[formato].righe));
  const quanteStampate = scheda === "registrati" ? conCodice.filter((v) => scelti.has(v.id)).length : nVuote;

  return (
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-orange-500" />Etichette QR</DialogTitle>
        <DialogDescription>
          Si attaccano all'attrezzo: inquadrandole col telefono si apre la sua scheda, e chi è in cantiere segna dove lo lascia.
        </DialogDescription>
      </DialogHeader>

      <Tabs value={scheda} onValueChange={(v) => setScheda(v as typeof scheda)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="registrati">Di quelli registrati</TabsTrigger>
          <TabsTrigger value="vuote">Vuote, da collegare</TabsTrigger>
        </TabsList>

        <TabsContent value="registrati" className="mt-3 space-y-2">
          {conCodice.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Niente da stampare in questo elenco.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={tutti}
                    onCheckedChange={(c) => setScelti(c ? new Set(conCodice.map((v) => v.id)) : new Set())}
                    aria-label="Tutti"
                  />
                  Tutti ({conCodice.length})
                </label>
                <span className="text-xs text-muted-foreground">{scelti.size} scelti</span>
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                {conCodice.map((v) => (
                  <li key={v.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                      <Checkbox
                        checked={scelti.has(v.id)}
                        onCheckedChange={(c) =>
                          setScelti((prev) => {
                            const n = new Set(prev);
                            if (c) n.add(v.id);
                            else n.delete(v.id);
                            return n;
                          })
                        }
                      />
                      <span className="shrink-0 rounded border bg-white px-1.5 font-mono text-xs">{v.codice}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{v.nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="vuote" className="mt-3 space-y-2">
          <p className="text-sm text-muted-foreground">
            Codici nuovi, riservati adesso: le attacchi agli attrezzi e, quando registri un attrezzo, scansioni la sua etichetta e il codice è già quello.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="etichette-quante">Quante</Label>
              <Input
                id="etichette-quante"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={quante}
                onChange={(e) => setQuante(e.target.value)}
                className="w-28"
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">Prefisso {classe === "attrezzatura" ? "ATT" : "MZ"}, da 1 a 500 per volta.</p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-1.5">
        <Label>Foglio</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(FORMATI) as Formato[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFormato(k)}
              aria-pressed={formato === k}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${formato === k ? "border-orange-400 bg-orange-50 text-orange-900" : "hover:bg-muted/50"}`}
            >
              {FORMATI[k].label}
            </button>
          ))}
        </div>
      </div>

      {urlAnteprima && primo && (
        <div className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <img src={urlAnteprima} alt={`QR di ${primo.codice}`} className="h-16 w-16" />
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold">{primo.codice}</p>
            <p className="truncate text-sm">{primo.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{azienda}</p>
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:items-center">
        <span className="mr-auto text-xs text-muted-foreground max-sm:hidden">
          {quanteStampate > 0
            ? `${quanteStampate} ${quanteStampate === 1 ? "etichetta" : "etichette"} · ${fogli(quanteStampate)} ${fogli(quanteStampate) === 1 ? "foglio" : "fogli"}`
            : ""}
        </span>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={stampa} disabled={stampando || quanteStampate === 0}>
          {stampando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
          Stampa
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
