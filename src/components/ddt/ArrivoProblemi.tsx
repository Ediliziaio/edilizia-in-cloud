/**
 * Pezzo sbagliato o rotto: il reclamo (testo pronto, lo spedisce una persona) e il riordino
 * di solo quei pezzi. Il riordino nasce in bozza: l'ordine lo invia l'ufficio, come tutti.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Loader2, Mail, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRiordinaPezzi } from "@/hooks/useArrivoPosizioni";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { testoReclamo, type ElencoArrivo } from "@/lib/arrivi/arrivoPosizioni";

export function ArrivoProblemi({ elenco }: { elenco: ElencoArrivo }) {
  const aperti = useMemo(() => elenco.posizioni.flatMap(p => p.problemi.filter(x => x.stato === "aperto").map(x => ({ ...x, posizione: p }))), [elenco]);
  const [esclusi, setEsclusi] = useState<Set<string>>(new Set());
  const [reclamo, setReclamo] = useState<{ oggetto: string; corpo: string } | null>(null);
  const [chiediRiordino, setChiediRiordino] = useState(false);
  const [creato, setCreato] = useState<{ id: string; numero?: string } | null>(null);
  const riordina = useRiordinaPezzi(elenco.ordine.id, elenco.ordine.order_id);

  if (aperti.length === 0 && !creato) return null;

  const scelti = aperti.filter(x => !esclusi.has(x.id));
  const daRiordinare = scelti.filter(x => x.esito !== "mancante");
  const nomeRiga = (x: (typeof aperti)[number]) => [x.posizione.riferimento, x.posizione.nome].filter(Boolean).join(" — ");

  const riordinaOra = (gratis: boolean) => {
    riordina.mutate({ esiti: daRiordinare.map(x => x.id), gratis }, {
      onSuccess: r => {
        setChiediRiordino(false);
        setCreato({ id: r.purchase_order_id, numero: r.numero });
        toast.success(r.gia_fatto ? "Il riordino era già pronto." : "Riordino pronto in bozza.");
      },
      onError: e => toast.error(messaggioErrore(e, "Riordino non creato.")),
    });
  };

  const copia = async () => {
    if (!reclamo) return;
    try {
      await navigator.clipboard.writeText(`${reclamo.oggetto}\n\n${reclamo.corpo}`);
      toast.success("Testo copiato");
    } catch {
      toast.error("Copia non riuscita: seleziona il testo a mano.");
    }
  };

  const linkEmail = reclamo
    ? `mailto:${encodeURIComponent(elenco.ordine.email_fornitore ?? "")}?subject=${encodeURIComponent(reclamo.oggetto)}&body=${encodeURIComponent(reclamo.corpo)}`
    : "";

  return (
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:bg-red-950/10" aria-label="Problemi da gestire">
      <h2 className="text-sm font-bold">Da gestire con il fornitore</h2>

      {aperti.length > 0 && (
        <ul className="space-y-1">
          {aperti.map(x => (
            <li key={x.id}>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!esclusi.has(x.id)}
                  onChange={e => setEsclusi(s => { const n = new Set(s); if (e.target.checked) n.delete(x.id); else n.add(x.id); return n; })} />
                <span className="min-w-0">{nomeRiga(x)}: {x.esito}{Number(x.quantita) > 1 ? ` (${Number(x.quantita)})` : ""}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {aperti.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={scelti.length === 0}
            onClick={() => setReclamo(testoReclamo(elenco, scelti.map(x => x.id)))}>
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />Prepara il reclamo
          </Button>
          <Button type="button" className="min-h-11 flex-1" disabled={daRiordinare.length === 0} onClick={() => setChiediRiordino(true)}>
            <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />Riordina solo questi
          </Button>
        </div>
      )}

      {creato && (
        <p className="text-sm">
          Riordino {creato.numero ?? ""} in bozza: <Link className="font-semibold text-primary underline" to={`/azienda/ordini-acquisto/${creato.id}`}>aprilo e invialo</Link>.
        </p>
      )}

      <Dialog open={!!reclamo} onOpenChange={o => { if (!o) setReclamo(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reclamo al fornitore</DialogTitle>
            <DialogDescription>Il sistema non spedisce niente: controlla il testo e mandalo tu.</DialogDescription>
          </DialogHeader>
          {reclamo && (
            <Textarea rows={12} aria-label="Testo del reclamo" className="text-base" value={reclamo.corpo}
              onChange={e => setReclamo({ ...reclamo, corpo: e.target.value })} />
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void copia()}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copia</Button>
            <Button asChild className="min-h-11"><a href={linkEmail}><Mail className="mr-2 h-4 w-4" aria-hidden="true" />Apri nella posta</a></Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={chiediRiordino} onOpenChange={setChiediRiordino}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{daRiordinare.length === 1 ? "Riordina 1 pezzo" : `Riordina ${daRiordinare.length} pezzi`}</DialogTitle>
            <DialogDescription>Nasce un ordine in bozza, legato alle stesse posizioni. Chi paga questi pezzi?</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button type="button" className="min-h-12 w-full" disabled={riordina.isPending} onClick={() => riordinaOra(true)}>
              {riordina.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Li sostituisce gratis il fornitore
            </Button>
            <Button type="button" variant="outline" className="min-h-12 w-full" disabled={riordina.isPending} onClick={() => riordinaOra(false)}>
              Si pagano, allo stesso prezzo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Gratis: il riordino vale zero, nessun costo doppio in commessa.</p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
