/**
 * Caricamento del computo della commessa: PDF di PriMus, XPWE, Excel.
 * Lo usano la scheda del computo e il popup «Genera dal computo» dei
 * materiali (31/10/2026: il computo non ha più una scheda sua fra i materiali).
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCaricaComputo, useModificaComputo, type ComputoCommessa } from "@/hooks/useComputoCommessa";

export function CaricaComputo({ orderId, companyId, sostituisce, onFatto }: { orderId: string; companyId: string; sostituisce?: ComputoCommessa | null; onFatto?: () => void }) {
  const { user } = useAuth();
  const carica = useCaricaComputo(orderId, companyId, user?.id);
  const modifica = useModificaComputo(orderId, companyId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [titolo, setTitolo] = useState("");
  const avvia = async () => {
    if (!file) return;
    try {
      if (sostituisce && sostituisce.stato !== "bozza") await modifica.mutateAsync({ id: sostituisce.id, modifica: { stato: "archiviato" } });
      await carica.mutateAsync({ file, titolo });
      setFile(null); setTitolo(""); onFatto?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Caricamento non riuscito.");
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Carica il computo metrico così com'è: il <strong>PDF stampato da PriMus</strong> e l'<strong>XPWE</strong> si leggono voce per voce, con le
        righe di misura, e i totali vengono confrontati con quelli del documento. Va bene anche l'Excel. Il file <strong>.dcf</strong> no:
        in PriMus scegli File › Esporta › formato XPWE.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="computo-titolo">Nome del computo</Label>
          <Input id="computo-titolo" value={titolo} onChange={e => setTitolo(e.target.value)} placeholder={file?.name.replace(/\.[^.]+$/, "") || "Es. Computo di progetto esecutivo"} />
        </div>
        <input ref={input} type="file" className="hidden" accept=".pdf,.xpwe,.xml,.xlsx,.xls,.dcf"
          onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={carica.isPending}>
          <Upload className="mr-2 h-4 w-4" />{file ? "Cambia file" : "Scegli il file"}
        </Button>
        <Button type="button" onClick={avvia} disabled={!file || carica.isPending}>
          {carica.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Carica e leggi
        </Button>
      </div>
      {file && <p className="text-xs text-slate-500">File scelto: {file.name} ({(file.size / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB)</p>}
      {sostituisce && sostituisce.stato !== "bozza" && <p className="text-xs text-amber-700">Il computo attuale («{sostituisce.titolo || sostituisce.file_name}») verrà archiviato, non cancellato.</p>}
    </div>
  );
}
