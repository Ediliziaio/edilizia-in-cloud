import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { apriUrlDocumentoPos } from "@/lib/sicurezza/apriPdfPos";
import { improntaSha256 } from "@/lib/sicurezza/posVerifica";
import { readAllPages } from "@/lib/personale/readAllPages";

export const LIMITE_COPIA_FIRMATA = 20 * 1024 * 1024;
const BUCKET = "pos-firmati";

export interface CopiaFirmataPos {
  id: string; emissione_id: string; revisione: number; file_path: string; file_name: string; sha256: string;
  dimensione: number; firmato_il: string | null; note: string | null; caricata_il: string;
}

const dataIt = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Controlli sul file scelto prima di caricarlo: un PDF vero, non vuoto, entro il limite. Restituisce il messaggio d'errore, o null se va bene. */
export async function controllaCopiaFirmata(file: Pick<File, "name" | "size" | "slice">): Promise<string | null> {
  if (!file.size) return "Il file è vuoto";
  if (file.size > LIMITE_COPIA_FIRMATA) return `Il file pesa ${kb(file.size)}: il limite è ${kb(LIMITE_COPIA_FIRMATA)}. Riduci la scansione e riprova`;
  const testa = new TextDecoder().decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
  return testa === "%PDF-" ? null : "Il file non è un PDF: salva o scansiona la copia firmata in PDF";
}

export function useCopieFirmatePos(companyId: string, posId: string, abilitato: boolean) {
  return useQuery({
    queryKey: ["pos", "copie-firmate", companyId, posId], enabled: abilitato && !!companyId && !!posId,
    queryFn: () => readAllPages<CopiaFirmataPos>((from, to) => supabase.from("pos_copie_firmate" as never)
      .select("id,emissione_id,revisione,file_path,file_name,sha256,dimensione,firmato_il,note,caricata_il").eq("company_id", companyId).eq("pos_id", posId)
      .order("caricata_il", { ascending: false }).order("id").range(from, to) as never),
  });
}

interface Props {
  companyId: string;
  posId: string;
  revisione: number;
  /** L'emissione completata della revisione corrente: la copia firmata si riferisce a quel PDF. */
  emissioneId: string | null;
  /** Chi può scrivere carica; chi può solo leggere vede l'elenco e scarica. */
  puoCaricare: boolean;
  /** Con una data di firma dichiarata, la consegna può precompilare «Firmato dal datore di lavoro il». */
  onCaricata?: (firmatoIl: string | null) => void;
}

/**
 * La copia firmata del POS resta nell'app: si stampa il PDF approvato, lo firmano il datore di lavoro, il RLS e il CSE (a mano
 * o con un servizio esterno) e qui si carica la scansione. Non si modifica e non si cancella (lo garantisce il database): un
 * file sbagliato si sostituisce caricandone un altro, e restano entrambi con le date.
 */
