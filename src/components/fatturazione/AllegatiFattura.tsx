import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Paperclip, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateShort } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Gli allegati di una fattura (30/10/2026), come in Fatture in Cloud: la contabile
 * del bonifico al fornitore, il DDT, il contratto, le foto. Si ritrovano dalla
 * fattura. Sui documenti mandati allo SDI un allegato può partire dentro l'XML.
 * Tabella fattura_allegati, file nel contenitore privato fatture-allegati.
 */

export const TIPI_ALLEGATO = [
  { value: "contabile_pagamento", label: "Contabile del pagamento" },
  { value: "ddt", label: "DDT / bolla" },
  { value: "contratto", label: "Contratto" },
  { value: "ordine", label: "Ordine" },
  { value: "preventivo", label: "Preventivo" },
  { value: "foto", label: "Foto" },
  { value: "altro", label: "Altro" },
] as const;

export type MadreAllegato =
  | { invoiceId: string }
  | { documentoFiscaleId: string }
  | { fatturaRicevutaId: string };

interface Allegato {
  id: string;
  tipo: string;
  descrizione: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  includi_nell_invio: boolean;
  created_at: string;
}

const MAX_BYTES = 20 * 1024 * 1024;
/**
 * Lo SDI rifiuta un file oltre i 5 MB, e dentro l'XML gli allegati vanno in base64
 * (un terzo in più): 3,5 MB di file lasciano posto alla fattura.
 */
export const MAX_BYTES_INVIO_SDI = 3.5 * 1024 * 1024;

const colonnaMadre = (m: MadreAllegato): ["invoice_id" | "documento_fiscale_id" | "fattura_ricevuta_id", string] =>
  "invoiceId" in m ? ["invoice_id", m.invoiceId] : "documentoFiscaleId" in m ? ["documento_fiscale_id", m.documentoFiscaleId] : ["fattura_ricevuta_id", m.fatturaRicevutaId];

export const allegatiQueryKey = (m: MadreAllegato) => ["fattura-allegati", ...colonnaMadre(m)] as const;

/** Nome di file sicuro per il percorso: lettere, cifre, punto, trattino. */
export function nomeFileSicuro(nome: string): string {
  const pulito = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  return (pulito.replace(/^[._]+/, "") || "file").slice(-120);
}

