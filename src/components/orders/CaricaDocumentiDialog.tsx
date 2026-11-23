import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Caricamento dei documenti di commessa: tanti file insieme, ognuno con la sua
 * cartella (proposta dal nome del file, correggibile), avanzamento per file.
 * Se un file non sale gli altri proseguono, e quello si riprova.
 */
import { usePermissions } from "@/hooks/usePermissions";
import { useRef, useState, type DragEvent } from "react";
import { Progress } from "@/components/ui/progress";
import { caricaAllegatoConProgresso, oggettoGiaCaricato } from "@/lib/commesse/caricaAllegatoConProgresso";
import { TIPI_DOCUMENTO_CANTIERE, tipoDocumentoCantiere, type TipoDocumentoCantiere } from "@/lib/commesse/documentiCantiere";
import { useQueryClient } from "@tanstack/react-query";
import { invalidaChecklistCollegate } from "@/hooks/useGeneraleDocumenti";
import { Checkbox } from "@/components/ui/checkbox";
import { byteLiberi, chiaveSpazio, useSpazioArchiviazione } from "@/hooks/useSpazioArchiviazione";
import { riduciFile, fotoDaRidurre } from "@/lib/commesse/riduciFoto";
import { pdfDaValutare } from "@/lib/commesse/riduciPdf";
import { caricaMiniatura } from "@/lib/commesse/miniatura";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import {
  ACCEPT_INPUT,
  cartellaSuggerita,
  percorsoDocumento,
  problemaFile,
  type CartellaDocumenti,
} from "@/lib/commesse/documentiCommessa";
import { ATTACHMENTS_BUCKET, fmtBytes } from "./filePreviewUtils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const IN_PARALLELO = 3;
const SENZA_CARTELLA = "senza";
const PREFISSO_CANTIERE = "cantiere:";

type Stato = "attesa" | "caricamento" | "fatto" | "errore";

interface Voce {
  chiave: string;
  file: File;
  cartellaId: string | null;
  tipoCantiere: TipoDocumentoCantiere | null;
  stato: Stato;
  progresso?: number;
  errore?: string;
  registrazioneIncerta?: boolean;
  /** Peso originale se la foto è stata ridotta. */
  byteOriginali?: number;
  byteRidotti?: number;
}

interface Caricamento {
  id: string;
  file: File;
  percorso: string;
  miniatura: string | null;
  inviato: boolean;
  invioIncerto: boolean;
}

let contatore = 0;

/** I file non ammessi si scartano qui; chi apre il dialog li ha già segnalati. */
function vociDaFile(files: File[], cartelle: CartellaDocumenti[], predefinita: string | null, cantiere: TipoDocumentoCantiere | true | null): Voce[] {
  const voci: Voce[] = [];
  for (const file of files) {
    if (problemaFile(file)) continue;
    const suggerito = tipoDocumentoCantiere(file.name);
    const tipo = cantiere === true ? suggerito ?? "altro" : cantiere ?? (predefinita ? null : suggerito);
    voci.push({
      chiave: `${++contatore}-${file.name}`,
      file,
      tipoCantiere: tipo,
      cartellaId: tipo ? null : cartellaSuggerita(file.name, cartelle, predefinita),
      stato: "attesa",
    });
  }
  return voci;
}

function destinazione(voce: Voce) {
  return voce.tipoCantiere ? `${PREFISSO_CANTIERE}${voce.tipoCantiere}` : voce.cartellaId ?? SENZA_CARTELLA;
}

function cambiaDestinazione(valore: string): Pick<Voce, "tipoCantiere" | "cartellaId"> {
  return valore.startsWith(PREFISSO_CANTIERE)
    ? { tipoCantiere: valore.slice(PREFISSO_CANTIERE.length) as TipoDocumentoCantiere, cartellaId: null }
    : { tipoCantiere: null, cartellaId: valore === SENZA_CARTELLA ? null : valore };
}

