import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileImage, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useSurveyDetail } from "@/hooks/useSurveyDetail";
import { listMySurveys, listSurveysByOrder } from "@/lib/api/surveys";
import { ambientiDaAppunti, ambientiDaAreeSalvate, type AmbienteGuida } from "@/lib/planimetrie/avvioGuidato";
import { MIME_DOCUMENTO_PIANTA, mimeDocumento } from "@/lib/planimetrie/documentoImmagine";
import type { SurveyMediaRow } from "@/types/surveys";
import { RiepilogoAmbienti } from "./ChatAvvioPlanimetria";

export type DatiSopralluogoPlanimetria = { id: string; orderId: string | null; titolo: string; appunti: string; ambienti: AmbienteGuida[] };

const mimeSchizzo = (media: SurveyMediaRow) => mimeDocumento({ type: media.mime_type ?? "", name: media.filename ?? undefined });

export function SopralluogoSalvatoPlanimetria({ companyId, orderId, iniziale, onApri, onAppunti }: {
  companyId: string;
  orderId?: string | null;
  iniziale?: string;
  onApri: (dati: DatiSopralluogoPlanimetria, schizzo?: File) => Promise<void>;
  onAppunti: (dati: DatiSopralluogoPlanimetria) => void;
}) {
  const { user } = useAuth();
  const { canViewSopralluoghi } = usePermissions();
  const [id, setId] = useState(iniziale ?? "");
  const [mediaId, setMediaId] = useState("");
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const lettura = useRef<AbortController | null>(null);
  useEffect(() => () => lettura.current?.abort(), []);

  const elenco = useQuery({
    queryKey: ["planimetrie", "sopralluoghi", companyId, user?.id, orderId ?? null],
    enabled: !!user?.id && !!companyId && canViewSopralluoghi,
    queryFn: () => orderId ? listSurveysByOrder(orderId, companyId) : listMySurveys({ companyId }),
  });
  const dettaglio = useSurveyDetail(id, orderId ?? undefined);
  const d = dettaglio.data;
  const disponibili = (elenco.data ?? []).filter((s) => s.status !== "cancelled");
  const attivo = d && d.survey.status !== "cancelled" && !d.survey.deleted_at ? d : undefined;
  const note = attivo ? [attivo.survey.notes, attivo.survey.general_audio_transcription,
    ...attivo.areas.flatMap((area) => [area.notes, area.audio_transcription].filter(Boolean).map((v) => `${area.name} · ${v}`))].filter(Boolean).join("\n") : "";
  const definizioneAree = attivo?.template.schema.area_definition;
  const ambientiRegistrati = attivo && definizioneAree ? ambientiDaAreeSalvate(attivo.areas, definizioneAree.fields ?? [], definizioneAree.label) : [];
  const presenti = new Set(ambientiRegistrati.map((a) => a.nome.toLocaleLowerCase("it-IT")));
  const ambienti = [...ambientiRegistrati, ...ambientiDaAppunti(note).filter((a) => !presenti.has(a.nome.toLocaleLowerCase("it-IT")))];
  const media = (attivo?.media ?? [])
    .filter((m) => ["sketch", "photo", "annotated_photo", "document"].includes(m.type) && m.url && MIME_DOCUMENTO_PIANTA.includes(mimeSchizzo(m)))
    .sort((a, b) => Number(b.type === "sketch") - Number(a.type === "sketch"));
  const scelto = media.find((m) => m.id === mediaId);
  const dati: DatiSopralluogoPlanimetria | undefined = attivo ? {
    id: attivo.survey.id, orderId: attivo.survey.order_id,
    titolo: `Sopralluogo ${attivo.survey.code}${attivo.survey.address ? ` · ${attivo.survey.address}` : ""}`,
    appunti: note, ambienti,
  } : undefined;

  const apri = async (conSchizzo: boolean) => {
    if (!dati || lettura.current || (conSchizzo ? !scelto : !ambienti.length)) return;
    const controller = new AbortController();
    lettura.current = controller;
    setOccupato(true);
    setErrore("");
    try {
      let file: File | undefined;
      if (conSchizzo && scelto) {
        const risposta = await fetch(scelto.url, { signal: controller.signal });
        if (!risposta.ok) throw new Error("Allegato non disponibile. Riapri la scheda e riprova.");
        const blob = await risposta.blob();
        file = new File([blob], scelto.filename || "Schizzo del sopralluogo", { type: mimeSchizzo(scelto) });
      }
      if (!controller.signal.aborted) await onApri(dati, file);
    } catch (e) {
      if (!controller.signal.aborted) setErrore(e instanceof Error ? e.message : "Apertura del sopralluogo non riuscita.");
    } finally {
      lettura.current = null;
      if (!controller.signal.aborted) setOccupato(false);
    }
  };

  if (!canViewSopralluoghi) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Il tuo ruolo può usare il nuovo rilievo. La consultazione delle schede salvate richiede l’accesso a Sopralluoghi.</p>;
  return <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><ClipboardList className="h-4 w-4" aria-hidden="true" /></span>
        <h2 className="font-semibold">Riprendi un sopralluogo</h2>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sopralluogo-planimetria">Scheda del sopralluogo</Label>
        <UniformSelect id="sopralluogo-planimetria" className="h-10 w-full rounded-md border bg-card px-2.5 text-sm" value={id} disabled={elenco.isLoading || occupato}
          onChange={(e) => { setId(e.target.value); setMediaId(""); setErrore(""); }}>
          <option value="">{elenco.isLoading ? "Carico i sopralluoghi…" : "Scegli una scheda"}</option>
          {id && !disponibili.some((s) => s.id === id) && <option value={id}>{dati?.titolo ?? "Sopralluogo selezionato"}</option>}
          {disponibili.map((s) => <option key={s.id} value={s.id}>{[s.code, s.address, s.city].filter(Boolean).join(" · ")}</option>)}
        </UniformSelect>
      </div>
      {elenco.isError && <p role="alert" className="text-sm text-destructive">Impossibile caricare l’elenco dei sopralluoghi. <Button type="button" size="sm" variant="link" onClick={() => void elenco.refetch()}>Riprova</Button></p>}
      {!elenco.isLoading && !elenco.isError && !disponibili.length && !id && <p className="text-sm text-muted-foreground">Qui compaiono le schede registrate {orderId ? "per questa commessa" : "nella tua azienda"}.</p>}
      {id && dettaglio.isLoading && <p role="status" className="text-sm text-muted-foreground">Carico misure e allegati…</p>}
      {id && (dettaglio.isError || (d && !attivo)) && <p role="alert" className="text-sm text-destructive">Sopralluogo non disponibile.</p>}
      {dati && <>
        {note && <details className="rounded-lg border bg-muted/20 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Appunti registrati</summary>
          <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{note}</p>
        </details>}
        {media.length > 0 && <div className="space-y-1.5">
          <Label htmlFor="schizzo-archiviato">Allegato da usare come schizzo</Label>
          <UniformSelect id="schizzo-archiviato" className="h-10 w-full rounded-md border bg-card px-2.5 text-sm" value={mediaId} disabled={occupato} onChange={(e) => setMediaId(e.target.value)}>
            <option value="">Scegli la foto o il PDF della pianta</option>
            {media.map((m, i) => <option key={m.id} value={m.id}>{m.checklist_label || m.filename || `Allegato ${i + 1}`}</option>)}
          </UniformSelect>
        </div>}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          {ambienti.length > 0 && <Button type="button" disabled={occupato} onClick={() => void apri(false)}>Apri bozza del sopralluogo</Button>}
          {scelto && <Button type="button" variant={ambienti.length ? "outline" : "default"} disabled={occupato} onClick={() => void apri(true)}><FileImage className="mr-2 h-4 w-4" />Prepara lo schizzo</Button>}
          {note && <Button type="button" variant="outline" disabled={occupato} onClick={() => onAppunti(dati)}>Copia appunti nel rilievo</Button>}
          {occupato && <Loader2 className="m-2 h-4 w-4 motion-safe:animate-spin" aria-label="Preparazione in corso" />}
          {!ambienti.length && !scelto && !note && <p className="text-sm text-muted-foreground">Per aprire una bozza servono misure delle stanze o una tavola del sopralluogo.</p>}
        </div>
      </>}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    </section>
    <RiepilogoAmbienti ambienti={ambienti} vuoto={dati ? "In questa scheda mancano misure utilizzabili per disegnare le stanze." : "Scegli un sopralluogo per vedere le misure registrate."} />
  </div>;
}
