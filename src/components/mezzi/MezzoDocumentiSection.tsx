/**
 * Documenti e scadenze di un mezzo: assicurazione, bollo, revisione, contratto
 * di leasing o noleggio, verifiche periodiche. Ogni scadenza fa partire
 * l'avviso giornaliero (hr-check-scadenze → vista mezzi_scadenze).
 * «Rinnova» crea il documento dell'anno dopo: il vecchio resta nello storico
 * come «Rinnovato» e non conta più come scaduto.
 */
import { useMemo, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  caricaFileMezzo, leggiDocumentoConAI, linkFileMezzo, rimuoviFileMezzo, useEliminaDocumentoMezzo, useMezzoDocumenti,
  useSalvaDocumentoMezzo,
  type DocumentoInput,
} from "@/hooks/useMezzi";
import {
  CATEGORIE_DOCUMENTO, STATO_SCADENZA_BADGE, aggiungiAnni, categoriaDocumentoLabel, documentiConStato,
  dataLetta, formatData, giorniTra, numeroLetto, oggiIso, testoLetto,
  vociPerClasse,
  type MezzoClasse, type MezzoDocumento, type MezzoDocumentoCategoria, type StatoScadenza,
} from "@/types/mezzi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const ORDINE: Record<StatoScadenza, number> = { scaduto: 0, in_scadenza: 1, valido: 2, senza_scadenza: 3, sostituito: 4 };

const euro = (n: number) => formatCurrency(n);

function quando(stato: StatoScadenza, scadenza: string | null, oggi: string): string {
  if (!scadenza) return "Senza scadenza";
  if (stato === "sostituito") return `Fino al ${formatData(scadenza)}`;
  const giorni = giorniTra(oggi, scadenza);
  if (stato === "scaduto") return `Scaduto il ${formatData(scadenza)} (${-giorni} ${-giorni === 1 ? "giorno" : "giorni"} fa)`;
  if (giorni === 0) return "Scade oggi";
  if (stato === "in_scadenza") return `Scade il ${formatData(scadenza)} (tra ${giorni} ${giorni === 1 ? "giorno" : "giorni"})`;
  return `Scade il ${formatData(scadenza)}`;
}

interface Props {
  mezzoId: string;
  companyId: string;
  puoModificare: boolean;
  /** Targa del mezzo: se la polizza letta ne porta un'altra, lo si dice. */
  targa?: string | null;
  /** Per un attrezzo niente bollo e revisione: garanzia, taratura, PiMUS. */
  classe?: MezzoClasse;
}

const MIME_DA_ESTENSIONE: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", webp: "image/webp",
};

