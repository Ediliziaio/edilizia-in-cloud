/**
 * Verifiche igienico-sanitarie nella scheda della pianta: aeroilluminazione (1/8), altezze,
 * superfici minime, bagni e alloggi. Prima i problemi; la relazione si scarica in PDF.
 */
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Download, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { riepilogoVerifiche, verificaPianta, type Verifica } from "../../../shared/planimetrie/verifiche.ts";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { controlloPrimaDellUso } from "../../../shared/planimetrie/verificaDocumento.ts";
import { useControlloPrimaDellUso } from "@/hooks/useVerificaPlanimetria";

const NOMI = { rai: "Aeroilluminazione 1/8", altezza: "Altezza", superficie: "Superficie minima", bagno: "Bagno", alloggio: "Alloggio", interferenza: "Interferenza", scala: "Scala", contenimento: "Muro di contenimento", serramento: "Serramento", tetto: "Tetto" } as const;

export function VerifichePianta({ documento, titolo, ambito, nomeStato, modifica }: { documento: Planimetria; titolo: string; ambito: string; nomeStato: string; modifica?: string }) {
  const { effectiveCompany } = useAuth();
  const [aperto, setAperto] = useState(false);
  const [pdf, setPdf] = useState(false);
  const controllo = useMemo(() => controlloPrimaDellUso(documento, "pdf"), [documento]);
  const { primaDi, dialogo } = useControlloPrimaDellUso(documento, modifica);
  const verifiche = useMemo(() => controllo.ok ? verificaPianta(documento, ambito) : [], [documento, ambito, controllo.ok]);
  const r = riepilogoVerifiche(verifiche);
  const notaAmbito = documento.ambitoDocumento === "ambiente" ? "Singolo ambiente: le verifiche dell’intero alloggio sono escluse." : documento.ambitoDocumento === "alloggio" ? "Alloggio completo: sono incluse superficie e dotazioni dell’alloggio." : "Ambito non specificato: indica nell’editor se la pianta rappresenta un singolo ambiente o l’alloggio completo.";
  if (!controllo.ok) return <section aria-label="Verifiche della pianta" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Verifiche della pianta</h2>
      <Button size="sm" variant="outline" onClick={() => primaDi("pdf", () => undefined)}><Download className="mr-1.5 h-4 w-4" />Relazione PDF</Button>
    </div>
    <Card><CardContent className="space-y-2 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-amber-800"><TriangleAlert className="h-4 w-4" />Verifiche in attesa del controllo del disegno</p>
      <p className="text-muted-foreground">Misure e aperture sono ancora da verificare. Gli esiti di conformità e la relazione PDF saranno disponibili dopo il controllo, per evitare valutazioni basate su dati incerti.</p>
      <p className="text-xs text-muted-foreground">{notaAmbito}</p>
    </CardContent></Card>
    {dialogo}
  </section>;
  if (!verifiche.length) return null;
  const problemi = verifiche.filter((v) => v.esito !== "ok");
  const mostrate: Verifica[] = aperto ? [...problemi, ...verifiche.filter((v) => v.esito === "ok")] : problemi.slice(0, 6);

  const scarica = async () => {
    setPdf(true);
    try {
      const { pdfVerifiche } = await import("@/lib/planimetrie/verifichePdf");
      const dati = await pdfVerifiche({ documento, titolo, stato: nomeStato, azienda: effectiveCompany?.name ?? undefined, verifiche });
      const url = URL.createObjectURL(new Blob([new Uint8Array(dati).buffer as ArrayBuffer], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${titolo.replace(/[^\w-]+/g, "-").toLowerCase() || "pianta"}-verifiche.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      toast.error("Relazione non creata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setPdf(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Verifiche della pianta</h2>
        <Button size="sm" variant="outline" onClick={scarica} disabled={pdf}>
          {pdf ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          Relazione PDF
        </Button>
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">{notaAmbito}</p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" />{r.ok} conformi</span>
            <span className="flex items-center gap-1.5 text-amber-700"><TriangleAlert className="h-4 w-4" />{r.attenzione} da verificare</span>
            <span className="flex items-center gap-1.5 text-red-700"><ShieldAlert className="h-4 w-4" />{r.nonConformi} non conformi</span>
          </div>
          {mostrate.length > 0 && (
            <ul className="divide-y text-sm">
              {mostrate.map((v, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5">
                  <span>
                    <span className={v.esito === "ok" ? "text-emerald-700" : v.esito === "attenzione" ? "text-amber-700" : "text-red-700"}>●</span>{" "}
                    <span className="font-medium">{v.oggetto}</span> <span className="text-xs text-muted-foreground">· {NOMI[v.codice]} · {v.livello}</span>
                    <span className="block text-xs text-muted-foreground">{v.messaggio}</span>
                  </span>
                  {v.valore && <span className="text-xs tabular-nums">{v.valore}{v.richiesto && <span className="text-muted-foreground"> / min {v.richiesto}</span>}</span>}
                </li>
              ))}
            </ul>
          )}
          {(problemi.length > 6 || r.ok > 0) && (
            <Button size="sm" variant="ghost" className="px-0" onClick={() => setAperto((x) => !x)}>
              <ChevronDown className={`mr-1 h-4 w-4 transition-transform ${aperto ? "rotate-180" : ""}`} />
              {aperto ? "Solo i problemi" : `Tutte le verifiche (${verifiche.length})`}
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">DM 5 luglio 1975: finestre almeno 1/8 del pavimento, altezze 2,70 m (servizi 2,40), camere 9/14 m², soggiorno 14 m², alloggio 28/38 m². I regolamenti comunali possono chiedere di più: la verifica vera la firma il tecnico.</p>
        </CardContent>
      </Card>
    </section>
  );
}