export function CopiaFirmataSezione({ companyId, posId, revisione, emissioneId, puoCaricare, onCaricata }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const elenco = useCopieFirmatePos(companyId, posId, true);
  const campoFile = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [firmatoIl, setFirmatoIl] = useState("");
  const [note, setNote] = useState("");
  const [apertura, setApertura] = useState("");

  const carica = useMutation({
    mutationFn: async () => {
      if (!file || !user?.id || !emissioneId) throw new Error("Scegli prima il file della copia firmata");
      const errore = await controllaCopiaFirmata(file);
      if (errore) throw new Error(errore);
      const sha256 = await improntaSha256(await file.arrayBuffer());
      const percorso = `${companyId}/${posId}/${crypto.randomUUID()}.pdf`;
      const su = await supabase.storage.from(BUCKET).upload(percorso, file, { contentType: "application/pdf", upsert: false });
      if (su.error) throw new Error("Caricamento del file non riuscito: controlla la connessione e riprova");
      const { error } = await supabase.from("pos_copie_firmate" as never).insert({
        company_id: companyId, pos_id: posId, emissione_id: emissioneId, revisione, file_path: percorso, file_name: file.name.slice(0, 200),
        sha256, dimensione: file.size, firmato_il: firmatoIl || null, note: note.trim() || null, caricata_da: user.id,
      } as never);
      if (error) throw new Error(error.message?.includes("Il file") || error.message?.includes("copia firmata") ? error.message : "Copia firmata non registrata: riprova");
      return firmatoIl || null;
    },
    onSuccess: (data) => {
      toast.success("Copia firmata conservata");
      setFile(null); setNote(""); setFirmatoIl(""); if (campoFile.current) campoFile.current.value = "";
      onCaricata?.(data);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Copia firmata non registrata"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pos", "copie-firmate", companyId, posId] }),
  });

  const scarica = async (c: CopiaFirmataPos) => {
    setApertura(c.id);
    try {
      await apriUrlDocumentoPos(async () => {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(c.file_path, 300);
        if (error || !data?.signedUrl) throw new Error("Non riesco ad aprire la copia firmata");
        return data.signedUrl;
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Non riesco ad aprire la copia firmata"); }
    finally { setApertura(""); }
  };

  const copie = elenco.data ?? [];
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label="Copia firmata">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FileCheck2 className="h-4 w-4" aria-hidden="true" />Copia firmata</h3>
        <p className="text-xs text-muted-foreground">Stampa il PDF approvato, fallo firmare (datore di lavoro, RLS/RLST, CSE) e carica qui la scansione: resta nell’app e non si può modificare.</p>
      </div>

      {elenco.isError
        ? <p role="alert" className="text-sm text-destructive">Le copie firmate non sono disponibili. <button type="button" className="underline" onClick={() => void elenco.refetch()}>Riprova</button></p>
        : elenco.isLoading ? <p className="text-sm text-muted-foreground">Caricamento…</p>
        : copie.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna copia firmata caricata.</p>
        : <ul className="divide-y rounded-md border">{copie.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.file_name}</p>
                <p className="text-xs text-muted-foreground">Revisione {c.revisione}{c.firmato_il ? ` · firmata il ${dataIt(c.firmato_il)}` : ""} · caricata il {dataIt(c.caricata_il)} · {kb(c.dimensione)}</p>
                {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
              </div>
              <Button type="button" size="sm" variant="outline" className="tap-compact" disabled={!!apertura} onClick={() => void scarica(c)}>
                {apertura === c.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}Scarica
              </Button>
            </li>))}</ul>}

      {puoCaricare && (
        <div className="space-y-2 rounded-md bg-slate-50 p-2.5">
          {!emissioneId && <p className="text-xs text-amber-800">Il PDF approvato di questa revisione non è ancora pronto: appena lo è, qui si carica la copia firmata.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="copia-firmata-file" className="text-xs font-medium text-slate-700">File PDF firmato</Label>
              <Input id="copia-firmata-file" ref={campoFile} type="file" accept="application/pdf" disabled={!emissioneId || carica.isPending} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="copia-firmata-data" className="text-xs font-medium text-slate-700">Firmata il (facoltativo)</Label>
              <Input id="copia-firmata-data" type="date" className="h-9" value={firmatoIl} disabled={!emissioneId || carica.isPending} onChange={(e) => setFirmatoIl(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="copia-firmata-note" className="text-xs font-medium text-slate-700">Nota (facoltativa)</Label>
            <Textarea id="copia-firmata-note" rows={2} value={note} maxLength={1000} disabled={!emissioneId || carica.isPending} placeholder="Es. firmata anche dal CSE, scansione a colori" onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="button" size="sm" className="tap-compact" disabled={!file || !emissioneId || carica.isPending} onClick={() => carica.mutate()}>
            {carica.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="mr-1 h-4 w-4" aria-hidden="true" />}Carica la copia firmata
          </Button>
        </div>
      )}
    </section>
  );
}
