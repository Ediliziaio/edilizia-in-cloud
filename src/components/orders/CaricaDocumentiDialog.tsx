/**
 * Caricamento dei documenti di commessa: tanti file insieme, ognuno con la sua
 * cartella (proposta dal nome del file, correggibile), avanzamento per file.
 * Se un file non sale gli altri proseguono, e quello si riprova.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, Plus, RotateCcw, X } from "lucide-react";
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

const IN_PARALLELO = 3;

type Stato = "attesa" | "caricamento" | "fatto" | "errore";

interface Voce {
  chiave: string;
  file: File;
  cartellaId: string | null;
  stato: Stato;
  errore?: string;
  /** Peso originale se la foto è stata ridotta. */
  byteOriginali?: number;
  byteRidotti?: number;
}

let contatore = 0;

/** I file non ammessi si scartano qui; chi apre il dialog li ha già segnalati. */
function vociDaFile(files: File[], cartelle: CartellaDocumenti[], predefinita: string | null): Voce[] {
  const voci: Voce[] = [];
  for (const file of files) {
    if (problemaFile(file)) continue;
    voci.push({
      chiave: `${++contatore}-${file.name}`,
      file,
      cartellaId: cartellaSuggerita(file.name, cartelle, predefinita),
      stato: "attesa",
    });
  }
  return voci;
}

