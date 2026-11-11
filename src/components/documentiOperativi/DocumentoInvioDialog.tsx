import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DestinazioneDocumento } from "./DestinazioneDocumento";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import {
  condizioniDocumento,
  footerAzienda,
} from "@/lib/documentiOperativi/modello";
import { leggiModelloPdf } from "@/lib/modelliPdf/repository";
import type { ModelloPdf } from "@/lib/modelliPdf/catalogo";
import { DOCUMENTI_STANDARD_VERSIONE } from "@/lib/documentiOperativi/standard";
import { Textarea } from "@/components/ui/textarea";
import {
  EmailComposeDialog,
  type ComposeContext,
  type ComposeAttachment,
} from "@/pages/azienda/email/components/EmailComposeDialog";
import {
  corpoDocumento,
  senzaPrezzi,
  erroriDocumento,
  TITOLI,
  nomeFileDocumento,
  modificaNumeroRigaDocumento,
  type DocumentoOperativo,
  type TipoDocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
import { FileDown, Loader2, Mail, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { isValidEmail } from "@/lib/email/preferencesValidators";

const PdfPreview = lazy(() =>
  import("@/components/shared/PdfBlobLivePreviewPanel").then((m) => ({
    default: m.PdfBlobLivePreviewPanel,
  })),
);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documento: DocumentoOperativo;
  context: ComposeContext;
  orderId?: string | null;
  onSent?: () => void;
  tipi?: TipoDocumentoOperativo[];
  modificaRighe?: boolean;
  initialMode?: "testo" | "pdf";
};
export function DocumentoInvioDialog(props: Props) {
  const { effectiveCompany } = useAuth();
  return props.open && effectiveCompany ? (
    <DocumentoInvioContent
      key={`${effectiveCompany.id}:${props.documento.fornitoreId ?? props.documento.numero}:${JSON.stringify([props.documento.destinatario, props.documento.pagamento, props.documento.referentiFornitore])}`}
      {...props}
    />
  ) : null;
}
function DocumentoInvioContent({
  open,
  onOpenChange,
  documento,
  context,
  orderId,
  onSent,
  tipi,
  modificaRighe = false,
  initialMode = "testo",
}: Props) {
  const { effectiveCompany, user } = useAuth();
  const [d, setD] = useState(() =>
    documento.tipo === "trasporti" || documento.tipo === "economia"
      ? {
          ...documento,
          banca: effectiveCompany?.bank_name,
          iban: effectiveCompany?.bank_iban,
        }
      : documento,
  );
  const [commessaId, setCommessaId] = useState<string | null>(orderId ?? null);
  const [modo, setModo] = useState<"testo" | "pdf">(initialMode);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    blob: Blob;
    url: string;
    key: string;
  } | null>(null);
  const chiave = JSON.stringify([
    DOCUMENTI_STANDARD_VERSIONE,
    d,
    effectiveCompany?.logo_url,
    effectiveCompany ? footerAzienda(effectiveCompany) : [],
  ]);
  const blob = preview?.key === chiave ? preview.blob : null;
  const url = preview?.key === chiave ? preview.url : null;
  const [email, setEmail] = useState<ComposeContext | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const operazione = useRef(0);
  useEffect(
    () => () => {
      operazione.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  if (!effectiveCompany) return null;
  const cambia = <K extends keyof DocumentoOperativo>(
    key: K,
    value: DocumentoOperativo[K],
  ) => setD((prev) => ({ ...prev, [key]: value }));
  const genera = async (documentoPdf = d, modello?: ModelloPdf) => {
    const { generaPdfOperativo } = await import("@/lib/documentiOperativi/pdf");
    return generaPdfOperativo(documentoPdf, effectiveCompany, modello);
  };
  const anteprima = async () => {
    const op = ++operazione.current;
    setBusy(true);
    setErrore(null);
    try {
      const b = await genera();
      if (op === operazione.current)
        setPreview({ blob: b, url: URL.createObjectURL(b), key: chiave });
    } catch (e) {
      if (op === operazione.current)
        setErrore(e instanceof Error ? e.message : "PDF non disponibile");
    } finally {
      if (op === operazione.current) setBusy(false);
    }
  };
  const prepara = async () => {
    const problemi = erroriDocumento(d);
    if (
      d.destinatario.email?.trim() &&
      !isValidEmail(d.destinatario.email.trim())
    )
      problemi.push(
        "Correggi l’email del destinatario prima di preparare il messaggio.",
      );
    if (problemi.length) {
      setErrore(problemi.slice(0, 4).join(" "));
      return;
    }
    const op = ++operazione.current;
    setBusy(true);
    setErrore(null);
    let uploaded: string | null = null;
    try {
      const modello = await leggiModelloPdf(effectiveCompany.id, d.tipo);
      const documentoInvio = { ...d, condizioni: d.condizioni?.trim() || modello.condizioni || d.condizioni };
      const allegati: ComposeAttachment[] = [];
      if (modo === "pdf") {
        if (!user?.id)
          throw new Error("Accedi di nuovo per preparare l'allegato.");
        const b = await genera(documentoInvio, modello);
        if (op !== operazione.current) return;
        const name = nomeFileDocumento(d);
        const path = `${user.id}/tmp/${crypto.randomUUID()}-${name}`;
        const { error } = await supabase.storage
          .from("email-attachments")
          .upload(path, b, { contentType: "application/pdf", upsert: false });
        if (error) throw new Error(`PDF non allegato: ${error.message}`);
        uploaded = path;
        if (op !== operazione.current) {
          await supabase.storage.from("email-attachments").remove([path]);
          return;
        }
        allegati.push({
          name,
          size: b.size,
          mime: "application/pdf",
          storage_path: path,
        });
      }
      if (op !== operazione.current) return;
      setEmail({
        ...context,
        initialSubject:
          d.numero === documento.numero && d.tipo === documento.tipo
            ? context.initialSubject
            : `${TITOLI[d.tipo]} ${d.tipo === "richiesta" ? `[${d.numero}]` : d.numero} | ${effectiveCompany.name}`,
        initialTo: d.destinatario.email?.trim()
          ? [d.destinatario.email.trim()]
          : d.fornitoreId
            ? []
            : context.initialTo,
        initialBodyHtml: corpoDocumento(documentoInvio, effectiveCompany, modo === "pdf"),
        initialAttachments: [
          ...(context.initialAttachments ?? []),
          ...allegati,
        ],
      });
    } catch (e) {
      if (uploaded)
        await supabase.storage.from("email-attachments").remove([uploaded]);
      if (op === operazione.current) {
        const msg =
          e instanceof Error ? e.message : "Preparazione non riuscita";
        setErrore(msg);
        toast.error(msg);
      }
    } finally {
      if (op === operazione.current) setBusy(false);
    }
  };
  return (
    <>
      <Dialog
        open={open && !email}
        onOpenChange={(v) => {
          if (!busy) onOpenChange(v);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Prepara documento e invio</DialogTitle>
            <DialogDescription>
              Controlla i dati, scegli testo nell’email o PDF allegato. L’email
              si apre per la revisione: l’invio avviene solo dal pulsante Invia.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="doc-tipo">Documento</Label>
                <select
                  id="doc-tipo"
                  value={d.tipo}
                  onChange={(e) =>
                    setD((v) => ({
                      ...v,
                      tipo: e.target.value as TipoDocumentoOperativo,
                      condizioni: undefined,
                      inversioneContabile: false,
                    }))
                  }
                  className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                >
                  {(tipi ?? [d.tipo]).map((t) => (
                    <option key={t} value={t}>
                      {TITOLI[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="doc-numero">Numero / riferimento</Label>
                <Input
                  id="doc-numero"
                  readOnly={!modificaRighe}
                  value={d.numero}
                  onChange={(e) => cambia("numero", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-data">Data documento</Label>
                <Input
                  id="doc-data"
                  type="date"
                  value={d.data ?? ""}
                  onChange={(e) => cambia("data", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="doc-nome">Destinatario</Label>
                <Input
                  id="doc-nome"
                  value={d.destinatario.nome}
                  onChange={(e) =>
                    cambia("destinatario", {
                      ...d.destinatario,
                      nome: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="doc-email-destinatario">
                  Email destinatario
                </Label>
                <Input
                  id="doc-email-destinatario"
                  type="email"
                  value={d.destinatario.email ?? ""}
                  onChange={(e) =>
                    cambia("destinatario", {
                      ...d.destinatario,
                      email: e.target.value,
                    })
                  }
                  placeholder="Email ordini o referente del fornitore"
                />
                {d.fornitoreId && (
                  <p className="mt-1 text-xs text-slate-500">
                    Ripresa dall’anagrafica di questo fornitore; puoi
                    correggerla per questo invio.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Commessa</Label>
                <CommessaCombobox
                  value={commessaId}
                  onChange={setCommessaId}
                  nessunaLabel={
                    d.commessa || "Nessuna commessa (acquisto generico)"
                  }
                  onSelection={(c) =>
                    setD((prev) => {
                      if (!c)
                        return {
                          ...prev,
                          commessa: null,
                          indirizzoCantiere: null,
                          ...(prev.destinazioneTipo === "cantiere"
                            ? {
                                destinazioneTipo: "altro" as const,
                                magazzinoId: null,
                                luogo: "",
                                referenteConsegna: "",
                                noteConsegna: "",
                              }
                            : {}),
                        };
                      return {
                        ...prev,
                        commessa: c.order_code,
                        indirizzoCantiere: c.work_address,
                        destinazioneTipo: "cantiere",
                        magazzinoId: null,
                        luogo: c.work_address || "",
                        referenteConsegna: "",
                        noteConsegna:
                          prev.destinazioneTipo === "ritiro"
                            ? ""
                            : prev.noteConsegna,
                      };
                    })
                  }
                />
                <p className="text-xs text-slate-500">
                  Cerca per codice, cliente o indirizzo. La scelta compila il
                  riferimento e l’indirizzo nella copia; non cambia il
                  collegamento dell’ordine originale.
                </p>
              </div>
              <DestinazioneDocumento
                documento={d}
                commessaId={commessaId}
                onChange={(patch) => setD((prev) => ({ ...prev, ...patch }))}
              />
              {!!d.referentiFornitore?.length && (
                <div className="sm:col-span-2">
                  <Label htmlFor="doc-referente-scelta">
                    Referenti registrati presso il fornitore
                  </Label>
                  <select
                    id="doc-referente-scelta"
                    className="h-10 w-full rounded-md border bg-white px-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const r = d.referentiFornitore?.[Number(e.target.value)];
                      if (r)
                        setD((prev) => ({
                          ...prev,
                          referente: r.nome,
                          referenteEmail: r.email,
                          referenteTelefono: r.telefono,
                        }));
                    }}
                  >
                    <option value="">
                      Scegli un referente da riportare nel documento
                    </option>
                    {d.referentiFornitore.map((r, i) => (
                      <option key={i} value={i}>
                        {[r.nome, r.ruolo, r.email].filter(Boolean).join(" · ")}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <Label htmlFor="doc-referente">Nome referente fornitore</Label>
                <Input
                  id="doc-referente"
                  value={d.referente ?? ""}
                  onChange={(e) => cambia("referente", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-referente-email">
                  Email referente fornitore
                </Label>
                <Input
                  id="doc-referente-email"
                  type="email"
                  value={d.referenteEmail ?? ""}
                  onChange={(e) => cambia("referenteEmail", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="doc-referente-telefono">
                  Telefono referente fornitore
                </Label>
                <Input
                  id="doc-referente-telefono"
                  value={d.referenteTelefono ?? ""}
                  onChange={(e) => cambia("referenteTelefono", e.target.value)}
                />
              </div>
              {(
                [
                  ["periodo", "Periodo"],
                  ["riferimento", "Riferimento preventivo / documento"],

                  ["pagamento", "Condizioni di pagamento"],
                ] as const
              )
                .filter(
                  ([key]) =>
                    key !== "periodo" ||
                    d.tipo === "trasporti" ||
                    d.tipo === "economia",
                )
                .map(([key, label]) => (
                  <div key={key}>
                    <Label htmlFor={`doc-${key}`}>{label}</Label>
                    <Input
                      id={`doc-${key}`}
                      value={d[key] ?? ""}
                      onChange={(e) => cambia(key, e.target.value)}
                    />
                  </div>
                ))}
              {(d.tipo === "servizi"
                ? [
                    ["inizioLavori", "Inizio lavori"],
                    ["fineLavori", "Fine lavori"],
                  ]
                : d.tipo === "richiesta"
                  ? [
                      ["consegna", "Materiale richiesto entro"],
                      ["scadenzaOfferta", "Rispondere entro"],
                    ]
                  : [["consegna", "Consegna prevista"]]
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`doc-${key}`}>{label}</Label>
                  <Input
                    id={`doc-${key}`}
                    type="date"
                    value={String(d[key as keyof DocumentoOperativo] ?? "")}
                    onChange={(e) => cambia(key as "consegna", e.target.value)}
                  />
                </div>
              ))}
            </div>
            {(d.tipo === "materiali" || d.tipo === "servizi") && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <Label htmlFor="doc-prezzi">
                  Prezzi dell’ordine da inviare
                </Label>
                <select
                  id="doc-prezzi"
                  value={d.prezziDaConfermare ? "attesa" : "concordati"}
                  onChange={(e) =>
                    cambia("prezziDaConfermare", e.target.value === "attesa")
                  }
                  className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"
                >
                  <option value="concordati">Con prezzi concordati</option>
                  <option value="attesa">
                    Senza prezzi — attendo la conferma del fornitore
                  </option>
                </select>
                {senzaPrezzi(d) && (
                  <p className="mt-2 text-xs text-amber-900">
                    Invii descrizioni, quantità e consegna senza prezzi, sconti,
                    IVA o totali, sia nell’email sia nel PDF. Quando arriva la
                    conferma del fornitore, allega l’originale all’ordine e
                    riporta gli importi concordati.
                  </p>
                )}
              </div>
            )}
            {(d.tipo === "servizi" || d.tipo === "materiali") && !senzaPrezzi(d) && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!d.inversioneContabile}
                  disabled={!modificaRighe && (documento.totali?.iva ?? 0) > 0}
                  onChange={(e) =>
                    setD((v) => ({
                      ...v,
                      inversioneContabile: e.target.checked,
                      totali: undefined,
                    }))
                  }
                />
                {!modificaRighe && (documento.totali?.iva ?? 0) > 0
                  ? "Per l’inversione contabile, aggiorna prima l’IVA nelle righe dell’ordine."
                  : "Inversione contabile concordata per questo ordine"}
              </label>
            )}
            {modificaRighe ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Voci del rapporto</p>
                <p className="text-xs text-slate-500">
                  Inserisci i prezzi di vendita concordati: i costi interni non
                  vengono usati. Le modifiche valgono per questo documento e non
                  cambiano i rapportini originali.
                </p>
                {d.righe.map((r, i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4"
                  >
                    {(d.tipo === "trasporti"
                      ? [
                          ["data", "Data viaggio"],
                          ["carico", "Carico"],
                          ["scarico", "Scarico"],
                          ["mezzo", "Mezzo"],
                          ["ddt", "DDT"],
                        ]
                      : [
                          ["gruppo", "Intervento / data"],
                          ["descrizione", "Descrizione"],
                          ["unita", "U.M."],
                        ]
                    )
                      .filter(
                        ([key]) =>
                          d.tipo !== "economia" ||
                          (key !== "iva" && key !== "sconto"),
                      )
                      .map(([key, label]) => (
                        <label className="text-xs" key={key}>
                          {label}
                          <Input
                            type={key === "data" ? "date" : "text"}
                            aria-label={`${label} voce ${i + 1}`}
                            value={String(r[key as keyof typeof r] ?? "")}
                            onChange={(e) =>
                              cambia(
                                "righe",
                                d.righe.map((v, n) =>
                                  n === i ? { ...v, [key]: e.target.value } : v,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    {(d.tipo === "trasporti"
                      ? [
                          ["oreUomo", "Ore uomo"],
                          ["oreMezzo", "Ore mezzo"],
                          ["prezzo", "Importo viaggio"],
                          ["iva", "IVA %"],
                        ]
                      : [
                          ["quantita", "Quantità"],
                          ["prezzo", "Prezzo unitario"],
                          ["sconto", "Sconto %"],
                          ["iva", "IVA %"],
                        ]
                    )
                      .filter(
                        ([key]) =>
                          d.tipo !== "economia" ||
                          (key !== "iva" && key !== "sconto"),
                      )
                      .map(([key, label]) => (
                        <label className="text-xs" key={key}>
                          {label}
                          <Input
                            type="number"
                            min="0"
                            max={
                              key === "iva" || key === "sconto"
                                ? 100
                                : undefined
                            }
                            step="0.01"
                            aria-label={`${label} voce ${i + 1}`}
                            value={r[key as keyof typeof r] ?? ""}
                            onChange={(e) =>
                              cambia(
                                "righe",
                                d.righe.map((v, n) =>
                                  n === i
                                    ? modificaNumeroRigaDocumento(v, key, e.target.value)
                                    : v,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        cambia(
                          "righe",
                          d.righe.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Rimuovi voce {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    cambia("righe", [
                      ...d.righe,
                      {
                        descrizione: "",
                        unita: d.tipo === "trasporti" ? "viaggio" : "h",
                        quantita: 1,
                        prezzo: null,
                        iva: null,
                      },
                    ])
                  }
                >
                  Aggiungi voce
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm">
                {d.righe.length} voci dal documento originale.{" "}
                {d.tipo === "richiesta"
                  ? "La richiesta riporta descrizioni e quantità, con le colonne economiche vuote da compilare dal fornitore."
                  : senzaPrezzi(d)
                    ? "La copia riporta descrizioni e quantità, con spazi vuoti per la conferma dei prezzi."
                    : "La copia include quantità, prezzi, sconti e IVA."}{" "}
                Per cambiare le voci, modifica prima il documento originale.
              </p>
            )}
            <div>
              <Label htmlFor="doc-note">
                {d.tipo === "richiesta"
                  ? "Note della richiesta per il destinatario"
                  : d.tipo === "economia" || d.tipo === "trasporti"
                    ? "Note del rapporto per il destinatario"
                    : "Note dell’ordine per il destinatario"}
              </Label>
              <Textarea
                id="doc-note"
                value={d.note ?? ""}
                onChange={(e) => cambia("note", e.target.value)}
                placeholder="Accordi con il fornitore, caratteristiche richieste, imballo o altre indicazioni…"
                rows={4}
              />
              <p className="mt-1 text-xs text-slate-500">
                Le note del documento originale sono già riportate qui. Queste
                note compaiono nella copia PDF e nell’email completa; le note
                interne restano escluse.
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!d.noteNelMessaggio}
                  onChange={(e) => cambia("noteNelMessaggio", e.target.checked)}
                />
                Riporta le note anche nel messaggio che accompagna il PDF
              </label>
            </div>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                Consegna, condizioni e note delle singole voci
              </summary>
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="doc-consegna-note">
                    Istruzioni per consegna o accesso al cantiere
                  </Label>
                  <Textarea
                    id="doc-consegna-note"
                    value={d.noteConsegna ?? ""}
                    onChange={(e) => cambia("noteConsegna", e.target.value)}
                    placeholder="Orari di scarico, preavviso, referente, mezzi necessari…"
                  />
                </div>
                <div>
                  <Label htmlFor="doc-condizioni">
                    Condizioni da riportare nella copia
                  </Label>
                  <Textarea
                    id="doc-condizioni"
                    rows={4}
                    value={condizioniDocumento({
                      ...d,
                      prezziDaConfermare: false,
                    })}
                    onChange={(e) => cambia("condizioni", e.target.value)}
                  />
                </div>
                {!modificaRighe &&
                  d.righe.map((r, i) => (
                    <div key={i}>
                      <Label htmlFor={`doc-nota-riga-${i}`}>
                        {i + 1}. {r.descrizione}
                      </Label>
                      <Textarea
                        id={`doc-nota-riga-${i}`}
                        value={r.nota ?? ""}
                        onChange={(e) =>
                          cambia(
                            "righe",
                            d.righe.map((v, n) =>
                              n === i ? { ...v, nota: e.target.value } : v,
                            ),
                          )
                        }
                        placeholder="Nota per questa voce: finitura, dimensioni, confezione, lavorazione…"
                      />
                    </div>
                  ))}
                <p className="text-xs text-slate-500">
                  Le modifiche qui valgono per la copia da inviare. Per
                  conservarle nell’ordine, modifica le note nella scheda
                  dell’ordine.
                </p>
              </div>
            </details>
            <div
              role="radiogroup"
              aria-label="Come inviare il documento"
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  ["testo", "Testo completo nell’email", Mail],
                  ["pdf", "PDF allegato con messaggio breve", Paperclip],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={modo === value}
                  onClick={() => setModo(value)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${modo === value ? "border-orange-400 bg-orange-50 font-semibold" : "border-slate-200"}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              PDF standard: logo in alto; dati dell’azienda nel piè di pagina,
              su massimo due righe.
            </p>
            {errore && (
              <p role="alert" className="text-sm text-red-700">
                {errore}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button variant="outline" onClick={anteprima}>
                <FileDown className="mr-2 h-4 w-4" />
                Anteprima PDF
              </Button>
              {url && (
                <Button asChild variant="outline">
                  <a href={url} download={nomeFileDocumento(d)}>
                    Scarica PDF
                  </a>
                </Button>
              )}
              <Button className="ml-auto" onClick={prepara}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Prepara email
              </Button>
            </div>
          </fieldset>
          {blob && (
            <div className="h-[60vh] min-h-80 overflow-hidden rounded-lg border">
              <Suspense
                fallback={<p className="p-4 text-sm">Caricamento anteprima…</p>}
              >
                <PdfPreview
                  renderBlobUrl={async () => URL.createObjectURL(blob)}
                  depsKey={chiave}
                  debounceMs={0}
                  downloadFileName={nomeFileDocumento(d)}
                  headerLabel="Anteprima PDF documento"
                  showDownloadOnMobile
                />
              </Suspense>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {email && (
        <EmailComposeDialog
          open={open}
          onOpenChange={(v) => {
            if (!v) {
              setEmail(null);
              onOpenChange(false);
            }
          }}
          context={email}
          orderId={commessaId}
          onSent={onSent}
        />
      )}
    </>
  );
}
