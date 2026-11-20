import { apriPdfPos } from "@/lib/sicurezza/apriPdfPos";
import { toast } from "sonner";
import { NuovoPosDialog } from "@/components/sicurezza/pos/NuovoPosDialog";
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
import { Copy, FileDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  useEliminaPos,
  usePosElenco,
  type PosRiga,
} from "@/hooks/usePos";
import {
  completezzaPercento,
  vociMancanti,
} from "../../../supabase/functions/_shared/posModello";

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function PosElencoTab({ orders }: { orders: Array<{ id: string; description: string | null; order_code: string | null }> }) {
  const navigate = useNavigate();
  const perms = usePermissions();
  const puoScrivere =
    (perms.canViewSicurezzaCantiere || perms.isAdmin) && !perms.solaLettura;
  const { data: elenco = [], isLoading, isError, refetch } = usePosElenco();
  const [riuso,setRiuso]=useState<PosRiga|null>(null);
  const elimina = useEliminaPos();

  const [expandedMissing, setExpandedMissing] = useState<Set<string>>(
    new Set(),
  );
  const [nuovoAperto, setNuovoAperto] = useState(false);
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
                onClick={() => setNuovoAperto(true)}
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
      {nuovoAperto && puoScrivere && (
        <NuovoPosDialog commesseConPos={conPos} onClose={() => setNuovoAperto(false)}
          onCreato={(pos) => {
            setNuovoAperto(false);
            navigate(`/azienda/sicurezza-cantiere/pos/${pos.pos_id}`, { state: { avvisi: pos.avvisi } });
          }} />
      )}

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
