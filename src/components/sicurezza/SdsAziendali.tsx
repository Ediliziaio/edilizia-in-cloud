import { useState } from "react";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  leggiSdsAziendali,
  useCollegaRevisioneSds,
  useSdsAziendali,
  type SdsAziendale,
} from "@/hooks/useSdsAziendali";
import { STATO_EVIDENZA } from "@/lib/sicurezza/fascicolo";
import { FascicoloDocumenti } from "./FascicoloDocumenti";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
const etichetta = (d: SdsAziendale) =>
  `${d.titolo} · rev. ${d.revisione || "non indicata"} · ${d.data_rilascio || "data non indicata"}`;
const candidabile = (d: SdsAziendale) =>
  !!d.file_path &&
  !!d.file_name &&
  !!d.revisione?.trim() &&
  !!d.data_rilascio &&
  !["superato", "non_applicabile"].includes(d.stato) &&
  !d.precedente_id;
export function SdsAziendali({ companyId }: { companyId: string }) {
  return <LibreriaSds key={companyId} companyId={companyId} />;
}
function LibreriaSds({ companyId }: { companyId: string }) {
  const p = usePermissions();
  const q = useSdsAziendali(companyId);
  const [fonti, setFonti] = useState<SdsAziendale[] | null>(null);
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="max-w-3xl text-sm">
          <p className="font-medium">
            Una libreria per i prodotti della tua impresa
          </p>
          <p className="mt-1 text-muted-foreground">
            Carica ogni nuova SDS come documento distinto. Collega poi le
            revisioni e consulta le commesse che usano ancora la versione
            precedente. Il collegamento non verifica il documento e non
            sostituisce le SDS nei prodotti o nei POS già emessi.
          </p>
        </div>
        {!p.solaLettura && (
          <Button
            variant="outline"
            disabled={
              q.isPending ||
              q.isError ||
              !(q.data || []).some(candidabile) ||
              (q.data || []).length < 2
            }
            onClick={() => setFonti(structuredClone(q.data || []))}
          >
            Collega revisioni
          </Button>
        )}
      </div>
      <FascicoloDocumenti companyId={companyId} soloSdsAziendali />
      {q.isError && (
        <p role="alert" className="text-sm text-destructive">
          Revisioni e impieghi non disponibili. Riprova prima di effettuare un
          collegamento.
        </p>
      )}
      {!q.isError && !!q.data?.length && (
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer font-medium">
            Revisioni e commesse collegate
          </summary>
          <div className="mt-3 space-y-3">
            {q.data.map((d) => (
              <article key={d.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{etichetta(d)}</p>
                <p className="text-muted-foreground">
                  {STATO_EVIDENZA[d.stato] || d.stato}
                </p>
                {d.precedente_id && (
                  <p>
                    Revisione precedente:{" "}
                    {q.data.find((x) => x.id === d.precedente_id)?.titolo ||
                      "Documento non disponibile"}{" "}
                    ·{" "}
                    {q.data.find((x) => x.id === d.precedente_id)?.revisione ||
                      "revisione non indicata"}
                  </p>
                )}
                {!!d.successive.length && (
                  <p className="mt-1 text-amber-800">
                    Revisioni successive:{" "}
                    {d.successive
                      .map(
                        (x) =>
                          `${x.titolo} · ${x.revisione || "revisione non indicata"} (${STATO_EVIDENZA[x.stato as keyof typeof STATO_EVIDENZA] || x.stato})`,
                      )
                      .join("; ")}
                    . Riesamina gli impieghi prima di aggiornare i prodotti.
                  </p>
                )}
                {d.impieghi.length ? (
                  <ul className="mt-2 space-y-2">
                    {d.impieghi.map((i) => (
                      <li key={i.id}>
                        <Link
                          className="text-primary underline"
                          to={`/azienda/ordini/${i.order_id}?tab=cantiere&vista_cantiere=sicurezza`}
                        >
                          {i.order_code || "Apri commessa"}
                        </Link>{" "}
                        · {i.nome} · {i.dal} — {i.al || "senza fine indicata"}
                        {i.annullato ? " · impiego annullato" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Nessun impiego collegato nell’inventario prodotti. Questo
                    elenco non include i riferimenti congelati nei POS storici.
                  </p>
                )}
              </article>
            ))}
          </div>
        </details>
      )}
      {fonti && (
        <CollegaRevisioni
          key={companyId}
          companyId={companyId}
          iniziali={fonti}
          onClose={() => setFonti(null)}
        />
      )}
    </section>
  );
}
export function CollegaRevisioni({
  companyId,
  iniziali,
  onClose,
}: {
  companyId: string;
  iniziali: SdsAziendale[];
  onClose: () => void;
}) {
  const p = usePermissions();
  const salva = useCollegaRevisioneSds(companyId);
  const [fonti, setFonti] = useState(iniziali);
  const [rilette, setRilette] = useState<SdsAziendale[] | null>(null);
  const [nuova, setNuova] = useState("");
  const [precedente, setPrecedente] = useState("");
  const [errore, setErrore] = useState("");
  const [lettura, setLettura] = useState(false);
  const [letturaFallita, setLetturaFallita] = useState(false);
  const n = fonti.find((d) => d.id === nuova);
  const a = fonti.find((d) => d.id === precedente);
  const confronto = rilette || fonti;
  const cambiata =
    !!(n && confronto.find((d) => d.id === n.id)?.impronta !== n.impronta) ||
    !!(a && confronto.find((d) => d.id === a.id)?.impronta !== a.impronta);
  const scrive = p.canViewSicurezzaCantiere && !p.solaLettura;
  const occupato = lettura || salva.isPending;
  const ammissibile =
    scrive &&
    !occupato &&
    !letturaFallita &&
    !cambiata &&
    n &&
    a &&
    n.id !== a.id &&
    candidabile(n) &&
    n.company_id === companyId &&
    a.company_id === companyId;
  async function rileggi() {
    if (occupato) return;
    setLettura(true);
    setErrore("");
    try {
      setRilette(await leggiSdsAziendali(companyId));
      setLetturaFallita(false);
    } catch (e) {
      setLetturaFallita(true);
      setErrore(e instanceof Error ? e.message : "Lettura non disponibile.");
    } finally {
      setLettura(false);
    }
  }
  async function invia() {
    if (!ammissibile || !n || !a) return;
    setErrore("");
    try {
      await salva.mutateAsync({
        documentoId: n.id,
        precedenteId: a.id,
        improntaDocumento: n.impronta,
        improntaPrecedente: a.impronta,
      });
      onClose();
    } catch (e) {
      setErrore(
        e instanceof Error
          ? e.message
          : "Collegamento non confermato. Rileggi le SDS prima di riprovare.",
      );
    }
  }
  if (!p.canViewSicurezzaCantiere) return null;
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !occupato) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Collega revisioni SDS</DialogTitle>
          <DialogDescription>
            Seleziona due documenti già caricati della stessa sostanza o
            prodotto. Il collegamento rimane nello storico e non può essere
            riassegnato. Verifica prodotto, produttore e date prima di
            confermare.
          </DialogDescription>
        </DialogHeader>
        <fieldset disabled={occupato || !scrive} className="space-y-4">
          <div>
            <Label htmlFor="sds-nuova">Nuova revisione caricata</Label>
            <select
              id="sds-nuova"
              className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={nuova}
              onChange={(e) => {
                setNuova(e.target.value);
                setErrore("");
              }}
            >
              <option value="">Scegli documento</option>
              {fonti
                .filter((d) => candidabile(d))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {etichetta(d)}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <Label htmlFor="sds-precedente">Documento precedente</Label>
            <select
              id="sds-precedente"
              className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={precedente}
              onChange={(e) => {
                setPrecedente(e.target.value);
                setErrore("");
              }}
            >
              <option value="">Scegli documento</option>
              {fonti
                .filter((d) => d.id !== nuova)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {etichetta(d)}
                  </option>
                ))}
            </select>
          </div>
        </fieldset>
        {a && (
          <div className="rounded-md border p-3 text-sm">
            <p>
              {a.impieghi.filter((i) => !i.annullato).length} impieghi non
              annullati usano il documento precedente.
            </p>
            <p className="mt-1 text-muted-foreground">
              Rimarranno collegati a questa versione fino al riesame nella
              rispettiva commessa. Anche lo stato del vecchio documento rimane
              invariato.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={occupato} onClick={rileggi}>
            Rileggi SDS
          </Button>
          {rilette && !cambiata && (
            <span className="text-xs text-muted-foreground">
              Le versioni selezionate coincidono con la rilettura.
            </span>
          )}
        </div>
        {cambiata && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 p-3 text-sm"
          >
            <p>
              Uno dei documenti è cambiato o non è più disponibile. Rileggi i
              dati aggiornati prima di confermare.
            </p>
            <Button
              variant="outline"
              className="mt-2"
              disabled={occupato || !rilette || !scrive}
              onClick={() => {
                if (rilette) {
                  setFonti(rilette);
                  setRilette(null);
                  setErrore("");
                }
              }}
            >
              Usa versioni rilette
            </Button>
          </div>
        )}
        {errore && (
          <p role="alert" className="text-sm text-destructive">
            {errore}
          </p>
        )}
        {!scrive && (
          <p role="alert" className="text-sm text-destructive">
            Non puoi modificare i collegamenti SDS.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={occupato} onClick={onClose}>
            Annulla
          </Button>
          <Button disabled={!ammissibile} onClick={invia}>
            Conferma collegamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
