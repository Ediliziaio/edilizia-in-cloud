import { CatalogoDocumentiDialog } from "./CatalogoDocumentiDialog";
import {
  voceCatalogo,
  erroreAmbitoCatalogo,
  type VoceCatalogo,
} from "@/lib/sicurezza/catalogoDocumenti";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  useEvidenzeFascicolo,
  useImpreseCommessa,
  useIncarichiCantiere,
  useFasiFascicolo,
  useCommesseFascicolo,
  useOperaiEsterni,
  useScriviFascicolo,
  caricaFileFascicolo,
  apriFileFascicolo,
} from "@/hooks/useFascicoloCantiere";
import { usePermissions } from "@/hooks/usePermissions";
import {
  STATO_EVIDENZA,
  RUOLI_INCARICO,
  errorePeriodoApplicabilita,
  nelContestoApplicabilita,
  esitoEvidenza,
  type AmbitoFascicolo,
  type EvidenzaFascicolo,
} from "@/lib/sicurezza/fascicolo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, FileText, ExternalLink, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";

const TIPI = {
  durc: "DURC",
  visura: "Visura camerale",
  pos: "POS del cantiere",
  dvr: "DVR",
  nomina: "Atto di nomina",
  formazione: "Attestato di formazione",
  dpi: "Consegna DPI",
  idoneita_mansione: "Giudizio di idoneità alla mansione",
  pimus: "PiMUS",
  psc: "PSC",
  sds: "Scheda di sicurezza prodotto",
  attrezzatura: "Documento attrezzatura",
  qualificazione: "Qualificazione / certificazione",
  verbale: "Verbale",
  autorizzazione: "Autorizzazione / pratica",
  altro: "Altro documento",
};
type Form = {
  fase_id: string;
  applicabile_dal: string;
  applicabile_al: string;
  catalogo_id: string;
  catalogo_versione: number | null;
  incarico_id: string;
  id?: string;
  tipo: string;
  titolo: string;
  order_id: string;
  operaio_id: string;
  subappaltatore_id: string;
  origine_requisito: EvidenzaFascicolo["origine_requisito"];
  riferimento_requisito: string;
  stato: EvidenzaFascicolo["stato"];
  data_rilascio: string;
  data_scadenza: string;
  competenza: string;
  revisione: string;
  termine: string;
  referente: string;
  note: string;
  file_path?: string;
  file_name?: string;
};
const vuoto = (orderId?: string, subId?: string): Form => ({
  subappaltatore_id: subId ?? "",
  catalogo_id: "",
  catalogo_versione: null,
  incarico_id: "",
  fase_id: "",
  applicabile_dal: "",
  applicabile_al: "",
  tipo: "altro",
  titolo: "",
  order_id: orderId ?? "",
  operaio_id: "",
  origine_requisito: "da_verificare",
  riferimento_requisito: "",
  stato: "da_richiedere",
  data_rilascio: "",
  data_scadenza: "",
  competenza: "",
  revisione: "",
  termine: "",
  referente: "",
  note: "",
});
export function FascicoloDocumenti({
  companyId,
  subId,
  orderId,
  dataRiferimento,
  faseRiferimento,
  soloSdsAziendali = false,
  documentoSelezionato = null,
  onDeseleziona,
}: AmbitoFascicolo & {
  dataRiferimento?: string;
  faseRiferimento?: string;
  soloSdsAziendali?: boolean;
  documentoSelezionato?: string | null;
  onDeseleziona?: () => void;
}) {
  const perms = usePermissions();
  const q = useEvidenzeFascicolo({
    companyId,
    subId,
    orderId,
    ...(soloSdsAziendali ? { sdsAziendali: true } : {}),
  });
  const commesse = useCommesseFascicolo(companyId);
  const impreseCollegate = useImpreseCommessa(
    companyId,
    orderId && !subId && !soloSdsAziendali ? orderId : "",
  );
  const [form, setForm] = useState<Form | null>(null);
  const originaleForm = useRef("");
  const [confermaChiusura, setConfermaChiusura] = useState(false);
  const apriForm = (dati: Form) => {
    originaleForm.current = JSON.stringify(dati);
    setForm(dati);
    setConfermaChiusura(false);
  };
  const titolareSubId = form ? form.subappaltatore_id || undefined : subId;
  const operai = useOperaiEsterni({ companyId, subId: titolareSubId });
  const incarichi = useIncarichiCantiere({ companyId, subId, orderId });
  const salva = useScriviFascicolo("sicurezza_fascicolo", companyId);
  const [catalogoAperto, setCatalogoAperto] = useState(false);
  const [altriPeriodi, setAltriPeriodi] = useState(false);
  const fasi = useFasiFascicolo(companyId, form?.order_id || orderId);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [cerca, setCerca] = useState("");
  const [contesto, setContesto] = useState("tutti");
  const [storico, setStorico] = useState(false);
  const scrive = perms.canViewSicurezzaCantiere && !perms.solaLettura;
  if (!perms.canViewSicurezzaCantiere)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Per leggere i documenti del fascicolo serve il permesso Sicurezza
        cantiere.
      </p>
    );
  const righe = (q.data ?? []).filter((d) =>
    documentoSelezionato
      ? d.id === documentoSelezionato
      : (storico || d.stato !== "superato") &&
        (altriPeriodi ||
          nelContestoApplicabilita(d, {
            data: dataRiferimento,
            faseId: faseRiferimento,
          })) &&
        `${d.titolo} ${d.tipo} ${d.referente ?? ""}`
          .toLowerCase()
          .includes(cerca.toLowerCase()) &&
        (contesto === "tutti" ||
          (contesto === "impresa" ? !d.order_id : d.order_id === contesto)),
  );
  const cambia = (k: keyof Form, v: string) =>
    setForm((f) =>
      f
        ? {
            ...f,
            [k]: v,
            ...(k === "order_id"
              ? { incarico_id: "", fase_id: "" }
              : k === "subappaltatore_id"
                ? { incarico_id: "", operaio_id: "" }
                : {}),
          }
        : f,
    );
  const richiediChiusura = () => {
    if (pending) return;
    if (form && (file || JSON.stringify(form) !== originaleForm.current))
      setConfermaChiusura(true);
    else {
      setForm(null);
      setFile(null);
    }
  };
  const modifica = (d: EvidenzaFascicolo) => {
    setFile(null);
    apriForm({
      id: d.id,
      subappaltatore_id: d.subappaltatore_id ?? "",
      fase_id: d.fase_id ?? "",
      applicabile_dal: d.applicabile_dal ?? "",
      applicabile_al: d.applicabile_al ?? "",
      catalogo_id: d.catalogo_id ?? "",
      catalogo_versione: d.catalogo_versione ?? null,
      incarico_id: d.incarico_id ?? "",
      tipo: d.tipo,
      titolo: d.titolo,
      order_id: d.order_id ?? "",
      operaio_id: d.operaio_id ?? "",
      origine_requisito: d.origine_requisito,
      riferimento_requisito: d.riferimento_requisito ?? "",
      stato: d.stato,
      data_rilascio: d.data_rilascio ?? "",
      data_scadenza: d.data_scadenza ?? "",
      competenza: d.competenza ?? "",
      revisione: d.revisione ?? "",
      termine: d.termine ?? "",
      referente: d.referente ?? "",
      note: d.note ?? "",
      file_path: d.file_path ?? undefined,
      file_name: d.file_name ?? undefined,
    });
  };
  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || pending) return;
    if (
      !form.id &&
      form.subappaltatore_id &&
      !subId &&
      orderId &&
      (impreseCollegate.isError ||
        !impreseCollegate.data?.imprese.some(
          (i) => i.id === form.subappaltatore_id,
        ))
    ) {
      toast.error(
        "Verifica il collegamento dell’impresa alla commessa prima di salvare.",
      );
      return;
    }
    const errorePeriodo = errorePeriodoApplicabilita(
      form.applicabile_dal,
      form.applicabile_al,
    );
    if (errorePeriodo) {
      toast.error(errorePeriodo);
      return;
    }
    const voce = voceCatalogo(form.catalogo_id, form.catalogo_versione);
    const errore = voce ? erroreAmbitoCatalogo(voce, form) : null;
    if (errore) {
      toast.error(errore);
      return;
    }
    if (
      voce &&
      form.origine_requisito !== "da_verificare" &&
      !form.riferimento_requisito.trim()
    ) {
      toast.error("Specifica il riferimento del requisito confermato.");
      return;
    }
    if (form.catalogo_id && !voce) {
      toast.error(
        "Classificazione non disponibile in questa versione dell’app",
      );
      return;
    }
    if (form.tipo === "pos" && !form.order_id) {
      toast.error("Associa il POS alla commessa corretta.");
      return;
    }
    if (
      form.data_rilascio &&
      form.data_scadenza &&
      form.data_scadenza < form.data_rilascio
    ) {
      toast.error("La scadenza non può precedere il rilascio.");
      return;
    }
    if (form.stato === "ricevuto" && !form.file_path && !file) {
      toast.error("Allega il documento prima di registrarlo come ricevuto.");
      return;
    }
    if (form.stato === "verificato" && !form.file_path) {
      toast.error("Carica e salva il documento prima di verificarlo.");
      return;
    }
    if (form.stato === "non_applicabile" && !form.note.trim()) {
      toast.error("Indica perché il requisito non è applicabile.");
      return;
    }
    setPending(true);
    try {
      const { id, file_path, file_name, ...resto } = form;
      const campi = {
        ...resto,
        ...(soloSdsAziendali ? { tipo: "sds" } : {}),
        catalogo_id: soloSdsAziendali ? null : form.catalogo_id || null,
        catalogo_versione: soloSdsAziendali ? null : form.catalogo_versione,
        incarico_id: soloSdsAziendali ? null : form.incarico_id || null,
        fase_id: soloSdsAziendali ? null : form.fase_id || null,
        applicabile_dal: form.applicabile_dal || null,
        applicabile_al: form.applicabile_al || null,
        order_id: soloSdsAziendali ? null : form.order_id || null,
        operaio_id: soloSdsAziendali ? null : form.operaio_id || null,
        subappaltatore_id: soloSdsAziendali
          ? null
          : form.subappaltatore_id || null,
        data_rilascio: form.data_rilascio || null,
        data_scadenza: form.data_scadenza || null,
        termine: form.termine || null,
        competenza: form.competenza || null,
      };
      // Metadata first: uploads are authorized only against an existing owned row.
      const saved = await salva.mutateAsync({
        ...campi,
        id,
        ...(id && file_path
          ? { file_path, file_name: file?.name ?? file_name }
          : {}),
        ...(!id ? { stato: file ? "da_richiedere" : form.stato } : {}),
      });
      setForm((f) => (f ? { ...f, id: saved.id } : f));
      let path = file_path;
      if (file && !path) {
        path = await caricaFileFascicolo(companyId, saved.id, file);
        setForm((f) =>
          f ? { ...f, id: saved.id, file_path: path, file_name: file.name } : f,
        );
      }
      if (file && path)
        await salva.mutateAsync({
          id: saved.id,
          file_path: path,
          file_name: file?.name ?? file_name,
          stato:
            form.stato === "da_richiedere" || form.stato === "richiesto"
              ? "ricevuto"
              : form.stato,
        });
      setForm(null);
      setFile(null);
      toast.success("Evidenza salvata nel fascicolo");
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Documento non salvato. La richiesta resta recuperabile.",
      );
    } finally {
      setPending(false);
    }
  };
  const scegliCatalogo = (v: VoceCatalogo) => {
    if (!form) originaleForm.current = JSON.stringify(vuoto(orderId, subId));
    setForm((f) => ({
      ...(f ?? vuoto(orderId, subId)),
      catalogo_id: v.id,
      catalogo_versione: v.versione,
      tipo: v.tipo_fascicolo,
      titolo:
        !f?.titolo ||
        f.titolo === voceCatalogo(f.catalogo_id, f.catalogo_versione)?.titolo
          ? v.titolo
          : f.titolo,
    }));
    setCatalogoAperto(false);
  };
  const verificatoNelFascicolo =
    !!form?.id &&
    !!q.data?.some((e) => e.id === form.id && e.stato === "verificato");
  const classificazione = form
    ? voceCatalogo(form.catalogo_id, form.catalogo_versione)
    : undefined;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            {soloSdsAziendali
              ? "SDS aziendali condivise"
              : "Fascicolo e richieste documentali"}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {soloSdsAziendali
              ? "Un solo originale per tutte le commesse della propria impresa. Caricamento, verifica e collegamento ai prodotti sono passaggi distinti."
              : "Documenti per impresa, operaio e cantiere. Caricamento, verifica e firma sono passaggi distinti."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!soloSdsAziendali && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCatalogoAperto(true)}
            >
              Catalogo
            </Button>
          )}
          {scrive && (
            <Button
              size="sm"
              onClick={() => {
                apriForm({
                  ...vuoto(orderId, subId),
                  ...(soloSdsAziendali ? { tipo: "sds" } : {}),
                });
                setFile(null);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              {soloSdsAziendali ? "Aggiungi SDS" : "Aggiungi"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentoSelezionato && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p>
              Documento selezionato dal quadro della commessa. I filtri
              sottostanti sono sospesi per questa consultazione.
            </p>
            <Button size="sm" variant="outline" onClick={onDeseleziona}>
              Torna a tutti i documenti
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            aria-label="Cerca nel fascicolo"
            placeholder="Cerca documento o referente…"
            value={cerca}
            disabled={!!documentoSelezionato}
            onChange={(e) => setCerca(e.target.value)}
          />
          {!orderId && !soloSdsAziendali && (
            <select
              aria-label="Ambito dei documenti"
              className="h-10 max-w-xs rounded-md border bg-background px-2 text-sm"
              value={contesto}
              onChange={(e) => setContesto(e.target.value)}
            >
              <option value="tutti">Tutti gli ambiti</option>
              <option value="impresa">Impresa / organico</option>
              {commesse.data
                ?.filter((c) => q.data?.some((d) => d.order_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.order_code}
                  </option>
                ))}
            </select>
          )}
          {(dataRiferimento || faseRiferimento) && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={altriPeriodi}
                onChange={(e) => setAltriPeriodi(e.target.checked)}
              />
              Mostra anche altre fasi e periodi
            </label>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={storico}
              onChange={(e) => setStorico(e.target.checked)}
            />
            Versioni superate
          </label>
        </div>
        {q.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Fascicolo non disponibile.{" "}
            <Button variant="link" onClick={() => q.refetch()}>
              Riprova
            </Button>
          </p>
        ) : q.isLoading ? (
          <p>Caricamento fascicolo…</p>
        ) : !righe.length ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            {documentoSelezionato
              ? "Il documento selezionato non è disponibile nella fonte corrente. Torna all’elenco e aggiorna la fonte."
              : soloSdsAziendali
                ? "Nessuna SDS con questi filtri. Carica il file e indica revisione e data; un archivio vuoto non conferma l’assenza di prodotti pericolosi."
                : "Nessuna evidenza con questi filtri. Aggiungi un documento o prepara una richiesta; non viene inviato alcun messaggio."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-3 text-left">Documento e titolare</th>
                  <th className="p-3 text-left">Ambito</th>
                  <th className="p-3 text-left">Stato e date</th>
                  <th className="p-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((d) => (
                  <tr key={d.id}>
                    <td className="p-3 align-top">
                      <p className="font-medium">{d.titolo}</p>
                      <p className="text-xs text-muted-foreground">
                        {TIPI[d.tipo as keyof typeof TIPI] ?? d.tipo}
                        {d.revisione ? ` · Rev. ${d.revisione}` : ""}
                      </p>
                      {(d.fase_id || d.applicabile_dal || d.applicabile_al) && (
                        <p className="text-xs text-muted-foreground">
                          {d.fase_id
                            ? `Fase: ${fasi.data?.find((f) => f.id === d.fase_id)?.name ?? "fase collegata alla commessa"} · `
                            : ""}
                          Applicabilità:{" "}
                          {d.applicabile_dal ?? "inizio non delimitato"} —{" "}
                          {d.applicabile_al ?? "fine non delimitata"}
                        </p>
                      )}
                      {d.catalogo_id && (
                        <p className="text-xs text-muted-foreground">
                          Catalogo:{" "}
                          {voceCatalogo(d.catalogo_id, d.catalogo_versione)
                            ?.titolo ?? d.catalogo_id}{" "}
                          · v{d.catalogo_versione}
                        </p>
                      )}
                      {d.incarico_id && (
                        <p className="text-xs">
                          Incarico:{" "}
                          {incarichi.data?.find((i) => i.id === d.incarico_id)
                            ?.nominativo ?? "Da consultare negli incarichi"}
                        </p>
                      )}
                      {d.operaio_id && (
                        <p className="mt-1 text-xs">
                          {(() => {
                            const o = operai.data?.find(
                              (o) => o.id === d.operaio_id,
                            );
                            return o
                              ? `${o.nome} ${o.cognome}`
                              : "Addetto esterno";
                          })()}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Requisito:{" "}
                        {d.origine_requisito === "da_verificare"
                          ? "origine da verificare"
                          : d.origine_requisito}
                      </p>
                    </td>
                    <td className="p-3 align-top text-xs">
                      {d.order_id ? (
                        <a
                          href={`/azienda/ordini/${d.order_id}`}
                          className="text-primary"
                        >
                          {commesse.data?.find((c) => c.id === d.order_id)
                            ?.order_code ?? "Commessa"}
                        </a>
                      ) : soloSdsAziendali ? (
                        "Tutte le commesse proprie"
                      ) : (
                        "Impresa / organico"
                      )}
                      {d.competenza && <p>Mese {d.competenza}</p>}
                    </td>
                    <td className="p-3 align-top">
                      <Badge variant="outline">{esitoEvidenza(d)}</Badge>
                      {soloSdsAziendali && (
                        <p className="mt-1 text-xs">
                          Revisione {d.revisione || "da indicare"} · rilascio{" "}
                          {d.data_rilascio || "da indicare"}
                        </p>
                      )}
                      {d.data_scadenza && (
                        <p className="mt-1 text-xs">
                          Scadenza {d.data_scadenza}
                        </p>
                      )}
                      {d.termine && (
                        <p className="mt-1 text-xs">
                          Da ricevere entro {d.termine}
                        </p>
                      )}
                      {d.referente && (
                        <p className="mt-1 text-xs">Referente: {d.referente}</p>
                      )}
                      {d.verificato_il && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Verifica registrata {d.verificato_il.slice(0, 10)}
                        </p>
                      )}
                    </td>
                    <td className="p-3 align-top">
                      <div className="flex justify-end gap-1">
                        {d.file_path && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Apri ${d.titolo}`}
                            onClick={() =>
                              apriFileFascicolo(d.file_path!).catch((e) =>
                                toast.error(e.message),
                              )
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        {scrive && (
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Modifica ${d.titolo}`}
                            onClick={() => modifica(d)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {catalogoAperto && (
        <CatalogoDocumentiDialog
          evidenze={q.data ?? []}
          onClose={() => setCatalogoAperto(false)}
          onScegli={scrive ? scegliCatalogo : undefined}
        />
      )}
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v) richiediChiusura();
        }}
      >
        <DialogContent
          className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-12">
            <DialogTitle>
              {soloSdsAziendali
                ? form?.id
                  ? "Gestisci SDS aziendale"
                  : "Carica SDS aziendale"
                : form?.id
                  ? "Gestisci evidenza"
                  : "Documento o richiesta"}
            </DialogTitle>
            <DialogDescription>
              {soloSdsAziendali
                ? "Documento della propria impresa, riutilizzabile nelle commesse. Indica prodotto, revisione e data del documento. Per una nuova versione carica un’altra SDS: il file precedente rimane conservato."
                : "Indica soggetto e cantiere corretti. Per una versione successiva crea una nuova evidenza; i file salvati non vengono sostituiti."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form
              onSubmit={invia}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <fieldset
                disabled={pending}
                className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-5"
              >
                {!soloSdsAziendali && (
                  <div className="rounded-md border p-3 text-sm">
                    <p>
                      {classificazione
                        ? `Catalogo v${classificazione.versione}: ${classificazione.titolo}`
                        : form.catalogo_id
                          ? "Classificazione di un’altra versione dell’app: ricarica prima di modificare"
                          : "Voce non classificata nel catalogo"}
                    </p>
                    {classificazione?.nota && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {classificazione.nota}
                      </p>
                    )}
                    {verificatoNelFascicolo && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Per cambiare classificazione o incarico, salva prima lo
                        stato Integrazione e riapri l’evidenza.
                      </p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="link"
                      disabled={pending || verificatoNelFascicolo}
                      onClick={() => setCatalogoAperto(true)}
                    >
                      Classifica dal catalogo
                    </Button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="evi-tipo">Tipo</Label>
                    <select
                      id="evi-tipo"
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={form.tipo}
                      disabled={soloSdsAziendali || !!form.catalogo_id}
                      onChange={(e) => cambia("tipo", e.target.value)}
                    >
                      {Object.entries(TIPI).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="evi-titolo">Titolo</Label>
                    <Input
                      id="evi-titolo"
                      required
                      value={form.titolo}
                      onChange={(e) => cambia("titolo", e.target.value)}
                    />
                  </div>
                </div>
                {!form.id && !!orderId && !subId && !soloSdsAziendali && (
                  <div>
                    <Label htmlFor="evi-impresa">Titolare del documento</Label>
                    <select
                      id="evi-impresa"
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={form.subappaltatore_id}
                      disabled={
                        impreseCollegate.isLoading || impreseCollegate.isError
                      }
                      onChange={(e) =>
                        cambia("subappaltatore_id", e.target.value)
                      }
                    >
                      <option value="">Cantiere / propria impresa</option>
                      {impreseCollegate.data?.imprese.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.ragione_sociale || "Impresa collegata"}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Solo imprese già collegate alla commessa. Seleziona poi
                      l’eventuale operaio o incarico; il caricamento non
                      registra una verifica ITP.
                    </p>
                    {impreseCollegate.isError && (
                      <p role="alert" className="text-xs text-destructive">
                        Imprese collegate non disponibili: riprova dalla scheda
                        impresa.
                      </p>
                    )}
                  </div>
                )}
                {form.id && form.subappaltatore_id && (
                  <p className="rounded-md bg-muted p-3 text-sm">
                    Documento di un’impresa esterna: il titolare originale viene
                    mantenuto. Per cambiare impresa occorre un nuovo record nel
                    fascicolo corretto.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="evi-commessa">
                      Commessa
                      {form.tipo === "pos" ? " (necessaria per il POS)" : ""}
                    </Label>
                    <select
                      id="evi-commessa"
                      disabled={soloSdsAziendali || !!orderId}
                      required={form.tipo === "pos"}
                      className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={form.order_id}
                      onChange={(e) => cambia("order_id", e.target.value)}
                    >
                      <option value="">Documento aziendale / organico</option>
                      {commesse.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.order_code} · {c.description?.slice(0, 50)}
                        </option>
                      ))}
                    </select>
                    {commesse.isError && (
                      <p role="alert" className="text-xs text-destructive">
                        Elenco commesse non disponibile.
                      </p>
                    )}
                  </div>
                  {titolareSubId && (
                    <div>
                      <Label htmlFor="evi-operaio">
                        Operaio (se personale)
                      </Label>
                      <select
                        id="evi-operaio"
                        disabled={!!form.id || !!form.incarico_id}
                        className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.operaio_id}
                        onChange={(e) => cambia("operaio_id", e.target.value)}
                      >
                        <option value="">Documento dell’impresa</option>
                        {form.operaio_id &&
                          !operai.data?.some(
                            (o) => o.id === form.operaio_id,
                          ) && (
                            <option value={form.operaio_id}>
                              Addetto esterno già collegato
                            </option>
                          )}
                        {operai.data?.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.nome} {o.cognome}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <fieldset
                  className="min-w-0 rounded-md border p-3"
                  disabled={verificatoNelFascicolo}
                >
                  <legend className="px-1 text-sm font-medium">
                    {soloSdsAziendali
                      ? "Periodo di applicabilità"
                      : "Applicabilità per fase e periodo"}
                  </legend>
                  {!soloSdsAziendali && (
                    <>
                      <Label htmlFor="evi-fase">Fase della commessa</Label>
                      <select
                        id="evi-fase"
                        disabled={!form.order_id || verificatoNelFascicolo}
                        className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.fase_id}
                        onChange={(e) => cambia("fase_id", e.target.value)}
                      >
                        <option value="">
                          Requisito non limitato a una fase
                        </option>
                        {fasi.data?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                            {f.start_date ? ` · dal ${f.start_date}` : ""}
                            {f.end_date ? ` al ${f.end_date}` : ""}
                          </option>
                        ))}
                      </select>
                      {fasi.isError && (
                        <p role="alert" className="text-xs text-destructive">
                          Fasi non disponibili: riprova prima di collegare una
                          fase.
                        </p>
                      )}
                    </>
                  )}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="evi-app-dal">Applicabile dal</Label>
                      <Input
                        id="evi-app-dal"
                        type="date"
                        value={form.applicabile_dal}
                        onChange={(e) =>
                          cambia("applicabile_dal", e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="evi-app-al">Applicabile fino al</Label>
                      <Input
                        id="evi-app-al"
                        type="date"
                        value={form.applicabile_al}
                        onChange={(e) =>
                          cambia("applicabile_al", e.target.value)
                        }
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Periodo del requisito, distinto dalla scadenza del
                    documento. Nessuna data viene copiata dal calendario:
                    eventuali ripianificazioni vanno riesaminate. Per modificare
                    l’ambito di un’evidenza verificata salva prima Integrazione.
                  </p>
                </fieldset>
                {!soloSdsAziendali && (
                  <>
                    <div>
                      <Label htmlFor="evi-incarico">
                        Incarico titolare del documento
                      </Label>
                      <select
                        id="evi-incarico"
                        className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.incarico_id}
                        disabled={!!form.operaio_id || verificatoNelFascicolo}
                        onChange={(e) => cambia("incarico_id", e.target.value)}
                      >
                        <option value="">Nessun incarico collegato</option>
                        {form.incarico_id &&
                          !incarichi.data?.some(
                            (i) =>
                              i.id === form.incarico_id &&
                              i.subappaltatore_id === (titolareSubId ?? null),
                          ) && (
                            <option value={form.incarico_id}>
                              Incarico già collegato · non disponibile in questo
                              elenco
                            </option>
                          )}
                        {incarichi.data
                          ?.filter(
                            (i) =>
                              i.subappaltatore_id === (titolareSubId ?? null) &&
                              (!i.order_id || i.order_id === form.order_id),
                          )
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nominativo} · {RUOLI_INCARICO[i.ruolo]}
                            </option>
                          ))}
                      </select>
                      {incarichi.isError && (
                        <p role="alert" className="text-xs text-destructive">
                          Incarichi non disponibili.
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Per nomine e attestati delle figure scegli l’incarico
                        esistente. Per un operaio esterno scegli l’operaio; i
                        dipendenti interni restano nel modulo Personale. Il
                        collegamento non verifica né documenta automaticamente
                        la nomina.
                      </p>
                    </div>
                  </>
                )}
                {!soloSdsAziendali && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="evi-origine">
                          Origine del requisito
                        </Label>
                        <select
                          id="evi-origine"
                          className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                          value={form.origine_requisito}
                          onChange={(e) =>
                            cambia("origine_requisito", e.target.value)
                          }
                        >
                          <option value="da_verificare">Da verificare</option>
                          <option value="normativa">Normativa</option>
                          <option value="contratto">
                            Contratto / committente
                          </option>
                          <option value="interna">Procedura interna</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="evi-riferimento">
                          Riferimento del requisito
                        </Label>
                        <Input
                          id="evi-riferimento"
                          value={form.riferimento_requisito}
                          onChange={(e) =>
                            cambia("riferimento_requisito", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <Label htmlFor="evi-stato">Stato</Label>
                  <select
                    id="evi-stato"
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                    value={form.stato}
                    onChange={(e) => cambia("stato", e.target.value)}
                  >
                    {Object.entries(STATO_EVIDENZA).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["data_rilascio", "Data rilascio", "date"],
                      ["data_scadenza", "Scadenza effettiva", "date"],
                      ["competenza", "Mese di competenza", "month"],
                      ["revisione", "Revisione", "text"],
                      ["termine", "Termine della richiesta", "date"],
                      ["referente", "Referente della richiesta", "text"],
                    ] as const
                  )
                    .filter(
                      ([k]) =>
                        !soloSdsAziendali ||
                        !["competenza", "termine", "referente"].includes(k),
                    )
                    .map(([k, l, t]) => (
                      <div key={k}>
                        <Label htmlFor={`evi-${k}`}>{l}</Label>
                        <Input
                          id={`evi-${k}`}
                          type={t}
                          value={form[k]}
                          onChange={(e) => cambia(k, e.target.value)}
                        />
                      </div>
                    ))}
                </div>
                {form.file_path ? (
                  <p className="rounded-md bg-slate-50 p-3 text-xs">
                    File conservato: {form.file_name}. Per sostituirlo aggiungi
                    una nuova evidenza.
                  </p>
                ) : (
                  <div>
                    <Label htmlFor="evi-file">
                      File PDF o immagine (fino a 15 MB)
                    </Label>
                    <Input
                      id="evi-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                )}
                <div>
                  <Label htmlFor="evi-note">
                    Note / motivazione della non applicabilità
                  </Label>
                  <Textarea
                    id="evi-note"
                    required={form.stato === "non_applicabile"}
                    value={form.note}
                    onChange={(e) => cambia("note", e.target.value)}
                  />
                </div>
              </fieldset>
              <DialogFooter className="shrink-0 border-t bg-background p-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={richiediChiusura}
                >
                  Annulla
                </Button>
                <Button disabled={pending}>
                  {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Salva nel fascicolo
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confermaChiusura} onOpenChange={setConfermaChiusura}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chiudere senza salvare?</AlertDialogTitle>
            <AlertDialogDescription>
              Le modifiche non ancora salvate andranno perse. Puoi tornare al
              modulo per completarle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua modifica</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setForm(null);
                setFile(null);
                setConfermaChiusura(false);
              }}
            >
              Chiudi senza salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