export function dimensioneLeggibile(bytes: number | null | undefined): string {
  const b = Number(bytes) || 0;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(b / 1024)).toLocaleString("it-IT")} KB`;
}

export function AllegatiFattura({
  companyId,
  madre,
  /** Documento SDI non ancora inviato: si può scegliere cosa parte con la fattura. */
  invioSdi = false,
  sola_lettura = false,
  titolo = "Allegati",
}: {
  companyId: string | null | undefined;
  madre: MadreAllegato;
  invioSdi?: boolean;
  sola_lettura?: boolean;
  titolo?: string;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [tipoNuovo, setTipoNuovo] = useState<string>("fatturaRicevutaId" in madre ? "contabile_pagamento" : "altro");
  const [colonna, idMadre] = colonnaMadre(madre);
  const db = supabase as any;

  const { data: allegati = [], isLoading } = useQuery({
    queryKey: allegatiQueryKey(madre),
    enabled: !!companyId && !!idMadre,
    queryFn: async () => {
      const { data, error } = await db.from("fattura_allegati")
        .select("id, tipo, descrizione, file_name, mime_type, size_bytes, storage_path, includi_nell_invio, created_at")
        .eq("company_id", companyId).eq(colonna, idMadre).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Allegato[];
    },
  });
  const aggiorna = () => queryClient.invalidateQueries({ queryKey: allegatiQueryKey(madre) });

  const carica = useMutation({
    mutationFn: async (files: File[]) => {
      let fatti = 0;
      for (const file of files) {
        if (file.size > MAX_BYTES) throw new Error(`«${file.name}» supera i 20 MB.`);
        const percorso = `${companyId}/${colonna.replace("_id", "")}/${idMadre}/${crypto.randomUUID()}-${nomeFileSicuro(file.name)}`;
        const { error: e1 } = await supabase.storage.from("fatture-allegati").upload(percorso, file, { contentType: file.type || undefined, upsert: false });
        if (e1) throw new Error(/mime|type/i.test(e1.message) ? `«${file.name}»: formato non accettato. Vanno bene PDF, immagini, Word, Excel, XML, ZIP.` : e1.message);
        const { error: e2 } = await db.from("fattura_allegati").insert({
          company_id: companyId, [colonna]: idMadre, tipo: tipoNuovo,
          file_name: file.name.slice(0, 200), mime_type: file.type || null, size_bytes: file.size, storage_path: percorso,
        });
        if (e2) {
          // Senza la riga il file resterebbe orfano nel contenitore.
          await supabase.storage.from("fatture-allegati").remove([percorso]);
          throw new Error(e2.code === "42501" ? "Non hai il permesso di allegare file alle fatture." : e2.message);
        }
        fatti += 1;
      }
      return fatti;
    },
    onSuccess: (n) => { aggiorna(); toast.success(n === 1 ? "File allegato" : `${n} file allegati`); },
    onError: (e: Error) => { aggiorna(); toast.error("Allegato non caricato", { description: e.message }); },
  });

  const togli = useMutation({
    mutationFn: async (a: Allegato) => {
      const { error } = await db.from("fattura_allegati").delete().eq("id", a.id).eq("company_id", companyId);
      if (error) throw error;
      await supabase.storage.from("fatture-allegati").remove([a.storage_path]);
    },
    onSuccess: () => { aggiorna(); toast.success("Allegato tolto"); },
    onError: (e: Error) => toast.error("Non tolto", { description: e.message }),
  });

  const cambia = useMutation({
    mutationFn: async ({ a, campi }: { a: Allegato; campi: Partial<Pick<Allegato, "tipo" | "includi_nell_invio">> }) => {
      const { error } = await db.from("fattura_allegati").update(campi).eq("id", a.id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError: (e: Error) => toast.error("Non salvato", { description: e.message }),
  });

  const apri = async (a: Allegato) => {
    const { data, error } = await supabase.storage.from("fatture-allegati").createSignedUrl(a.storage_path, 120, { download: a.mime_type?.startsWith("image/") || a.mime_type === "application/pdf" ? false : a.file_name });
    if (error || !data?.signedUrl) { toast.error("Impossibile aprire il file", { description: error?.message }); return; }
    if (!window.open(data.signedUrl, "_blank", "noopener")) toast.error("Il browser ha bloccato la nuova scheda: consenti i popup per questo sito.");
  };

  const pesoInvio = allegati.filter((a) => a.includi_nell_invio).reduce((s, a) => s + (Number(a.size_bytes) || 0), 0);
  const scegliFile = (lista: FileList | null) => {
    const files = Array.from(lista ?? []);
    if (files.length) carica.mutate(files);
    if (input.current) input.current.value = "";
  };

  return (
    <section
      className="space-y-2"
      onDragOver={(e) => { if (!sola_lettura) e.preventDefault(); }}
      onDrop={(e) => { if (sola_lettura) return; e.preventDefault(); scegliFile(e.dataTransfer.files); }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Paperclip className="h-4 w-4" /> {titolo}{allegati.length ? ` (${allegati.length})` : ""}</h3>
        {!sola_lettura && (
          <div className="flex items-center gap-1.5">
            <Select value={tipoNuovo} onValueChange={setTipoNuovo}>
              <SelectTrigger className="h-8 w-48 text-xs" aria-label="Tipo del file da allegare"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPI_ALLEGATO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-8" disabled={carica.isPending || !companyId} onClick={() => input.current?.click()}>
              {carica.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
              Allega
            </Button>
            <input ref={input} type="file" multiple className="hidden" aria-label="File da allegare" onChange={(e) => scegliFile(e.target.files)} />
          </div>
        )}
      </div>

      {isLoading ? null : allegati.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
          {sola_lettura ? "Nessun allegato." : "Nessun allegato: trascina qui un file o usa «Allega»."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {allegati.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void apri(a)} title="Apri il file">
                <span className="block truncate hover:underline underline-offset-2">{a.file_name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {TIPI_ALLEGATO.find((t) => t.value === a.tipo)?.label ?? "Altro"} · {dimensioneLeggibile(a.size_bytes)} · {formatDateShort(a.created_at)}
                </span>
              </button>
              {invioSdi && !sola_lettura ? (
                <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground" title="Il file parte dentro l'XML della fattura, insieme a lei">
                  <Checkbox
                    checked={a.includi_nell_invio}
                    disabled={cambia.isPending || (!a.includi_nell_invio && pesoInvio + (Number(a.size_bytes) || 0) > MAX_BYTES_INVIO_SDI)}
                    onCheckedChange={(v) => cambia.mutate({ a, campi: { includi_nell_invio: v === true } })}
                    aria-label={`Manda «${a.file_name}» allo SDI con la fattura`}
                  />
                  <Send className="h-3 w-3" /> SDI
                </label>
              ) : a.includi_nell_invio ? <span className="shrink-0 text-[11px] text-muted-foreground">Con la fattura allo SDI</span> : null}
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => void apri(a)} aria-label={`Scarica ${a.file_name}`}>
                <Download className="h-4 w-4" />
              </Button>
              {!sola_lettura && (
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" disabled={togli.isPending}
                  onClick={() => { if (window.confirm(`Togliere «${a.file_name}» dagli allegati?`)) togli.mutate(a); }} aria-label={`Togli ${a.file_name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {invioSdi && pesoInvio > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Partono con la fattura {dimensioneLeggibile(pesoInvio)} di allegati, al massimo 3,5 MB: lo SDI accetta file fino a 5 MB e gli allegati, dentro l'XML, crescono di un terzo.
        </p>
      ) : null}
    </section>
  );
}