export function MezzoDocumentiSection({ mezzoId, companyId, puoModificare, targa, classe = "mezzo" }: Props) {
  const t = useT();
  const { data: docs = [], isLoading, error, refetch } = useMezzoDocumenti(mezzoId);
  const salva = useSalvaDocumentoMezzo(mezzoId);
  const elimina = useEliminaDocumentoMezzo();
  const oggi = oggiIso();

  const [aperto, setAperto] = useState(false);
  const [form, setForm] = useState<DocumentoInput>({});
  const [file, setFile] = useState<File | null>(null);
  const [rinnovo, setRinnovo] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const [daEliminare, setDaEliminare] = useState<MezzoDocumento | null>(null);
  const [leggendo, setLeggendo] = useState(false);
  // File caricato per la lettura automatica e non ancora salvato: se si chiude
  // senza salvare, si toglie.
  const [caricatoNonSalvato, setCaricatoNonSalvato] = useState<string | null>(null);

  const conStato = useMemo(
    () =>
      documentiConStato(docs, oggi).sort(
        (a, b) => ORDINE[a.stato] - ORDINE[b.stato] || (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999"),
      ),
    [docs, oggi],
  );

  const set = <K extends keyof DocumentoInput>(k: K, v: DocumentoInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const nuovo = () => {
    setForm(classe === "attrezzatura" ? { categoria: "garanzia", alert_giorni_prima: 30 } : { categoria: "assicurazione", alert_giorni_prima: 30 });
    setFile(null);
    setRinnovo(false);
    setAperto(true);
  };
  const modifica = (d: MezzoDocumento) => {
    setForm({ ...d });
    setFile(null);
    setRinnovo(false);
    setAperto(true);
  };
  const rinnova = (d: MezzoDocumento) => {
    setForm({
      categoria: d.categoria,
      titolo: d.titolo,
      ente: d.ente,
      importo: d.importo,
      alert_giorni_prima: d.alert_giorni_prima,
      data_inizio: d.data_scadenza,
      data_scadenza: d.data_scadenza ? aggiungiAnni(d.data_scadenza, 1) : null,
    });
    setFile(null);
    setRinnovo(true);
    setAperto(true);
  };

  const cambiaCategoria = (categoria: MezzoDocumentoCategoria) => {
    const cat = CATEGORIE_DOCUMENTO.find((c) => c.value === categoria);
    setForm((f) => ({ ...f, categoria, alert_giorni_prima: f.id ? f.alert_giorni_prima : cat?.alert ?? 30 }));
  };

  const salvaDocumento = async () => {
    setCaricamento(true);
    let caricato: string | null = null;
    try {
      const patch: DocumentoInput = { ...form };
      if (file) {
        try {
          const up = await caricaFileMezzo(companyId, mezzoId, file);
          caricato = up.path;
          patch.file_path = up.path;
          patch.file_name = up.name;
        } catch (e) {
          toast.error(e instanceof Error ? t("Non ho caricato il file: {message}", { message: String(e.message ?? "") }) : t("Non ho caricato il file"));
          return;
        }
      }
      await salva.mutateAsync(patch);
      setCaricatoNonSalvato(null);
      setAperto(false);
    } catch {
      // L'errore del salvataggio lo mostra già la mutation. Il file appena
      // caricato non lo usa nessuno: si toglie invece di lasciarlo orfano.
      if (caricato) await rimuoviFileMezzo(caricato);
    } finally {
      setCaricamento(false);
    }
  };

  const chiudiFinestra = (aperta: boolean) => {
    if (!aperta && caricatoNonSalvato) {
      void rimuoviFileMezzo(caricatoNonSalvato);
      setCaricatoNonSalvato(null);
    }
    setAperto(aperta);
  };

  /** Carica la polizza (se non lo è già) e la fa leggere all'AI per compilare i campi. */
  const compilaDallaPolizza = async () => {
    setLeggendo(true);
    try {
      let path = form.file_path ?? null;
      let nome = form.file_name ?? "polizza";
      if (file) {
        const up = await caricaFileMezzo(companyId, mezzoId, file);
        path = up.path;
        nome = up.name;
        setForm((f) => ({ ...f, file_path: up.path, file_name: up.name }));
        setCaricatoNonSalvato(up.path);
        setFile(null);
      }
      if (!path) return;
      const estensione = nome.split(".").pop()?.toLowerCase() ?? "pdf";
      const letto = await leggiDocumentoConAI({
        companyId, path, fileName: nome, mime: MIME_DA_ESTENSIONE[estensione] ?? "application/pdf", tipo: "polizza_veicolo",
      });
      const compagnia = testoLetto(letto.compagnia);
      const numero = testoLetto(letto.numero_polizza);
      const decorrenza = dataLetta(letto.decorrenza);
      const scadenza = dataLetta(letto.scadenza);
      const premio = numeroLetto(letto.premio_annuo_eur);
      setForm((f) => ({
        ...f,
        ente: compagnia ?? f.ente,
        titolo: numero ? `polizza n. ${numero}` : f.titolo,
        data_inizio: decorrenza ?? f.data_inizio,
        data_scadenza: scadenza ?? f.data_scadenza,
        importo: premio ?? f.importo,
      }));
      const targaLetta = testoLetto(letto.targa)?.replace(/\s+/g, "").toUpperCase();
      if (targaLetta && targa && targaLetta !== targa.replace(/\s+/g, "").toUpperCase()) {
        toast.warning(t("La polizza è per la targa {targaLetta}, il mezzo ha {targa}: controlla di aver preso quella giusta.", { targaLetta: String(targaLetta ?? ""), targa: String(targa ?? "") }));
      } else if (!scadenza) {
        toast.warning(t("Non ho trovato la scadenza nella polizza: scrivila a mano."));
      } else {
        toast.success(t("Ho compilato i campi dalla polizza: controllali prima di salvare."));
      }
    } catch (e) {
      toast.error(e instanceof Error ? t("Lettura automatica non riuscita: {message}. Compila a mano.", { message: String(e.message ?? "") }) : t("Lettura automatica non riuscita. Compila a mano."));
    } finally {
      setLeggendo(false);
    }
  };

  const apriFile = async (d: MezzoDocumento) => {
    if (!d.file_path) return;
    const url = await linkFileMezzo(d.file_path);
    if (url) window.open(url, "_blank", "noopener");
    else toast.error(t("Il file non è disponibile. Riprova tra qualche secondo."));
  };

  const dataValida = !form.data_scadenza || !form.data_inizio || form.data_scadenza >= form.data_inizio;

  return (
    <div className="space-y-3 max-sm:space-y-2">
      {/* Mobile: niente spiegazione; senza documenti il bottone sta nella riga vuota. */}
      <div className={`flex items-center justify-between gap-2 max-sm:justify-end ${conStato.length === 0 ? "max-sm:hidden" : ""}`}>
        <p className="text-sm text-muted-foreground max-sm:hidden">
          {t("Assicurazione, bollo, revisione, contratti: ti avvisiamo prima che scadano.")}
        </p>
        {puoModificare && (
          <Button size="sm" onClick={nuovo} aria-label={t("Aggiungi documento")} className="shrink-0 max-sm:h-9 max-sm:w-9 max-sm:rounded-full max-sm:p-0">
            {/* Telefono: «+» tondo, come in tutte le pagine (decisione del founder, 23/11/2026). */}
            <Plus className="mr-1 h-4 w-4 max-sm:mr-0" /><span className="max-sm:hidden">{t("Aggiungi")}</span>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {t("Non riesco a caricare i documenti.")}{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>{t("Riprova")}</button>
        </div>
      ) : conStato.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground max-sm:py-4">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-40 max-sm:hidden" />
          {t("Nessun documento")}<span className="max-sm:hidden">. {classe === "attrezzatura" ? t("Garanzia, manuale, verifiche e tarature: con la scadenza arriva l'avviso") : t("Inizia da assicurazione e revisione")}</span>.
          {puoModificare && (
            <div className="mt-3 max-sm:mt-2">
              <Button size="sm" variant="outline" className="max-sm:h-8 max-sm:text-xs" onClick={nuovo}><Plus className="mr-1 h-4 w-4" />{t("Aggiungi documento")}</Button>
            </div>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {conStato.map((d) => {
            const badge = STATO_SCADENZA_BADGE[d.stato];
            const vecchio = d.stato === "sostituito";
            return (
              <li key={d.id} className={`flex items-start gap-3 rounded-xl border bg-card p-3 ${vecchio ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{t(categoriaDocumentoLabel(d.categoria))}</span>
                    <Badge variant="outline" className={`px-1.5 py-0 text-[11px] ${badge.cls}`}>{t(badge.label)}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-foreground/80">{quando(d.stato, d.data_scadenza, oggi)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[d.titolo, d.ente, d.importo != null ? euro(d.importo) : null].filter(Boolean).join(" · ") || " "}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {d.file_path && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => apriFile(d)} aria-label={t("Apri il file")} title={t("Apri il file")}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  {puoModificare && !vecchio && d.data_scadenza && (
                    <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => rinnova(d)} aria-label={t("Rinnova")} title={t("Rinnova")}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  {puoModificare && (
                    <>
                      <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => modifica(d)} aria-label={t("Modifica")} title={t("Modifica")}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setDaEliminare(d)} aria-label={t("Elimina")} title={t("Elimina")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={aperto} onOpenChange={chiudiFinestra}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{rinnovo ? t("Rinnova documento") : form.id ? t("Modifica documento") : t("Nuovo documento")}</DialogTitle>
            {rinnovo && (
              <DialogDescription>
                {t("Ho proposto la scadenza a un anno dalla precedente: correggila se serve. Il documento vecchio resta nello storico.")}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-categoria">{t("Tipo di documento")}</Label>
              <Select value={form.categoria ?? "assicurazione"} onValueChange={(v) => cambiaCategoria(v as MezzoDocumentoCategoria)}>
                <SelectTrigger id="doc-categoria"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {vociPerClasse(CATEGORIE_DOCUMENTO, classe, form.categoria).map((c) => <SelectItem key={c.value} value={c.value}>{t(c.label)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-ente">{t("Compagnia / ente")}</Label>
                <Input id="doc-ente" value={form.ente ?? ""} onChange={(e) => set("ente", e.target.value)} placeholder={t("es. Allianz")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-titolo">{t("Numero / descrizione")}</Label>
                <Input id="doc-titolo" value={form.titolo ?? ""} onChange={(e) => set("titolo", e.target.value)} placeholder={t("es. polizza n. 12345")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-inizio">{t("Valido dal")}</Label>
                <Input id="doc-inizio" type="date" value={form.data_inizio ?? ""} onChange={(e) => set("data_inizio", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-scadenza">{t("Scadenza")}</Label>
                <Input id="doc-scadenza" type="date" value={form.data_scadenza ?? ""} onChange={(e) => set("data_scadenza", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-importo">{t("Importo (€)")}</Label>
                <Input
                  id="doc-importo"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.importo ?? ""}
                  onChange={(e) => set("importo", e.target.value === "" ? null : Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-avviso">{t("Avvisami giorni prima")}</Label>
                <Input
                  id="doc-avviso"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={365}
                  value={form.alert_giorni_prima ?? 30}
                  onChange={(e) => set("alert_giorni_prima", Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
            {!dataValida && (
              <p className="text-sm text-red-700">{t("La scadenza viene prima della data di inizio: controlla le date.")}</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="doc-file">
                {t("File")} {form.file_name && <span className="text-xs text-muted-foreground">{t("(ora: {file_name})", { file_name: String(form.file_name ?? "") })}</span>}
              </Label>
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input id="doc-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
              <p className="text-xs text-muted-foreground">{t("PDF o foto della polizza, del libretto, del contratto.")}</p>
              {form.categoria === "assicurazione" && (file || form.file_path) && (
                <Button type="button" variant="outline" size="sm" className="mt-1" onClick={compilaDallaPolizza} disabled={leggendo}>
                  {leggendo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4 text-orange-500" />}
                  {leggendo ? t("Sto leggendo la polizza…") : t("Compila dalla polizza")}
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-note">{t("Note")}</Label>
              <Textarea id="doc-note" rows={2} value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => chiudiFinestra(false)}>{t("Annulla")}</Button>
            <Button onClick={salvaDocumento} disabled={!dataValida || caricamento || leggendo || salva.isPending}>
              {(caricamento || salva.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Eliminare il documento?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare ? t(categoriaDocumentoLabel(daEliminare.categoria)) : ""}
              {daEliminare?.data_scadenza ? t(" in scadenza il {data_scadenza}", { data_scadenza: formatData(daEliminare.data_scadenza) }) : ""}{". "}{t("Si cancella anche il file allegato.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate(daEliminare)}
            >
              {t("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
