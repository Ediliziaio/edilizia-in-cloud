import { apriPdfPos } from "@/lib/sicurezza/apriPdfPos";
import { toast } from "sonner";
import { RiusoPosDialog } from "@/components/sicurezza/pos/RiusoPosDialog";
import { SafetyWorkflow } from "@/components/sicurezza/SafetyWorkflow";
import { POS_STAGES, fasePos } from "@/lib/sicurezza/workflow";
/**
 * Scheda POS di Sicurezza cantiere: l'elenco dei POS con stato, revisione e
 * completezza, e la creazione di un POS nuovo sul modello ufficiale a partire
 * dalla commessa (i dati li riprende l'app, niente AI).
 */
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Copy, FileDown, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { verificaIterNegativa } from "@/lib/sicurezza/posIter";
import {
  useCreaPos,
  useModelliPos,
  useArchiviaModelloPos,
  useEliminaPos,
  usePosElenco,
  type PosRiga,
} from "@/hooks/usePos";
import {
  RUOLO_IMPRESA_LABEL,
  completezzaPercento,
  vociMancanti,
  type RuoloImpresa,
} from "../../../supabase/functions/_shared/posModello";

interface Props {
  orders: Array<{
    id: string;
    description: string | null;
    order_code: string | null;
  }>;
}

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function PosElencoTab({ orders }: Props) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoScrivere =
    (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;
  const { data: elenco = [], isLoading, isError, refetch } = usePosElenco();
  const crea = useCreaPos();
  const [riuso,setRiuso]=useState<PosRiga|null>(null);
  const [modelloId,setModelloId]=useState("vuoto");
  const elimina = useEliminaPos();
  const archiviaModello=useArchiviaModelloPos();

  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(
    new Set(),
  );
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const modelli=useModelliPos(nuovoAperto);
  const [orderId, setOrderId] = useState("");
  const [ruolo, setRuolo] = useState<RuoloImpresa>("affidataria_esecutrice");
  const [daEliminare, setDaEliminare] = useState<PosRiga | null>(null);
  const [scaricando,setScaricando]=useState("");

  const conPos = useMemo(
    () => new Set(elenco.map((p) => p.order_id)),
    [elenco],
  );

  const apriPos = (p: PosRiga) =>
    navigate(`/azienda/sicurezza-cantiere/pos/${p.id}`);
  const azioniPos = (p: PosRiga) => (
    <>
      {puoScrivere && !p.daCompilare && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Duplica POS o salva modello" title="Duplica POS o salva modello" onClick={()=>setRiuso(p)}><Copy className="h-4 w-4"/></Button>}
      {!p.daCompilare && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="PDF conservato o anteprima" title="PDF conservato, oppure anteprima in bozza" disabled={!!scaricando} onClick={async()=>{
        setScaricando(p.id);try{await apriPdfPos(p.company_id,p.id,p.revisione);}catch(e){toast.error(e instanceof Error?e.message:"PDF non disponibile");}finally{setScaricando("");}
      }}><FileDown className="h-4 w-4"/></Button>}
      {puoScrivere && p.status === "bozza" && p.revisione === 0 && !Object.values(p.iter).some(Boolean) && (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          aria-label="Elimina il POS"
          onClick={() => setDaEliminare(p)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </>
  );
  const creaPos = async () => {
    if (!puoScrivere || !orderId) return;
    try {
      const r = await crea.mutateAsync({ orderId, ruoloImpresa: ruolo, modelloId: modelloId === "vuoto" ? undefined : modelloId });
      setNuovoAperto(false);
      navigate(`/azienda/sicurezza-cantiere/pos/${r.pos_id}`, {
        state: { avvisi: r.avvisi },
      });
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <div className="space-y-4 max-sm:space-y-2">
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare i POS.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => refetch()}
          >
            Riprova
          </button>
        </div>
      ) : (
        <SafetyWorkflow<PosRiga>
          namespace="pos"
          toolbarAction={
            puoScrivere ? (
              <Button
                size="sm"
                onClick={() => {
                  setOrderId("");
                  setModelloId("vuoto");
                  setRuolo("affidataria_esecutrice");
                  setNuovoAperto(true);
                }}
                className="bg-gradient-to-r from-orange-500 to-eic-amber-strong text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
              >
                <Plus className="mr-1 h-4 w-4" />
                Nuovo POS
              </Button>
            ) : null
          }
          label="POS"
          items={elenco}
          stages={POS_STAGES}
          getStage={fasePos}
          onOpen={apriPos}
          getTitle={(p) =>
            `POS ${p.commessa?.order_code ?? p.id.slice(0, 8)} · Rev. ${p.revisione}`
          }
          getSearch={(p) =>
            [
              p.commessa?.order_code,
              p.commessa?.description,
              p.approvato_da_nome,
              p.status,
            ]
              .filter(Boolean)
              .join(" ")
          }
          getOrderId={(p) => p.order_id}
          orders={orders}
          canWrite={puoScrivere}
          note="La fase Da approvare indica una bozza completa. L’approvazione viene registrata nell’editor, dopo i controlli previsti; per modificare un POS approvato si crea una revisione."
          onTransition={(p, target) => ({
            title:
              target === "approvato"
                ? "Approva il POS dall’editor"
                : "Completa il passaggio nel POS",
            description:
              p.status === "approvato"
                ? "Questo POS è approvato. Aprilo e crea una nuova revisione per modificarne i contenuti."
                : target === "approvare" && fasePos(p) === "compilare"
                  ? "Completa le voci mancanti: la bozza comparirà tra quelle da approvare quando sarà completa."
                  : "Apri il POS per controllare i contenuti e registrare il passaggio effettivo. Il trascinamento non sostituisce i controlli di approvazione.",
            run: () => apriPos(p),
          })}
          renderCard={(p) => (
            <>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {p.commessa?.description}
              </p>
              <div className="flex items-center justify-between text-xs">
                <span>
                  {p.daCompilare
                    ? "Modello da compilare"
                    : `${completezzaPercento(p.contenuto)}% compilato`}
                </span>
                <span>Rev. {p.revisione}</span>
              </div>
              {!p.daCompilare && (
                <Progress
                  value={completezzaPercento(p.contenuto)}
                  className="h-1.5"
                />
              )}
              {fasePos(p) === "compilare" && (
                <details
                  open={expandedMissing.has(p.id)}
                  className="text-xs text-amber-800"
                >
                  <summary
                    className="cursor-pointer"
                    onClick={(event) => {
                      event.preventDefault();
                      setExpandedMissing((before) => {
                        const next = new Set(before);
                        if (next.has(p.id)) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      });
                    }}
                  >
                    {vociMancanti(p.contenuto).length} voci da completare
                  </summary>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {vociMancanti(p.contenuto).map((v, index) => (
                      <li key={`${v.riferimento}-${index}`}>{v.testo}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-xs text-muted-foreground">
                Datore di lavoro:{" "}
                {p.contenuto.impresa.datore_lavoro || "Da indicare"}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.status === "approvato"
                  ? `Approvato da ${p.approvato_da_nome ?? "nome non registrato"}`
                  : `Creato il ${dataIt(p.created_at)}`}
              </p>
              {p.iter.firma_datore_il && (
                <p className="text-xs text-muted-foreground">
                  Firma datore registrata: {dataIt(p.iter.firma_datore_il)}
                </p>
              )}
              {verificaIterNegativa(p.contenuto, p.iter) && (
                <p className="text-xs font-medium text-red-700">Verifica negativa: i lavori non possono iniziare</p>
              )}
            </>
          )}
          renderActions={azioniPos}
          columns={[
            {
              label: "Commessa",
              render: (p) => (
                <Link
                  to={`/azienda/ordini/${p.order_id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {p.commessa?.order_code ?? "Apri commessa"}
                </Link>
              ),
            },
            {
              label: "Cantiere",
              render: (p) => (
                <span
                  className="block max-w-64 truncate"
                  title={p.commessa?.description ?? undefined}
                >
                  {p.commessa?.description ?? "—"}
                </span>
              ),
            },
            { label: "Revisione", render: (p) => `Rev. ${p.revisione}` },
            {
              label: "Compilazione",
              render: (p) =>
                p.daCompilare
                  ? "Modello da compilare"
                  : `${completezzaPercento(p.contenuto)}%`,
            },
            {
              label: "Approvato da",
              render: (p) => p.approvato_da_nome ?? "—",
            },
            {
              label: "Approvazione",
              render: (p) => dataIt(p.approvato_il) || "—",
            },
            {
              label: "Firma datore registrata",
              render: (p) => dataIt(p.iter.firma_datore_il) || "—",
            },
            { label: "Creazione", render: (p) => dataIt(p.created_at) },
          ]}
        />
      )}

      {riuso && <RiusoPosDialog key={riuso.id} pos={riuso} onClose={()=>setRiuso(null)}/>}
      <Dialog open={nuovoAperto} onOpenChange={setNuovoAperto}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo POS</DialogTitle>
            <DialogDescription className="max-sm:sr-only">
              L’app recupera i dati disponibili della commessa. Verifica incarichi, lavoratori e formazione prima dell’approvazione.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2"><Label htmlFor="nuovo-pos-modello">Punto di partenza</Label>
                {modelloId!=="vuoto" && <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={archiviaModello.isPending||crea.isPending} onClick={async()=>{try{await archiviaModello.mutateAsync(modelloId);setModelloId("vuoto");}catch{/* keep selection on error */}}}>Archivia versione</Button>}
              </div>
              <Select value={modelloId} onValueChange={setModelloId} disabled={crea.isPending}><SelectTrigger id="nuovo-pos-modello"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="vuoto">Dati della commessa, senza modello</SelectItem>{(modelli.data||[]).map(m=><SelectItem key={m.id} value={m.id}>{m.nome} · v{m.versione}</SelectItem>)}</SelectContent></Select>
              {modelli.isError && <p role="alert" className="text-xs text-destructive">Modelli non caricati. <button onClick={()=>modelli.refetch()} className="underline">Riprova</button></p>}
              {modelloId!=="vuoto" && <p className="text-xs text-muted-foreground">{modelli.data?.find(m=>m.id===modelloId)?.ambito} — Le lavorazioni riprese richiedono verifica nel nuovo cantiere.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nuovo-pos-commessa">Commessa</Label>
              <Select value={orderId || undefined} onValueChange={setOrderId}>
                <SelectTrigger id="nuovo-pos-commessa">
                  <SelectValue placeholder="Scegli la commessa" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_code ? `${o.order_code} — ` : ""}
                      {o.description}
                      {conPos.has(o.id) ? " (ha già un POS)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {orderId && conPos.has(orderId) && (
                <p className="flex items-center gap-1 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Questa commessa ha già un POS: per cambiarlo di solito basta
                  una nuova revisione.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>La tua impresa in questo cantiere è</Label>
              <RadioGroup
                value={ruolo}
                onValueChange={(v) => setRuolo(v as RuoloImpresa)}
                className="space-y-1"
              >
                {(Object.keys(RUOLO_IMPRESA_LABEL) as RuoloImpresa[]).map(
                  (r) => (
                    <Label
                      key={r}
                      htmlFor={`nuovo-ruolo-${r}`}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm font-normal"
                    >
                      <RadioGroupItem id={`nuovo-ruolo-${r}`} value={r} />
                      {RUOLO_IMPRESA_LABEL[r]}
                    </Label>
                  ),
                )}
              </RadioGroup>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="max-sm:hidden"
              onClick={() => setNuovoAperto(false)}
            >
              Annulla
            </Button>
            <Button onClick={creaPos} disabled={!orderId || crea.isPending}>
              {crea.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              Crea il POS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!daEliminare}
        onOpenChange={(o) => !o && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo POS?</AlertDialogTitle>
            <AlertDialogDescription>
              Il POS in bozza di «
              {daEliminare?.commessa?.order_code ||
                daEliminare?.commessa?.description ||
                "commessa"}
              » sarà eliminato definitivamente. È possibile solo se non ha firme, approvazioni, iter registrato o revisioni approvate da conservare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