export function CaricaDocumentiDialog({
  open,
  onOpenChange,
  orderId,
  filesIniziali,
  cartelle,
  cartellaPredefinita,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** File scelti o trascinati che aprono il dialog. */
  filesIniziali: File[];
  cartelle: CartellaDocumenti[];
  /** Cartella aperta quando si è premuto «Carica» (o su cui si è trascinato). */
  cartellaPredefinita: string | null;
}) {
  const { user, profile, effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // Il genitore monta il dialog con una key nuova a ogni apertura: si parte
  // sempre dai file che l'hanno aperto.
  const [voci, setVoci] = useState<Voce[]>(() => vociDaFile(filesIniziali, cartelle, cartellaPredefinita));
  const [inCorso, setInCorso] = useState(false);
  const [riduci, setRiduci] = useState(true);
  const { data: spazio } = useSpazioArchiviazione();
  const liberi = byteLiberi(spazio);

  const aggiorna = (chiave: string, patch: Partial<Voce>) =>
    setVoci((prev) => prev.map((v) => (v.chiave === chiave ? { ...v, ...patch } : v)));

  const cartellaDi = (id: string | null) => cartelle.find((c) => c.id === id) ?? null;

  const caricaUno = async (v: Voce): Promise<boolean> => {
    if (!user) return false;
    aggiorna(v.chiave, { stato: "caricamento", errore: undefined });
    const { file, ridotta, byteOriginali } = riduci ? await riduciFile(v.file) : { file: v.file, ridotta: false, byteOriginali: v.file.size };
    if (ridotta) aggiorna(v.chiave, { byteOriginali, byteRidotti: file.size });
    const percorso = percorsoDocumento(orderId, file.name);
    try {
      const { error: errUpload } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .upload(percorso, file, { contentType: file.type || undefined });
      if (errUpload) throw errUpload;
      const miniatura = await caricaMiniatura(ATTACHMENTS_BUCKET, percorso, file);

      const visibile = cartellaDi(v.cartellaId)?.visibile_cliente ?? false;
      const { error: errRiga } = await supabase.from("order_attachments").insert({
        order_id: orderId,
        file_name: file.name,
        file_url: percorso,
        file_type: file.type || "application/octet-stream",
        file_size: file.size,
        uploaded_by: user.id,
        visible_to_customer: visibile,
        folder_id: v.cartellaId,
        thumb_path: miniatura,
      } as never);
      if (errRiga) {
        // Il file senza riga sarebbe invisibile: lo si toglie dallo storage.
        await supabase.storage.from(ATTACHMENTS_BUCKET).remove(miniatura ? [percorso, miniatura] : [percorso]);
        throw errRiga;
      }

      if (effectiveCompany?.id) {
        const autore = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || user.email || "Utente";
        void supabase.from("order_events" as never).insert({
          order_id: orderId,
          company_id: effectiveCompany.id,
          event_type: "allegato_caricato",
          payload: {
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            visible_to_customer: visibile,
            cartella: cartellaDi(v.cartellaId)?.nome ?? null,
          },
          actor_id: user.id,
          actor_name: autore,
        } as never);
      }
      aggiorna(v.chiave, { stato: "fatto", ...(ridotta ? { byteOriginali, byteRidotti: file.size } : {}) });
      return true;
    } catch (e) {
      logger.error("Caricamento documento commessa:", e);
      const err = e as { code?: string; message?: string; statusCode?: string };
      const msg =
        err?.code === "42501" || /row-level security|violates/i.test(err?.message ?? "")
          ? "Non hai il permesso di caricare documenti su questa commessa"
          : /too large|exceeded the maximum|413/i.test(`${err?.message} ${err?.statusCode}`)
            ? "File oltre i 50 MB: dividilo o riducilo e riprova"
            : /fetch|network|timeout/i.test(err?.message ?? "")
              ? "Connessione interrotta: premi Riprova"
              : err?.message || "Caricamento non riuscito";
      aggiorna(v.chiave, { stato: "errore", errore: msg });
      return false;
    }
  };

  const caricaTutti = async (soloErrori = false) => {
    const daFare = voci.filter((v) => (soloErrori ? v.stato === "errore" : v.stato === "attesa" || v.stato === "errore"));
    if (daFare.length === 0) return;
    // Stima prudente: le foto ridotte peseranno meno, qui si conta il peso pieno dei documenti.
    const stima = daFare.reduce((t, v) => t + (riduci && fotoDaRidurre(v.file) ? v.file.size * 0.3 : v.file.size), 0);
    if (liberi != null && stima > liberi) {
      toast.error("Spazio di archiviazione esaurito", {
        description: `Servono circa ${fmtBytes(stima)}, ne restano ${fmtBytes(liberi) || "0 MB"}. Libera spazio o passa a un piano superiore (Impostazioni → Abbonamento).`,
      });
      return;
    }
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
    setInCorso(false);
    queryClient.invalidateQueries({ queryKey: ["order-attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-documents-summary", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order_attachments", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
    queryClient.invalidateQueries({ queryKey: ["order-diary-audit", orderId] });
    queryClient.invalidateQueries({ queryKey: chiaveSpazio(effectiveCompany?.id) });
    queryClient.invalidateQueries({ queryKey: ["spazio-archiviazione"] });

    const falliti = daFare.length - ok;
    if (falliti === 0) {
      toast.success(ok === 1 ? "Documento caricato" : `${ok} documenti caricati`);
      onOpenChange(false);
    } else {
      toast.error(`${falliti} file non caricati`, {
        description: ok > 0 ? `${ok} caricati. Controlla quelli in rosso e riprova.` : "Controlla il motivo accanto al file e riprova.",
      });
    }
  };

  const daCaricare = voci.filter((v) => v.stato !== "fatto").length;
  const errori = voci.filter((v) => v.stato === "errore").length;
  const valoreComune = (() => {
    const set = new Set(voci.map((v) => v.cartellaId ?? ""));
    return set.size === 1 ? [...set][0] : "";
  })();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!inCorso) onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Carica documenti</DialogTitle>
          <DialogDescription>
            Controlla la cartella di ogni file: è proposta dal nome del file. Massimo 50 MB per file.
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
            const scelti = Array.from(e.target.files ?? []);
            for (const f of scelti) {
              const problema = problemaFile(f);
              if (problema) toast.error("File escluso", { description: problema });
            }
            const nuovi = vociDaFile(scelti, cartelle, cartellaPredefinita);
            setVoci((prev) => [...prev, ...nuovi]);
            e.target.value = "";
          }}
        />

        {voci.length > 1 && cartelle.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Metti tutti in</span>
            <Select
              value={valoreComune}
              disabled={inCorso}
              onValueChange={(val) =>
                setVoci((prev) => prev.map((v) => (v.stato === "fatto" ? v : { ...v, cartellaId: val })))
              }
            >
              <SelectTrigger className="h-8 w-auto min-w-[200px] max-w-full">
                <SelectValue placeholder="Cartelle diverse" />
              </SelectTrigger>
              <SelectContent>
                {cartelle.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {voci.some((v) => fotoDaRidurre(v.file) || pdfDaValutare(v.file)) ? (
            <label htmlFor="riduci-foto-commessa" className="flex items-center gap-2 cursor-pointer">
              <Checkbox id="riduci-foto-commessa" checked={riduci} disabled={inCorso} onCheckedChange={(c) => setRiduci(c === true)} />
              Riduci foto e PDF scansionati (restano leggibili, pesano molto meno)
            </label>
          ) : <span />}
          {liberi != null && (
            <span className="tabular-nums">Spazio libero: {fmtBytes(liberi) || "0 MB"}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 divide-y border rounded-md">
          {voci.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessun file da caricare.</p>
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
                          ? `Ridotto da ${fmtBytes(v.byteOriginali)} a ${fmtBytes(v.byteRidotti)}`
                          : fmtBytes(v.file.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-7 sm:pl-0">
                  <Select
                    value={v.cartellaId ?? ""}
                    disabled={inCorso || v.stato === "fatto"}
                    onValueChange={(val) => aggiorna(v.chiave, { cartellaId: val })}
                  >
                    <SelectTrigger className={`h-8 w-full sm:w-[240px] text-xs ${v.cartellaId ? "" : "text-muted-foreground"}`}>
                      <SelectValue placeholder="Scegli la cartella" />
                    </SelectTrigger>
                    <SelectContent>
                      {cartelle.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                          </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={inCorso || v.stato === "fatto"}
                    onClick={() => setVoci((prev) => prev.filter((x) => x.chiave !== v.chiave))}
                    aria-label={`Togli ${v.file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Mobile: una riga sola — «+» per aggiungere file e «Carica» che la
            riempie; Annulla/Chiudi c'è già (la X e il gesto verso il basso). */}
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:justify-between max-sm:flex-row max-sm:flex-nowrap max-sm:[&>*]:flex-none">
          <Button type="button" variant="ghost" disabled={inCorso} onClick={() => inputRef.current?.click()} aria-label="Aggiungi file" className="max-sm:w-11 max-sm:px-0">
            <Plus className="h-4 w-4 mr-1 max-sm:mr-0" /><span aria-hidden="true" className="max-sm:hidden">Aggiungi file</span>
          </Button>
          <div className="flex flex-col-reverse sm:flex-row gap-2 max-sm:flex-1 max-sm:flex-row">
            <Button type="button" variant="outline" disabled={inCorso} onClick={() => onOpenChange(false)} className="max-sm:hidden">
              {voci.some((v) => v.stato === "fatto") ? "Chiudi" : "Annulla"}
            </Button>
            <Button type="button" disabled={inCorso || daCaricare === 0} onClick={() => void caricaTutti()} className="max-sm:flex-1">
              {inCorso ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : errori > 0 ? (
                <RotateCcw className="h-4 w-4 mr-2" />
              ) : null}
              {inCorso
                ? "Caricamento…"
                : errori > 0 && errori === daCaricare
                  ? `Riprova ${errori} file`
                  : `Carica ${daCaricare} file`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
