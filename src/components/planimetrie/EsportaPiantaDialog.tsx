/**
 * Esporta la pianta (fase 1 del piano di completamento, 1/11/2026): DXF a layer per AutoCAD,
 * PDF in scala con cartiglio, SVG e PNG, in stile tecnico o da presentazione.
 *
 * Le funzioni c'erano (src/lib/planimetrie/esporta, fase 6) ma nessuna pagina le usava.
 * Il cartiglio prende nome, recapiti e logo dell'azienda; se il logo non si carica si va senza.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileImage, FileText, Loader2, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  aziendaDelCartiglio, caricaLogo, ErroreImpaginazione, esportaDxfMigliore, esportaPdf, esportaPng, esportaSvg,
  SCALE_STANDARD, vistaDaPlanimetria, type DatiCartiglio, type FormatoFoglio, type ModoVista, type Orientamento,
} from "@/lib/planimetrie/esporta";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

type Formato = "pdf" | "dxf" | "svg" | "png";
type Stile = "tecnico" | "presentazione";

const FORMATI: Array<{ id: Formato; nome: string; nota: string; icona: typeof FileText }> = [
  { id: "pdf", nome: "PDF in scala", nota: "Da stampare: cartiglio, scala, tabella delle stanze", icona: FileText },
  { id: "dxf", nome: "DXF (AutoCAD)", nota: "Si apre in AutoCAD e nei CAD: muri, demolizioni, nuovo, aperture, quote su layer separati", icona: PenTool },
  { id: "svg", nome: "SVG", nota: "Disegno vettoriale in scala, per grafica e web", icona: FileImage },
  { id: "png", nome: "Immagine PNG", nota: "Per WhatsApp, email e presentazioni", icona: FileImage },
];

function scarica(nome: string, dati: Uint8Array | Blob | string, tipo: string) {
  // Copia in un ArrayBuffer vero: un Uint8Array su SharedArrayBuffer non è un BlobPart.
  const parte: BlobPart = dati instanceof Uint8Array ? new Uint8Array(dati).buffer as ArrayBuffer : dati;
  const url = URL.createObjectURL(new Blob([parte], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const nomeFile = (t: string) => (t || "pianta").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "pianta";

export function EsportaPiantaDialog({
  aperto, onChiudi, documento, titolo, versione, livelloId, propostaId, haProgetto,
}: {
  aperto: boolean;
  onChiudi: () => void;
  documento: Planimetria;
  titolo: string;
  versione: number;
  livelloId: string;
  propostaId?: string;
  /** La pianta ha uno stato di progetto: si può scegliere progetto o confronto. */
  haProgetto: boolean;
}) {
  const { effectiveCompany } = useAuth();
  const { branding } = useBranding();
  const [formato, setFormato] = useState<Formato>("pdf");
  const [modo, setModo] = useState<ModoVista>(haProgetto ? "progetto" : "fatto");
  const [stile, setStile] = useState<Stile>("tecnico");
  const [foglio, setFoglio] = useState<FormatoFoglio>("A4");
  const [orientamento, setOrientamento] = useState<Orientamento>("orizzontale");
  const [scala, setScala] = useState<string>("auto");
  const [cliente, setCliente] = useState("");
  const [cantiere, setCantiere] = useState("");
  const [inCorso, setInCorso] = useState(false);

  // I dati dell'impresa per il cartiglio: si leggono solo quando serve.
  const azienda = useQuery({
    queryKey: ["planimetria-cartiglio-azienda", effectiveCompany?.id],
    enabled: aperto && !!effectiveCompany?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("name, legal_address, legal_postal_code, legal_city, legal_province, vat_number, phone, email")
        .eq("id", effectiveCompany!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const vista = useMemo(() => {
    try {
      return vistaDaPlanimetria(documento, { modo: haProgetto ? modo : "fatto", livelloId, propostaId });
    } catch {
      return null;
    }
  }, [documento, modo, livelloId, propostaId, haProgetto]);

  const anteprima = useMemo(() => {
    if (!vista || !aperto) return null;
    try {
      const { svg } = esportaSvg(vista, { scala: 50, stile, sfondo: "bianco" });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [vista, stile, aperto]);

  const base = `${nomeFile(titolo)}-${haProgetto ? modo : "fatto"}`;

  const esporta = async () => {
    if (!vista) { toast.error("La pianta non ha niente da disegnare in questo stato."); return; }
    setInCorso(true);
    try {
      if (formato === "pdf") {
        const logo = await caricaLogo(branding?.logo_url ?? null).catch((): null => null);
        const cartiglio: DatiCartiglio = {
          azienda: aziendaDelCartiglio(azienda.data ?? { name: effectiveCompany?.name ?? null }, branding ?? null, logo),
          cliente: cliente.trim() || undefined,
          indirizzoCantiere: cantiere.trim() || undefined,
          oggetto: vista.livello ?? undefined,
          data: new Date(),
          versione: `v${versione}`,
        };
        const r = await esportaPdf(vista, cartiglio, { formato: foglio, orientamento, scala: scala === "auto" ? "auto" : Number(scala), stile });
        scarica(`${base}-${foglio}-1-${r.scala}.pdf`, r.dati, "application/pdf");
        toast.success(`PDF pronto in scala 1:${r.scala}`);
      } else if (formato === "dxf") {
        const r = await esportaDxfMigliore(vista, { unita: "cm", scala: 50, stile });
        scarica(`${base}.dxf`, r.dati, "application/dxf");
        toast.success("DXF pronto", { description: "Unità: centimetri. Layer MURI, DEMOLIZIONI, NUOVO, APERTURE, QUOTE, TESTI, ARREDI, LOCALI." });
      } else if (formato === "svg") {
        const r = esportaSvg(vista, { scala: 50, stile, sfondo: "bianco" });
        scarica(`${base}.svg`, r.svg, "image/svg+xml");
        toast.success("SVG pronto in scala 1:50");
      } else {
        const r = await esportaPng(vista, { scala: 50, stile, sfondo: "bianco", dpi: 200 });
        scarica(`${base}.png`, r.blob, "image/png");
        toast.success("Immagine pronta");
      }
    } catch (e) {
      const messaggio = e instanceof ErroreImpaginazione || e instanceof Error ? e.message : "Esportazione non riuscita.";
      toast.error("Esportazione non riuscita", { description: messaggio });
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => { if (!v && !inCorso) onChiudi(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Esporta la pianta</DialogTitle>
          <DialogDescription>Scegli il formato: il file si scarica subito, in scala e con le misure della pianta.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato">
              {FORMATI.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={formato === f.id} onClick={() => setFormato(f.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${formato === f.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}>
                  <f.icona className="mb-1 h-4 w-4 text-primary" aria-hidden="true" />
                  <p className="text-sm font-medium">{f.nome}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{f.nota}</p>
                </button>
              ))}
            </div>

            {haProgetto && (
              <div className="space-y-1.5">
                <Label className="text-xs">Cosa disegnare</Label>
                <ToggleGroup type="single" value={modo} onValueChange={(v) => v && setModo(v as ModoVista)} variant="outline" size="sm" className="justify-start">
                  <ToggleGroupItem value="fatto">Com'è oggi</ToggleGroupItem>
                  <ToggleGroupItem value="progetto">Progetto</ToggleGroupItem>
                  <ToggleGroupItem value="confronto">Confronto</ToggleGroupItem>
                </ToggleGroup>
                {modo === "confronto" && <p className="text-[11px] text-muted-foreground">Giallo = da demolire, rosso = nuovo.</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Stile</Label>
              <ToggleGroup type="single" value={stile} onValueChange={(v) => v && setStile(v as Stile)} variant="outline" size="sm" className="justify-start">
                <ToggleGroupItem value="tecnico">Tecnico</ToggleGroupItem>
                <ToggleGroupItem value="presentazione">Presentazione</ToggleGroupItem>
              </ToggleGroup>
              {stile === "presentazione" && <p className="text-[11px] text-muted-foreground">Pavimenti e arredi colorati: per il cliente.</p>}
            </div>

            {formato === "pdf" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Foglio</Label>
                    <Select value={foglio} onValueChange={(v) => setFoglio(v as FormatoFoglio)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="A3">A3</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Verso</Label>
                    <Select value={orientamento} onValueChange={(v) => setOrientamento(v as Orientamento)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="orizzontale">Orizzontale</SelectItem><SelectItem value="verticale">Verticale</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Scala</Label>
                    <Select value={scala} onValueChange={setScala}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automatica</SelectItem>
                        {SCALE_STANDARD.map((s) => <SelectItem key={s} value={String(s)}>1:{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="cartiglio-cliente">Committente (facoltativo)</Label>
                    <Input id="cartiglio-cliente" className="h-9" value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Mario Rossi" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor="cartiglio-cantiere">Indirizzo del cantiere</Label>
                    <Input id="cartiglio-cantiere" className="h-9" value={cantiere} onChange={(e) => setCantiere(e.target.value)} placeholder="Via Roma 12, Torino" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Nel cartiglio: nome, recapiti e logo della tua azienda, data e versione {versione}.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Anteprima</Label>
            <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border bg-white">
              {anteprima ? <img src={anteprima} alt="Anteprima della pianta da esportare" className="h-full w-full object-contain" />
                : <p className="p-4 text-center text-sm text-muted-foreground">Niente da disegnare in questo stato.</p>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Chiudi</Button>
          <Button onClick={() => void esporta()} disabled={inCorso || !vista}>
            {inCorso ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Scarica {FORMATI.find((f) => f.id === formato)?.nome}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
