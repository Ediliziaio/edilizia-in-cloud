// Commessa generale dai documenti — il riquadro «Crea dai documenti» nel popup «Nuova commessa
// generale» (lotto 1 di docs/piano-commessa-generale-da-documenti.md, §3.1). Si scelgono più file,
// ognuno col suo tipo di documento (proposto dal nome); il browser li prepara senza AI (pagine,
// testo nativo, computi), li carica e registra la lettura; poi si apre il popup di lettura con la
// stima del costo, e si parte solo con «Leggi».
import { useRef, useState } from "react";
import { FileText, Loader2, Sparkles, Upload, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLettureInSospeso } from "@/hooks/useLetturaGenerale";
import { catalogoPer, type TipoDaDocumenti } from "@/lib/orders/generali/daDocumenti/catalogo";
import { documentoDalNome } from "@/lib/orders/generali/daDocumenti/pagine";
import { fileAccettabile, preparaFile, registraLettura, type FileDaLeggere } from "@/lib/orders/generali/daDocumenti/prepara";
import { LetturaDocumentiDialog } from "./LetturaDocumentiDialog";

const STATO_LEGGIBILE: Record<string, string> = {
  preparata: "da avviare", in_lettura: "in lettura", estrazione: "in estrazione", in_pausa: "in pausa", pronta: "pronta", errore: "ferma", usata: "commessa creata",
};

export function CreaDaDocumenti({ tipo, prova, onCreata }: { tipo: TipoDaDocumenti; prova?: boolean; onCreata?: () => void }) {
  const { effectiveCompany } = useAuth();
  const scegli = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileDaLeggere[]>([]);
  const [prepara, setPrepara] = useState<{ testo: string; quota: number } | null>(null);
  const [aperta, setAperta] = useState<string | null>(null);
  const [provaAperta, setProvaAperta] = useState(false);
  const sospese = useLettureInSospeso();
  const documenti = catalogoPer(tipo).documenti;

  const aggiungi = (lista: FileList | null) => {
    if (!lista) return;
    const nuovi: FileDaLeggere[] = [];
    for (const f of Array.from(lista)) {
      const motivo = fileAccettabile(f);
      if (motivo) { toast.error(motivo); continue; }
      const proposto = documentoDalNome(f.name);
      nuovi.push({ file: f, documento: documenti.some((d) => d.id === proposto) ? proposto : documenti[0].id });
    }
    setFiles((x) => [...x, ...nuovi].slice(0, 30));
  };

  const parti = async () => {
    if (!effectiveCompany?.id || files.length === 0) return;
    setPrepara({ testo: "Preparo i file…", quota: 0 });
    try {
      const p = await preparaFile(supabase, effectiveCompany.id, files, (testo, quota) => setPrepara({ testo, quota }));
      const id = await registraLettura(supabase, effectiveCompany.id, tipo, tipo === "appalto_pubblico" ? "singolo" : null, null, p);
      setFiles([]);
      setAperta(id);
      void sospese.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPrepara(null);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <span className="font-medium">Crea dai documenti</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Contratto, computo, verbali, polizze: l'AI li legge tutti, pagina per pagina, e tu confermi ogni dato prima che si scriva. Prima di leggere vedi il costo.
          </span>
        </span>
        <Button type="button" size="sm" variant="outline" onClick={() => scegli.current?.click()} disabled={!!prepara}><Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />Scegli i file</Button>
        <input ref={scegli} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.xpwe,.xlsx,application/pdf,image/*"
          onChange={(e) => { aggiungi(e.target.files); e.target.value = ""; }} />
      </div>

      {files.length > 0 && (
        <ul className="divide-y rounded-md border bg-white">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex flex-wrap items-center gap-2 px-2 py-1.5">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs">{f.file.name}</span>
              <select className="rounded border bg-background px-1.5 py-0.5 text-xs" value={f.documento} aria-label={`Tipo di ${f.file.name}`}
                onChange={(e) => setFiles((x) => x.map((y, j) => (j === i ? { ...y, documento: e.target.value } : y)))}>
                {documenti.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Togli ${f.file.name}`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}><XIcon className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}

      {prepara ? (
        <div className="space-y-1" aria-live="polite">
          <p className="flex items-center gap-1.5 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />{prepara.testo}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(prepara.quota * 100)}%` }} /></div>
          <p className="text-[11px] text-muted-foreground">Divido le pagine e leggo il testo che c'è già: questa parte non usa l'AI.</p>
        </div>
      ) : files.length > 0 ? (
        <div className="flex justify-end"><Button type="button" size="sm" onClick={parti}><Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden />Prepara e mostra il costo</Button></div>
      ) : null}

      {(sospese.data ?? []).length > 0 && (
        <div className="text-xs">
          <p className="text-muted-foreground">Letture in corso:</p>
          <ul className="mt-0.5 space-y-0.5">
            {sospese.data!.map((l) => (
              <li key={l.id}>
                <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setAperta(l.id)}>
                  {l.file.map((f) => f.nome).slice(0, 2).join(", ")}{l.file.length > 2 ? ` e altri ${l.file.length - 2}` : ""} — {STATO_LEGGIBILE[l.stato] ?? l.stato}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {prova && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setProvaAperta(true)}>Prova la lettura con documenti inventati</button>}

      <LetturaDocumentiDialog open={!!aperta} onOpenChange={(o) => { if (!o) { setAperta(null); void sospese.refetch(); } }} letturaId={aperta} onCreata={onCreata} />
      {prova && <LetturaDocumentiDialog open={provaAperta} onOpenChange={setProvaAperta} prova />}
    </div>
  );
}
