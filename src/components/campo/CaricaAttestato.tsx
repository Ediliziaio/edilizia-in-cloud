/**
 * Carica un attestato dal telefono (24/11/2026, richiesta del founder): il corso di sicurezza, la visita
 * medica, la patente. Foto o PDF, la scadenza se c'è. Va nella stessa scheda documenti che usa l'ufficio
 * (hr_documenti), che riceve un avviso «da controllare». Il file lo carica la pagina Documenti (`carica`):
 * è lei la sola porta del lavoratore sulla propria cartella HR.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, FileUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PILLOLA, RIQUADRO } from "@/lib/campo/stileCampo";
import { senzaRete } from "@/lib/campo/timbra";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { ACCEPT_DOCUMENTO_PERSONALE, preparaFilePersonale } from "@/lib/documenti/filePersonale";

const TIPI = [
  { value: "corso_sicurezza", label: "Corso sicurezza" },
  { value: "visita_medica", label: "Visita medica" },
  { value: "patente", label: "Patente" },
  { value: "idoneita", label: "Idoneità" },
  { value: "documento_identita", label: "Documento d'identità" },
  { value: "altro", label: "Altro" },
] as const;

type Tipo = (typeof TIPI)[number]["value"];
const PILL = "min-h-11 rounded-full border px-4 text-sm font-semibold";

export interface AttestatoDaCaricare { file: File; categoria: string; titolo: string; scadenza: string | null }

export function CaricaAttestato({ carica: caricaFile }: { carica: (a: AttestatoDaCaricare) => Promise<void> }) {
  const t = useT();
  const qc = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>("corso_sicurezza");
  const [titolo, setTitolo] = useState("");
  const [scadenza, setScadenza] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const carica = useMutation({
    // Esegue il controllo senza rete anche quando React Query è offline: nessun invio accodato in silenzio.
    networkMode: "always",
    mutationFn: async () => {
      if (senzaRete()) throw new Error(t("Sei senza rete: riprova appena torna il campo."));
      if (!file) throw new Error(t("Scatta la foto o scegli il file"));
      await caricaFile({ file: preparaFilePersonale(file), categoria: tipo, titolo: titolo.trim() || t(TIPI.find(x => x.value === tipo)!.label), scadenza: scadenza || null });
    },
    onSuccess: () => {
      toast.success(t("Caricato: l'ufficio lo controlla"));
      setAperto(false); setFile(null); setTitolo(""); setScadenza("");
      void qc.invalidateQueries({ queryKey: ["campo-documenti-hr"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a caricare. Riprova.")),
  });

  if (!aperto) {
    return (
      <button type="button" onClick={() => setAperto(true)} className={cn(PILLOLA, "w-full")}>
        <Plus className="size-4" aria-hidden="true" />{t("Carica un attestato")}
      </button>
    );
  }

  return (
    <section className={cn(RIQUADRO, "space-y-3")} aria-label={t("Carica un attestato")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold">{t("Carica un attestato")}</h2>
        <button type="button" onClick={() => setAperto(false)} aria-label={t("Chiudi")} className="flex size-11 items-center justify-center rounded-full active:bg-muted">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Che documento è")}>
        {TIPI.map(x => (
          <button key={x.value} type="button" role="radio" aria-checked={tipo === x.value} onClick={() => setTipo(x.value)}
            className={cn(PILL, tipo === x.value ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>{t(x.label)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={cn(PILLOLA, "relative cursor-pointer")}>
          <input type="file" accept="image/*" capture="environment" aria-label={t("Fotografa il documento")} className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
          <Camera className="size-4" aria-hidden="true" />{t("Foto")}
        </label>
        <label className={cn(PILLOLA, "relative cursor-pointer")}>
          <input type="file" accept={ACCEPT_DOCUMENTO_PERSONALE} aria-label={t("Scegli il file")} className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ""; }} />
          <FileUp className="size-4" aria-hidden="true" />{t("File o PDF")}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("PDF o foto, massimo 15 MB.")}</p>
      {file && <p className="truncate text-xs text-muted-foreground">{file.name}</p>}
      <input value={titolo} onChange={(e) => setTitolo(e.target.value.slice(0, 120))} aria-label={t("Nome (facoltativo)")}
        placeholder={t("Nome (facoltativo), es. Corso lavori in quota")} className="min-h-11 w-full rounded-xl border bg-background px-3 text-sm" />
      <label className="block text-xs font-semibold text-muted-foreground">
        {t("Scade il (se c'è)")}
        <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm text-foreground" />
      </label>
      <button type="button" onClick={() => carica.mutate()} disabled={!file || carica.isPending}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50">
        {carica.isPending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}{t("Invia all'ufficio")}
      </button>
    </section>
  );
}
