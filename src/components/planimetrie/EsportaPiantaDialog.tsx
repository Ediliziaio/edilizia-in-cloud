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
import { Download, FileImage, FileText, Loader2, Paperclip, PenTool } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CampoIndirizzo } from "@/components/shared/CampoIndirizzo";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { prospetto, sezione, type Disegno2D } from "@/lib/planimetrie/prospetti";
import { allegaSchedeTecniche } from "@/lib/quotes/allegatiPreventivo";
import {
  allegatoPreventivo,
  aziendaDelCartiglio, caricaLogo, ErroreImpaginazione, esportaDxfMigliore, esportaPdf, esportaPng, esportaSvg,
  SCALE_STANDARD, vistaDaPlanimetria, type DatiCartiglio, type FormatoFoglio, type ModoVista, type Orientamento,
} from "@/lib/planimetrie/esporta";
import type { Planimetria, StatoPianta } from "../../../shared/planimetrie/modello.ts";

/** I disegni della tavola completa: i quattro prospetti e una sezione a metà, sulla parte lunga. */
export function disegniDellaTavola(stato: StatoPianta | null | undefined): Disegno2D[] {
  if (!stato || !stato.muri.some((m) => m.stato !== "da_demolire")) return [];
  const pts = stato.muri.flatMap((m) => [m.p1, m.p2]);
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  // il taglio attraversa il lato lungo: si vedono più stanze
  const taglio = maxX - minX >= maxY - minY
    ? { asse: "verticale" as const, valore: (minX + maxX) / 2 }
    : { asse: "orizzontale" as const, valore: (minY + maxY) / 2 };
  return [
    prospetto(stato, "sud"), prospetto(stato, "nord"), prospetto(stato, "est"), prospetto(stato, "ovest"),
    sezione(stato, taglio, "Sezione A-A"),
  ].filter((d) => d.primitive.length > 0);
}

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
  aperto, onChiudi, documento, titolo, versione, livelloId, propostaId, haProgetto, planimetriaId,
}: {
  aperto: boolean;
  /** Per allegare la pianta a un preventivo (fase 8): il file prende l'id e la versione. */
  planimetriaId?: string;
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
  const [preventivoId, setPreventivoId] = useState<string>("");
  const [allegando, setAllegando] = useState(false);
  // Tavola completa: dopo la pianta, i fogli con prospetti e sezione.
  const [conProspetti, setConProspetti] = useState(false);

  // Preventivi a cui si può allegare: quelli standard (i moduli fanno il PDF nel browser), non firmati.
  const preventivi = useQuery({
    queryKey: ["planimetria-preventivi-allegabili", effectiveCompany?.id],
    enabled: aperto && !!effectiveCompany?.id && !!planimetriaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes")
        .select("id, quote_number, title, client_name, status, source")
        .eq("company_id", effectiveCompany!.id).is("deleted_at", null).is("signed_at", null)
        .order("created_at", { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []).filter((q) => !String(q.source ?? "").startsWith("modulo:"));
    },
  });

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

  // Lo stato disegnato nei prospetti: com'è oggi, oppure la proposta scelta.
  const statoDisegnato = useMemo(() => {
    const liv = documento.livelli.find((l) => l.id === livelloId) ?? documento.livelli[0];
    if (!liv) return null;
    if (!haProgetto || modo === "fatto") return liv.fatto;
    return liv.proposte.find((p) => p.id === propostaId) ?? liv.proposte[0] ?? liv.fatto;
  }, [documento, livelloId, propostaId, haProgetto, modo]);

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

  const cartiglioPerOra = async (): Promise<DatiCartiglio | null> => {
    if (!vista) return null;
    const logo = await caricaLogo(branding?.logo_url ?? null).catch((): null => null);
    return {
      azienda: aziendaDelCartiglio(azienda.data ?? { name: effectiveCompany?.name ?? null }, branding ?? null, logo),
      cliente: cliente.trim() || undefined,
      indirizzoCantiere: cantiere.trim() || undefined,
      oggetto: vista.livello ?? undefined,
      data: new Date(),
      versione: `v${versione}`,
    };
  };

  /** La pianta in A4 come scheda del preventivo: si accoda al PDF che parte al cliente. */
  const allega = async () => {
    if (!vista || !planimetriaId || !preventivoId || !effectiveCompany?.id) return;
    setAllegando(true);
    try {
      const cartiglio = await cartiglioPerOra();
      if (!cartiglio) throw new Error("La pianta non ha niente da disegnare.");
      const a = await allegatoPreventivo(vista, cartiglio, { stile });
      const percorso = `${effectiveCompany.id}/planimetrie/${planimetriaId}-v${versione}-${Date.now()}.pdf`;
      const corpo = new Uint8Array(a.dati).buffer as ArrayBuffer;
      const { error: errFile } = await supabase.storage.from("quote-materials").upload(percorso, new Blob([corpo], { type: "application/pdf" }), { contentType: "application/pdf" });
      if (errFile) throw new Error("Il file della pianta non si è caricato: controlla di poter modificare i preventivi.");
      const { data: utente } = await supabase.auth.getUser();
      const { data: scheda, error: errScheda } = await supabase.from("quote_pdf_materials")
        .insert({ company_id: effectiveCompany.id, created_by: utente.user!.id, name: `Pianta — ${titolo} (v${versione})`, storage_path: percorso, category: "planimetria", file_size_bytes: a.dati.byteLength })
        .select("id").single();
      if (errScheda || !scheda) throw new Error("La scheda della pianta non si è creata.");
      const nonAllegate = await allegaSchedeTecniche(preventivoId, [{ material_id: scheda.id, sort_order: 0, nome: titolo }]);
      if (nonAllegate.length) throw new Error("La pianta non si è allegata al preventivo.");
      const q = preventivi.data?.find((x) => x.id === preventivoId);
      toast.success("Pianta allegata al preventivo", { description: `${q?.quote_number ?? ""} — esce in fondo al PDF del preventivo (se «schede tecniche» è acceso).` });
    } catch (e) {
      toast.error("Allegato non riuscito", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setAllegando(false);
    }
  };

  const esporta = async () => {
    if (!vista) { toast.error("La pianta non ha niente da disegnare in questo stato."); return; }
    setInCorso(true);
    try {
      if (formato === "pdf") {
        const cartiglio = (await cartiglioPerOra())!;
        const r = await esportaPdf(vista, cartiglio, { formato: foglio, orientamento, scala: scala === "auto" ? "auto" : Number(scala), stile });
        const disegni = conProspetti ? disegniDellaTavola(statoDisegnato) : [];
        if (disegni.length) {
          const { accodaTavole, accodaFoglioImpianti } = await import("@/lib/planimetrie/tavole");
          const intestazione = [titolo, vista.livello].filter(Boolean).join(" — ");
          const t = await accodaTavole(r.dati, disegni, { formato: foglio, intestazione, primoNumero: 2 });
          // con prese, sanitari o split: un foglio in più con punti e linee degli impianti
          const imp = statoDisegnato ? await accodaFoglioImpianti(t.dati, statoDisegnato, { formato: foglio, intestazione, numero: 2 + t.fogli }) : null;
          scarica(`${base}-tavola-${foglio}.pdf`, imp?.dati ?? t.dati, "application/pdf");
          toast.success(`Tavola pronta: pianta 1:${r.scala}, prospetti e sezione 1:${t.scala}${imp ? ", impianti" : ""}`, { description: `${1 + t.fogli + (imp ? 1 : 0)} fogli.` });
        } else {
          scarica(`${base}-${foglio}-1-${r.scala}.pdf`, r.dati, "application/pdf");
          toast.success(`PDF pronto in scala 1:${r.scala}`);
        }
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
                    <CampoIndirizzo id="cartiglio-cantiere" className="h-9" value={cantiere} onChange={setCantiere} placeholder="Via Roma 12, Torino" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Nel cartiglio: nome, recapiti e logo della tua azienda, data e versione {versione}.</p>
                <div className="flex items-start justify-between gap-3 border-t pt-3">
                  <div>
                    <Label htmlFor="tavola-completa" className="text-xs">Tavola completa</Label>
                    <p className="text-[11px] text-muted-foreground">Dopo la pianta, i quattro prospetti e una sezione, in scala, nello stesso PDF; se ci sono impianti, anche il foglio con punti e linee.</p>
                  </div>
                  <Switch id="tavola-completa" checked={conProspetti} onCheckedChange={setConProspetti} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {planimetriaId && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs">Allega a un preventivo</Label>
                <div className="flex gap-2">
                  <Select value={preventivoId} onValueChange={setPreventivoId}>
                    <SelectTrigger className="h-9 flex-1" aria-label="Preventivo"><SelectValue placeholder={preventivi.isLoading ? "Caricamento…" : "Scegli il preventivo"} /></SelectTrigger>
                    <SelectContent>
                      {(preventivi.data ?? []).map((q) => (
                        <SelectItem key={q.id} value={q.id}>{[q.quote_number, q.client_name || q.title].filter(Boolean).join(" — ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="h-9" disabled={!preventivoId || allegando || !vista} onClick={() => void allega()}>
                    {allegando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}Allega
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Un foglio A4 in scala con il cartiglio, in fondo al PDF del preventivo. Per i preventivi standard; non firmati.</p>
              </div>
            )}
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
