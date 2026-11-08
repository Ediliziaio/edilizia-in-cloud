/**
 * Pezzo sbagliato o rotto: il reclamo (lo stesso compositore email dell'ordine, al fornitore
 * dell'ordine, con le foto dei pezzi; lo spedisce una persona) e il riordino
 * di solo quei pezzi. Il riordino nasce in bozza: l'ordine lo invia l'ufficio, come tutti.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmailComposeDialog, type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { useRiordinaPezzi, useSegnaReclamo } from "@/hooks/useArrivoPosizioni";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { reclamoInHtml, testoReclamo, type ElencoArrivo } from "@/lib/arrivi/arrivoPosizioni";

const BUCKET_FOTO = "campo-rapportini";

export function ArrivoProblemi({ elenco }: { elenco: ElencoArrivo }) {
  // Un pezzo già riordinato si può ancora reclamare: il riordino non avvisa il fornitore del difetto.
  const aperti = useMemo(() => elenco.posizioni.flatMap(p => p.problemi
    .filter(x => x.stato === "aperto" || !x.reclamo_inviato_il)
    .map(x => ({ ...x, posizione: p }))), [elenco]);
  // Chi ha già avuto il reclamo parte tolto: per rifarlo si rimette la spunta.
  const [scelta, setScelta] = useState<Record<string, boolean>>({});
  const [reclamo, setReclamo] = useState<{ ids: string[]; contesto: ComposeContext } | null>(null);
  const [chiediRiordino, setChiediRiordino] = useState(false);
  const [creato, setCreato] = useState<{ id: string; numero?: string } | null>(null);
  const riordina = useRiordinaPezzi(elenco.ordine.id, elenco.ordine.order_id);
  const segnaReclamo = useSegnaReclamo(elenco.ordine.id, elenco.ordine.order_id);

  if (aperti.length === 0 && !creato) return null;

  const spuntato = (x: (typeof aperti)[number]) => scelta[x.id] ?? !x.reclamo_inviato_il;
  const scelti = aperti.filter(spuntato);
  const daRiordinare = scelti.filter(x => x.esito !== "mancante" && x.stato === "aperto");
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

  const preparaReclamo = () => {
    const email = elenco.ordine.email_fornitore;
    if (!email) toast.warning("Questo fornitore non ha un'email in anagrafica: scrivila nel campo A.");
    const testo = testoReclamo(elenco, scelti.map(x => x.id));
    const foto = scelti.flatMap(x => x.foto);
    setReclamo({
      ids: scelti.map(x => x.id),
      contesto: {
        mode: "new",
        initialTo: email ? [email] : [],
        initialSubject: testo.oggetto,
        initialBodyHtml: reclamoInHtml(testo.corpo),
        initialAttachments: foto.map((path, i) => ({
          name: `foto-${i + 1}.${path.split(".").pop() || "jpg"}`, size: 0, mime: "image/jpeg", storage_path: path, bucket: BUCKET_FOTO,
        })),
      },
    });
  };

  return (
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:bg-red-950/10" aria-label="Problemi da gestire">
      <h2 className="text-sm font-bold">Da gestire con il fornitore</h2>

      {aperti.length > 0 && (
        <ul className="space-y-1">
          {aperti.map(x => (
            <li key={x.id}>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={spuntato(x)}
                  onChange={e => setScelta(s => ({ ...s, [x.id]: e.target.checked }))} />
                <span className="min-w-0">{nomeRiga(x)}: {x.esito}{Number(x.quantita) > 1 ? ` (${Number(x.quantita)})` : ""}{x.stato === "riordinato" ? " · già riordinato" : ""}</span>
                {x.reclamo_inviato_il && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Reclamo inviato il {new Date(x.reclamo_inviato_il).toLocaleDateString("it-IT")}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {aperti.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="min-h-11 flex-1" disabled={scelti.length === 0}
            onClick={preparaReclamo}>
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />Scrivi il reclamo
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

      {reclamo && (
        <EmailComposeDialog
          key={reclamo.ids.join("|")}
          open
          onOpenChange={o => { if (!o) setReclamo(null); }}
          context={reclamo.contesto}
          orderId={elenco.ordine.order_id}
          onSent={() => segnaReclamo.mutate(reclamo.ids)}
        />
      )}

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
