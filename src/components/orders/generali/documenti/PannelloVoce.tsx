// src/components/orders/generali/documenti/PannelloVoce.tsx
// Il pannello di una voce su una commessa: i file che la soddisfano, la scadenza e le azioni
// (carica, scegli tra i caricati, «non è questo», «non serve qui»). Lo stesso per la generale e
// per ogni figlia; senza permesso di modifica mostra soltanto.
import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { messaggioDocumenti, useAzioneDocumento, useCaricaDocumentoVoce, type AzioneDocumento } from "@/hooks/useGeneraleDocumenti";
import { ACCEPT_INPUT } from "@/lib/commesse/documentiCommessa";
import {
  oggiLocale, riconosce, scadenzaProposta, testoCasella,
  type AllegatoCommessa, type CasellaDocumento, type DocumentoDellaVoce,
} from "@/lib/orders/generali/documenti";
import { IconaStato } from "@/components/orders/generali/documenti/IconaStato";
import { COLORE_TONO, tonoCasella } from "@/components/orders/generali/documenti/statoVisivo";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const dataValida = (v: string) => v === "" || /^(19|20)\d\d-\d\d-\d\d$/.test(v);

export function PannelloVoce({ casella: c, generaleId, dove, allegati, puoModificare, nascondiIntestazione = false, apriOriginale }: {
  casella: CasellaDocumento;
  generaleId: string;
  /** La commessa su cui sta la voce, se è una figlia («ODL 12 · Via Roma»). */
  dove?: string;
  /** L'archivio della commessa su cui sta la voce. */
  allegati: readonly AllegatoCommessa[];
  puoModificare: boolean;
  nascondiIntestazione?: boolean;
  apriOriginale?: (file: AllegatoCommessa) => void;
}) {
  const t = useT();
  const azione = useAzioneDocumento(generaleId);
  const carica = useCaricaDocumentoVoce(generaleId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [scadenzaNuovo, setScadenzaNuovo] = useState(() => scadenzaProposta(c.voce, oggiLocale()) ?? "");
  const [scegli, setScegli] = useState(false);
  const occupato = azione.isPending || carica.isPending;
  const voce = c.voce;

  const esegui = (a: AzioneDocumento, fatto?: string) =>
    azione.mutate(a, {
      onSuccess: () => { if (fatto) toast.success(fatto); },
      onError: (e) => toast.error(t("Modifica non salvata"), { description: messaggioDocumenti(e, t("Riprova tra poco.")) }),
    });

  const caricaFile = async (files: FileList | null) => {
    const elenco = Array.from(files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    for (const file of elenco) {
      try {
        await carica.mutateAsync({ orderId: c.orderId, voce, file, scadenza: voce.conScadenza && scadenzaNuovo ? scadenzaNuovo : null });
        toast.success(t("«{file}» caricato per {voce}", { file: file.name, voce: voce.nome }), {
          description: voce.conScadenza && !scadenzaNuovo ? t("Indica la scadenza per avere l'avviso.") : undefined,
        });
      } catch (e) {
        toast.error(t("«{file}» non caricato", { file: file.name }), { description: messaggioDocumenti(e, t("Riprova tra poco.")) });
        return;
      }
    }
  };

  // I file dell'archivio di questa commessa non ancora legati alla voce; prima quelli che dal nome le somigliano.
  const candidati = useMemo(() => {
    const giaQui = new Set(c.documenti.map((d) => d.allegato.id));
    return allegati
      .filter((a) => !giaQui.has(a.id))
      .map((a) => ({ a, simile: riconosce(voce, a.file_name) }))
      .sort((x, y) => Number(y.simile) - Number(x.simile) || y.a.created_at.localeCompare(x.a.created_at));
  }, [allegati, voce, c.documenti]);

  return (
    <div className="space-y-3 text-sm">
      {!nascondiIntestazione && <div className="space-y-0.5">
        <p className="flex items-center gap-1.5 font-medium leading-tight"><IconaStato c={c} /> {voce.nome}</p>
        <p className={cn("text-xs", COLORE_TONO[tonoCasella(c)])}>{[dove, testoCasella(c)].filter(Boolean).join(" · ")}</p>
        {voce.aiuto && <p className="text-xs text-muted-foreground">{voce.aiuto}</p>}
      </div>}

      {c.documenti.length > 0 && (
        <ul className="space-y-2">
          {c.documenti.map((d) => (
            <DocumentoRiga key={d.allegato.id} d={d} c={c} puoModificare={puoModificare} occupato={occupato} esegui={esegui} apriOriginale={apriOriginale} />
          ))}
        </ul>
      )}

      {/* Senza acconti la fideiussione non serve ancora, ma si può già caricare. */}
      {puoModificare && (c.stato !== "non_serve" || c.nonServe?.motivo === "nessun_incasso") && (
        <div className="space-y-2 border-t pt-3">
          {voce.conScadenza && (
            <div className="flex items-center gap-2">
              <Label htmlFor={`scadenza-nuovo-${c.orderId}-${voce.id}`} className="shrink-0 text-xs font-normal text-muted-foreground">{t("Il file che carichi scade il")}</Label>
              <Input
                id={`scadenza-nuovo-${c.orderId}-${voce.id}`}
                type="date"
                className="h-8"
                value={scadenzaNuovo}
                onChange={(e) => setScadenzaNuovo(e.target.value)}
              />
            </div>
          )}
          <input ref={fileRef} type="file" multiple accept={ACCEPT_INPUT} aria-label={t("Carica file per {voce}", { voce: voce.nome })} className="hidden" onChange={(e) => void caricaFile(e.target.files)} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={occupato}>
              {carica.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              {t("Carica file")}
            </Button>
            {candidati.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setScegli((v) => !v)} aria-expanded={scegli} disabled={occupato}>
                {t("Scegli tra i caricati ({n})", { n: candidati.length })}
              </Button>
            )}
          </div>
          {scegli && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1" aria-label={t("File già nell'archivio di questa commessa")}>
              {candidati.map(({ a, simile }) => (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={occupato}
                    onClick={() => { setScegli(false); esegui({ tipo: "segna", orderId: c.orderId, voce: voce.id, attachmentId: a.id, scadenza: null }, t("Segnato per {voce}", { voce: voce.nome })); }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{a.file_name}</span>
                    {simile && <span className="shrink-0 text-[11px] text-muted-foreground">{t("dal nome sembra questo")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {c.documenti.length === 0 && c.stato !== "non_serve" && (
            <button
              type="button"
              disabled={occupato}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              onClick={() => esegui({ tipo: "non_serve", orderId: c.orderId, voce: voce.id }, t("{voce}: non serve qui", { voce: voce.nome }))}
            >
              {t("Non serve qui")}
            </button>
          )}
        </div>
      )}

      {puoModificare && c.stato === "non_serve" && c.nonServe?.segnoId && (
        <Button size="sm" variant="outline" disabled={occupato} onClick={() => esegui({ tipo: "serve", segnoId: c.nonServe!.segnoId! })}>
          {t("Serve di nuovo")}
        </Button>
      )}
    </div>
  );
}

function DocumentoRiga({ d, c, puoModificare, occupato, esegui, apriOriginale }: {
  d: DocumentoDellaVoce;
  c: CasellaDocumento;
  puoModificare: boolean;
  occupato: boolean;
  esegui: (a: AzioneDocumento, fatto?: string) => void;
  apriOriginale?: (file: AllegatoCommessa) => void;
}) {
  const t = useT();
  const [scadenza, setScadenza] = useState(d.scadenza ?? "");
  const salvaScadenza = () => {
    if (!dataValida(scadenza) || scadenza === (d.scadenza ?? "")) return;
    const valore = scadenza || null;
    // Un file riconosciuto dal nome diventa «segnato» quando gli si dà una scadenza.
    esegui(d.segnoId
      ? { tipo: "scadenza", segnoId: d.segnoId, scadenza: valore }
      : { tipo: "segna", orderId: c.orderId, voce: c.voce.id, attachmentId: d.allegato.id, scadenza: valore });
  };
  return (
    <li className="space-y-1.5 rounded-md border px-2.5 py-2">
      <button
        type="button"
        onClick={() => {
          if (apriOriginale) apriOriginale(d.allegato);
          else void openAttachmentInTab(d.allegato.file_url);
        }}
        className="flex w-full min-w-0 items-center gap-1.5 text-left text-xs font-medium hover:underline"
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate">{d.allegato.file_name}</span>
      </button>
      {d.riconosciuto && <p className="text-[11px] text-muted-foreground">{t("Riconosciuto dal nome del file.")}</p>}
      {c.voce.conScadenza && (puoModificare ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={`scadenza-${d.allegato.id}-${c.voce.id}`} className="shrink-0 text-xs font-normal text-muted-foreground">{t("Scade il")}</Label>
          <Input
            id={`scadenza-${d.allegato.id}-${c.voce.id}`}
            type="date"
            className="h-8"
            value={scadenza}
            disabled={occupato}
            onChange={(e) => setScadenza(e.target.value)}
            onBlur={salvaScadenza}
            onKeyDown={(e) => { if (e.key === "Enter") salvaScadenza(); }}
          />
        </div>
      ) : null)}
      {puoModificare && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {d.riconosciuto && (
            <button type="button" disabled={occupato} className="font-medium text-primary hover:underline disabled:opacity-50"
              onClick={() => esegui({ tipo: "segna", orderId: c.orderId, voce: c.voce.id, attachmentId: d.allegato.id, scadenza: scadenza || null }, t("Confermato"))}>
              {t("È questo")}
            </button>
          )}
          <button type="button" disabled={occupato} className="text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
            onClick={() => esegui({ tipo: "non_e_questo", orderId: c.orderId, voce: c.voce.id, attachmentId: d.allegato.id }, t("Tolto da {voce}: il file resta nell'archivio", { voce: c.voce.nome }))}>
            {t("Non è questo")}
          </button>
        </div>
      )}
    </li>
  );
}