function Destinazioni({ cartelle }: { cartelle: CartellaDocumenti[] }) {
  const t = useT();
  return <SelectContent>
    <SelectGroup>
      <SelectLabel>{t("Documenti commessa")}</SelectLabel>
      <SelectItem value={SENZA_CARTELLA}>{t("Senza categoria")}</SelectItem>
      {cartelle.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>{t("Documenti di cantiere")}</SelectLabel>
      {Object.entries(TIPI_DOCUMENTO_CANTIERE).map(([tipo, nome]) => <SelectItem key={tipo} value={`${PREFISSO_CANTIERE}${tipo}`}>{t(nome)}</SelectItem>)}
    </SelectGroup>
  </SelectContent>;
}

export function CaricaDocumentiDialog({
  open,
  onOpenChange,
  orderId,
  filesIniziali,
  cartelle,
  cartellaPredefinita,
  cantierePredefinito = null,
  onMostraCantiere,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** File scelti o trascinati che aprono il dialog. */
  filesIniziali: File[];
  cartelle: CartellaDocumenti[];
  /** Cartella aperta quando si è premuto «Carica» (o su cui si è trascinato). */
  cartellaPredefinita: string | null;
  cantierePredefinito?: TipoDocumentoCantiere | true | null;
  onMostraCantiere?: () => void;
}) {
  const t = useT();
  const { user, profile, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // Il genitore monta il dialog con una key nuova a ogni apertura: si parte
  // sempre dai file che l'hanno aperto.
  const [voci, setVoci] = useState<Voce[]>(() => vociDaFile(filesIniziali, cartelle, cartellaPredefinita, cantierePredefinito));
  const [inCorso, setInCorso] = useState(false);
  const avviato = useRef(false);
  const daRegistrare = useRef(new Map<string, Caricamento>());
  const [trascina, setTrascina] = useState(false);
  const permissions = usePermissions();
  const [accessScope,setAccessScope] = useState("operativo");
  const [riduci, setRiduci] = useState(true);
  const { data: spazio } = useSpazioArchiviazione();
  const liberi = byteLiberi(spazio);

  const aggiorna = (chiave: string, patch: Partial<Voce>) =>
    setVoci((prev) => prev.map((v) => (v.chiave === chiave ? { ...v, ...patch } : v)));

  const aggiungiFile = (file: File[]) => {
    if (avviato.current) return;
    for (const f of file) {
      const problema = problemaFile(f);
      if (problema) toast.error(t("File escluso"), { description: problema });
    }
    const nuovi = vociDaFile(file, cartelle, cartellaPredefinita, cantierePredefinito);
    setVoci((prev) => [...prev, ...nuovi]);
  };
  const fileTrascinati = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const cartellaDi = (id: string | null) => cartelle.find((c) => c.id === id) ?? null;

  const caricaUno = async (v: Voce): Promise<boolean> => {
    aggiorna(v.chiave, { stato: "caricamento", progresso: undefined, errore: undefined });
    try {
      if (!user) throw new Error(t("Accedi di nuovo per caricare i documenti"));
      let caricamento = daRegistrare.current.get(v.chiave);
      if (!caricamento) {
        const { file, ridotta, byteOriginali } = riduci ? await riduciFile(v.file) : { file: v.file, ridotta: false, byteOriginali: v.file.size };
        if (ridotta) aggiorna(v.chiave, { byteOriginali, byteRidotti: file.size });
        const id = crypto.randomUUID();
        const percorso = percorsoDocumento(orderId, file.name, undefined, id);
        caricamento = { id, file, percorso, miniatura: null, inviato: false, invioIncerto: false };
        daRegistrare.current.set(v.chiave, caricamento);
      }
      if (!caricamento.inviato) {
        const { file, percorso } = caricamento;
        aggiorna(v.chiave, { progresso: 0 });
        try {
          await caricaAllegatoConProgresso(ATTACHMENTS_BUCKET, percorso, file, (progresso) => aggiorna(v.chiave, { progresso }));
        } catch (errore) {
          if (!caricamento.invioIncerto || !oggettoGiaCaricato(errore)) {
            const dettaglio = errore as { statusCode?: number; message?: string } | undefined;
            if (/timeout|network/i.test(dettaglio?.message ?? "") || (dettaglio?.statusCode ?? 0) >= 500) caricamento.invioIncerto = true;
            else if (!caricamento.invioIncerto) daRegistrare.current.delete(v.chiave);
            throw errore;
          }
        }
        caricamento.inviato = true;
        aggiorna(v.chiave, { progresso: 100 });
        caricamento.miniatura = await caricaMiniatura(ATTACHMENTS_BUCKET, percorso, file).catch((): null => null);
      }
      aggiorna(v.chiave, { progresso: 100 });
      const { id, file, percorso, miniatura } = caricamento;

      const visibile = cartellaDi(v.cartellaId)?.visibile_cliente ?? false;
      const { error: errRiga } = await supabase.from("order_attachments").insert({
        id,
        order_id: orderId,
        access_scope: accessScope,
        file_name: file.name,
        file_url: percorso,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        uploaded_by: user.id,
        visible_to_customer: visibile,
        folder_id: v.cartellaId,
        thumb_path: miniatura,
        ...(v.tipoCantiere ? { cantiere_tipo: v.tipoCantiere } : {}),
      } as never);
      let giaSalvato = false;
      if (errRiga?.code === "23505") {
        const { data } = await supabase.from("order_attachments").select("id")
          .eq("id", id).eq("order_id", orderId).eq("file_url", percorso).maybeSingle();
        giaSalvato = data?.id === id;
      }
      if (errRiga && !giaSalvato) {
        // Un timeout lascia incerto l'esito. Al tentativo successivo si riusa
        // lo stesso ID e lo stesso file, senza cancellare un allegato già salvato.
        if (/^(22|23|42)/.test(errRiga.code) && errRiga.code !== "23505") {
          const { error: errPulizia } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(miniatura ? [percorso, miniatura] : [percorso]);
          if (errPulizia) logger.error("Pulizia allegato non registrato:", errPulizia);
          else daRegistrare.current.delete(v.chiave);
        }
        throw errRiga;
      }
      daRegistrare.current.delete(v.chiave);

      if (!giaSalvato && effectiveCompany?.id) {
        const autore = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || user.email || "Utente";
        void supabase.from("order_events" as never).insert({
          order_id: orderId,
          access_scope: accessScope,
          company_id: effectiveCompany.id,
          event_type: "allegato_caricato",
          payload: {
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            visible_to_customer: visibile,
            cartella: v.tipoCantiere ? TIPI_DOCUMENTO_CANTIERE[v.tipoCantiere] : cartellaDi(v.cartellaId)?.nome ?? null,
          },
          actor_id: user.id,
          actor_name: autore,
        } as never);
      }
      aggiorna(v.chiave, { stato: "fatto", registrazioneIncerta: false });
      return true;
    } catch (e) {
      logger.error("Caricamento documento commessa:", e);
      const err = e as { code?: string; message?: string; statusCode?: string };
      const msg =
        err?.code === "42501" || Number(err?.statusCode) === 403 || /row-level security|violates/i.test(err?.message ?? "")
          ? t("Non hai il permesso di caricare documenti su questa commessa")
          : /too large|exceeded the maximum|413/i.test(`${err?.message} ${err?.statusCode}`)
            ? t("File oltre i 50 MB: dividilo o riducilo e riprova")
            : /fetch|network|timeout/i.test(err?.message ?? "")
              ? t("Connessione interrotta: premi Riprova")
              : err?.message || t("Caricamento non riuscito");
      aggiorna(v.chiave, { stato: "errore", errore: msg, registrazioneIncerta: daRegistrare.current.get(v.chiave)?.inviato });
      return false;
    }
  };

  const caricaTutti = async () => {
    const daFare = voci.filter((v) => v.stato === "attesa" || v.stato === "errore");
    if (avviato.current || daFare.length === 0) return;
    // Stima prudente: le foto ridotte peseranno meno, qui si conta il peso pieno dei documenti.
    const stima = daFare.reduce((somma, v) => {
      const giaInviato = daRegistrare.current.get(v.chiave);
      if (giaInviato?.inviato || giaInviato?.invioIncerto) return somma;
      return somma + (riduci && fotoDaRidurre(v.file) ? v.file.size * 0.3 : v.file.size);
    }, 0);
    if (stima > 0 && liberi != null && stima > liberi) {
      toast.error(t("Spazio di archiviazione esaurito"), {
        description: t("Servono circa {stima}, ne restano {liberi}. Libera spazio o passa a un piano superiore (Impostazioni → Piano abbonamento).", { stima: fmtBytes(stima), liberi: fmtBytes(liberi) || "0 MB" }),
      });
      return;
    }
    avviato.current = true;
    setInCorso(true);
    let ok = 0;
    const coda = [...daFare];
    await Promise.all(
      Array.from({ length: Math.min(IN_PARALLELO, coda.length) }, async () => {
        while (coda.length) {
          const v = coda.shift()!;
          if (await caricaUno(v)) ok++;
        }
      }),
    );
    avviato.current = false;
    setInCorso(false);
    queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
    void invalidaChecklistCollegate(queryClient, orderId);
    queryClient.invalidateQueries({ queryKey: ["campo-scheda-cantiere", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-documents-summary", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order_attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["customer-order-attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["cartelle-documenti-uso"] });
    queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-diary-audit", orderId] });
    queryClient.invalidateQueries({ queryKey: chiaveSpazio(effectiveCompany?.id) });
    queryClient.invalidateQueries({ queryKey: ["spazio-archiviazione"] });

    const falliti = daFare.length - ok;
    if (falliti === 0) {
      toast.success(ok === 1 ? t("Documento caricato") : t("{n} documenti caricati", { n: ok }));
    } else {
      toast.error(t("{n} file non caricati", { n: falliti }), {
        description: ok > 0 ? t("{n} caricati. Controlla quelli in rosso e riprova.", { n: ok }) : t("Controlla il motivo accanto al file e riprova."),
      });
    }
  };

  const daCaricare = voci.filter((v) => v.stato !== "fatto").length;
  const completati = voci.length - daCaricare;
  const registrazioneIncerta = voci.some(v => v.registrazioneIncerta);
  const errori = voci.filter((v) => v.stato === "errore").length;
  const valoreComune = (() => {
    const set = new Set(voci.filter((v) => v.stato !== "fatto").map(destinazione));
    return set.size === 1 ? [...set][0] : "";
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!inCorso) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("Carica documenti")}</DialogTitle>
          <DialogDescription>
            {t("Scegli dove archiviare i file. Puoi aggiungerne altri fino a 50 MB ciascuno.")}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          id="carica-documenti-altri"
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          className="hidden"
          onChange={(e) => {
            aggiungiFile(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div
          onDragEnter={(e) => { if (fileTrascinati(e)) { e.preventDefault(); e.stopPropagation(); setTrascina(!inCorso); } }}
          onDragOver={(e) => { if (fileTrascinati(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = inCorso ? "none" : "copy"; } }}
          onDragLeave={(e) => { if (fileTrascinati(e)) { e.stopPropagation(); setTrascina(false); } }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setTrascina(false); aggiungiFile(Array.from(e.dataTransfer.files)); }}
        >
          <Button type="button" variant="outline" disabled={inCorso} onClick={() => inputRef.current?.click()}
            className={`w-full justify-center gap-2 border-dashed ${trascina ? "border-primary bg-primary/10" : "bg-muted/30"}`}>
            <Upload className="h-4 w-4" aria-hidden="true" /> {t("Aggiungi file")} <span className="hidden font-normal text-muted-foreground sm:inline">{t("o trascinali qui")}</span>
          </Button>
        </div>

        {daCaricare > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Metti tutti in")}</span>
            <Select
              value={valoreComune}
              disabled={inCorso || registrazioneIncerta}
              onValueChange={(val) =>
                setVoci((prev) => prev.map((v) => (v.stato === "fatto" ? v : { ...v, ...cambiaDestinazione(val) })))
              }
            >
              <SelectTrigger className="h-8 w-auto min-w-[200px] max-w-full">
                <SelectValue placeholder={t("Cartelle diverse")} />
              </SelectTrigger>
              <Destinazioni cartelle={cartelle} />
            </Select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {voci.some((v) => fotoDaRidurre(v.file) || pdfDaValutare(v.file)) ? (
            <label htmlFor="riduci-foto-commessa" className="flex items-center gap-2 cursor-pointer">
              <Checkbox id="riduci-foto-commessa" checked={riduci} disabled={inCorso} onCheckedChange={(c) => setRiduci(c === true)} />
              {t("Riduci foto e PDF scansionati (restano leggibili, pesano molto meno)")}
            </label>
          ) : <span />}
          {liberi != null && (
            <span className="tabular-nums">{t("Spazio libero: {spazio}", { spazio: fmtBytes(liberi) || "0 MB" })}</span>
          )}
        </div>

        {voci.length > 0 && (inCorso || completati > 0 || errori > 0) && <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
          <p role="status" className="text-sm font-medium">{completati === voci.length ? t("Caricamento completato") : `${t("{n} di {totale} file caricati", { n: completati, totale: voci.length })}${errori ? ` · ${t("{n} da riprovare", { n: errori })}` : ""}`}</p>
          <Progress className="h-2" value={completati / voci.length * 100} aria-label={t("Avanzamento complessivo")} />
          {!inCorso && completati === voci.length && onMostraCantiere && voci.some(v => v.tipoCantiere) &&
            <Button type="button" variant="link" className="h-auto p-0" onClick={onMostraCantiere}>{t("Vai ai documenti di cantiere")}</Button>}
        </div>}
        <div className="min-h-16 flex-1 overflow-y-auto -mx-1 px-1 divide-y border rounded-md">
          {voci.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("Nessun file da caricare.")}</p>
          ) : (
            voci.map((v) => (
              <div key={v.chiave} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-5 shrink-0 flex justify-center">
                    {v.stato === "caricamento" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {v.stato === "fatto" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {v.stato === "errore" && <AlertCircle className="h-4 w-4 text-destructive" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" title={v.file.name}>{v.file.name}</p>
                    <p className={`text-xs ${v.stato === "errore" ? "text-destructive" : "text-muted-foreground"}`}>
                      {v.stato === "errore"
                        ? v.errore
                        : v.byteOriginali
                          ? t("Ridotto da {prima} a {dopo}", { prima: fmtBytes(v.byteOriginali), dopo: fmtBytes(v.byteRidotti) })
                          : fmtBytes(v.file.size)}
                    </p>
                  </div>
                  {v.stato === "caricamento" && <div className="min-w-24 flex-1 pl-2">
                    <p className="mb-1 text-xs text-muted-foreground">{v.progresso === undefined ? t("Preparazione…") : v.progresso === 100 ? t("Salvataggio…") : `${v.progresso}%`}</p>
                    <Progress className="h-1.5" value={v.progresso == null ? null : Math.min(v.progresso, 99)} aria-label={t("Caricamento {nome}", { nome: v.file.name })} />
                  </div>}
                </div>
                <div className="flex items-center gap-1 pl-7 sm:pl-0">
                  <Select
                    value={destinazione(v)}
                    disabled={inCorso || v.stato === "fatto" || v.registrazioneIncerta}
                    onValueChange={(val) => aggiorna(v.chiave, cambiaDestinazione(val))}
                  >
                    <SelectTrigger className={`h-8 w-full sm:w-[240px] text-xs ${v.cartellaId || v.tipoCantiere ? "" : "text-muted-foreground"}`}>
                      <SelectValue placeholder={t("Scegli la cartella")} />
                    </SelectTrigger>
                    <Destinazioni cartelle={cartelle} />
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={inCorso || v.stato === "fatto"}
                    onClick={() => setVoci((prev) => prev.filter((x) => x.chiave !== v.chiave))}
                    aria-label={t("Togli {nome}", { nome: v.file.name })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-md border p-3"><label htmlFor="document-access" className="text-sm font-medium">{t("Chi può leggere questi file")}</label><UniformSelect id="document-access" className="mt-2 block w-full rounded-md border p-2 text-sm" value={accessScope} disabled={inCorso || registrazioneIncerta} onChange={e=>setAccessScope(e.target.value)}><option value="operativo">{t("Uffici con accesso alla commessa")}</option>{permissions.canViewOrderAmounts && <option value="vendita">{t("Solo chi vede gli importi di vendita")}</option>}{permissions.canViewCosts && <option value="costi">{t("Solo chi vede i costi")}</option>}{permissions.canViewCosts && (permissions.canViewEmployees || permissions.canViewPersone) && <option value="personale">{t("Solo personale autorizzato ai dati HR")}</option>}{permissions.isAdmin && <option value="riservato">{t("Solo amministratori")}</option>}</UniformSelect><p className="mt-1 text-xs text-muted-foreground">{t("Contratti, fatture e documenti del personale devono avere il livello di riservatezza adatto al contenuto. La cartella non cambia i permessi.")}</p>{!inCorso && registrazioneIncerta && <p className="mt-1 text-xs text-muted-foreground">{t("Riprova il salvataggio per confermare le impostazioni del primo invio.")}</p>}</div>
        <DialogFooter>
            <Button type="button" variant={daCaricare ? "outline" : "default"} disabled={inCorso} onClick={() => onOpenChange(false)}>
              {completati === voci.length && completati > 0 ? t("Fine") : completati ? t("Chiudi") : t("Annulla")}
            </Button>
            {daCaricare > 0 && <Button type="button" disabled={inCorso || daCaricare === 0} onClick={() => void caricaTutti()} className="max-sm:flex-1">
              {inCorso ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : errori > 0 ? (
                <RotateCcw className="h-4 w-4 mr-2" />
              ) : null}
              {inCorso
                ? t("Caricamento…")
                : errori > 0 && errori === daCaricare
                  ? t("Riprova {n} file", { n: errori })
                  : t("Carica {n} file", { n: daCaricare })}
            </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
