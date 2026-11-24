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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function dataIt(iso: string | null | undefined) {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function PosElencoTab({ orders }: { orders: Array<{ id: string; description: string | null; order_code: string | null }> }) {
  const t = useT();
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
      {puoScrivere && !p.daCompilare && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("Duplica POS o salva modello")} title={t("Duplica POS o salva modello")} onClick={()=>setRiuso(p)}><Copy className="h-4 w-4"/></Button>}
      {!p.daCompilare && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={t("PDF conservato o anteprima")} title={t("PDF conservato, oppure anteprima in bozza")} disabled={!!scaricando} onClick={async()=>{
        setScaricando(p.id);try{await apriPdfPos(p.company_id,p.id,p.revisione);}catch(e){toast.error(e instanceof Error?e.message:t("PDF non disponibile"));}finally{setScaricando("");}
      }}><FileDown className="h-4 w-4"/></Button>}
      {puoScrivere && p.status === "bozza" && p.revisione === 0 && !Object.values(p.iter).some(Boolean) && (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-destructive"
          aria-label={t("Elimina il POS")}
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
          {t("Non riesco a caricare i POS.")}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => refetch()}
          >
            {t("Riprova")}
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
                {t("Nuovo POS")}
              </Button>
            ) : null
          }
          label="POS"
          items={elenco}
          stages={POS_STAGES}
          getStage={fasePos}
          onOpen={apriPos}
          getTitle={(p) =>
            t("POS {codice} · Rev. {n}", { codice: p.commessa?.order_code ?? p.id.slice(0, 8), n: String(p.revisione ?? "") })
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
          note={t("La fase Da approvare indica una bozza completa. L’approvazione viene registrata nell’editor, dopo i controlli previsti; per modificare un POS approvato si crea una revisione.")}
          onTransition={(p, target) => ({
            title:
              target === "approvato"
                ? t("Approva il POS dall’editor")
                : t("Completa il passaggio nel POS"),
            description:
              p.status === "approvato"
                ? t("Questo POS è approvato. Aprilo e crea una nuova revisione per modificarne i contenuti.")
                : target === "approvare" && fasePos(p) === "compilare"
                  ? t("Completa le voci mancanti: la bozza comparirà tra quelle da approvare quando sarà completa.")
                  : t("Apri il POS per controllare i contenuti e registrare il passaggio effettivo. Il trascinamento non sostituisce i controlli di approvazione."),
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
                    ? t("Modello da compilare")
                    : t("{contenuto}% compilato", { contenuto: String(completezzaPercento(p.contenuto) ?? "") })}
                </span>
                <span>{t("Rev. {n}", { n: String(p.revisione ?? "") })}</span>
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
                  >{t("{n} voci da completare", { n: vociMancanti(p.contenuto).length })}</summary>
                  <ul className="mt-1 list-disc space-y-1 pl-4">
                    {vociMancanti(p.contenuto).map((v, index) => (
                      <li key={`${v.riferimento}-${index}`}>{v.testo}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-xs text-muted-foreground">
                {t("Datore di lavoro:")}{" "}
                {p.contenuto.impresa.datore_lavoro || t("Da indicare")}
              </p>
              <p className="text-xs text-muted-foreground">
                {p.status === "approvato"
                  ? t("Approvato da {nome}", { nome: p.approvato_da_nome ?? t("nome non registrato") })
                  : t("Creato il {created_at}", { created_at: String(dataIt(p.created_at) ?? "") })}
              </p>
              {p.iter.firma_datore_il && (
                <p className="text-xs text-muted-foreground">{t("Firma datore registrata: {firma_datore_il}", { firma_datore_il: String(dataIt(p.iter.firma_datore_il) ?? "") })}</p>
              )}
              {verificaIterNegativa(p.contenuto, p.iter) && (
                <p className="text-xs font-medium text-red-700">{t("Verifica negativa: i lavori non possono iniziare")}</p>
              )}
            </>
          )}
          renderActions={azioniPos}
          columns={[
            {
              label: t("Commessa"),
              render: (p) => (
                <Link
                  to={`/azienda/ordini/${p.order_id}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {p.commessa?.order_code ?? t("Apri commessa")}
                </Link>
              ),
            },
            {
              label: t("Cantiere"),
              render: (p) => (
                <span
                  className="block max-w-64 truncate"
                  title={p.commessa?.description ?? undefined}
                >
                  {p.commessa?.description ?? "—"}
                </span>
              ),
            },
            { label: t("Revisione"), render: (p) => t("Rev. {n}", { n: String(p.revisione ?? "") }) },
            {
              label: t("Compilazione"),
              render: (p) =>
                p.daCompilare
                  ? t("Modello da compilare")
                  : `${completezzaPercento(p.contenuto)}%`,
            },
            {
              label: t("Approvato da"),
              render: (p) => p.approvato_da_nome ?? "—",
            },
            {
              label: t("Approvazione"),
              render: (p) => dataIt(p.approvato_il) || "—",
            },
            {
              label: t("Firma datore registrata"),
              render: (p) => dataIt(p.iter.firma_datore_il) || "—",
            },
            { label: t("Creazione"), render: (p) => dataIt(p.created_at) },
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
            <AlertDialogTitle>{t("Eliminare questo POS?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Il POS in bozza di «{commessa}» sarà eliminato definitivamente. È possibile solo se non ha firme, approvazioni, iter registrato o revisioni approvate da conservare.", { commessa: daEliminare?.commessa?.order_code ||
                daEliminare?.commessa?.description ||
                t("commessa") })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare.id)}
            >
              {t("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


    </div>
  );
}
