import { useState } from "react";
import type { DocumentoSubappaltatore } from "@/types/subappaltatori";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCommesseFascicolo,
  useEvidenzeFascicolo,
} from "@/hooks/useFascicoloCantiere";
import { useImportaArchivioFascicolo } from "@/hooks/useImportaArchivioFascicolo";
import { tipoArchivioFascicolo } from "@/lib/sicurezza/importaArchivio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
export function ImportaArchivioFascicolo(
  { fonte, companyId, subId }: {
    fonte: DocumentoSubappaltatore;
    companyId: string;
    subId: string;
  },
) {
  const p = usePermissions();
  const [aperto, setAperto] = useState(false);
  const [titolo, setTitolo] = useState(
    fonte.nome_file || "Documento da archivio",
  );
  const [ordine, setOrdine] = useState("");
  const [conferma, setConferma] = useState(false);
  const commesse = useCommesseFascicolo(aperto ? companyId : "");
  const evidenze = useEvidenzeFascicolo({ companyId, subId });
  const importa = useImportaArchivioFascicolo();
  const esistente = evidenze.data?.find((d) => d.id === fonte.id);
  const presente = !!esistente?.file_path;
  if (
    !p.canViewSicurezzaCantiere || p.solaLettura ||
    fonte.company_id !== companyId || fonte.subappaltatore_id !== subId
  ) return null;
  const nomeTipo = tipoArchivioFascicolo(fonte.tipo);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Porta nel fascicolo ${fonte.nome_file || fonte.tipo}`}
        disabled={presente || evidenze.isLoading || evidenze.isError}
        onClick={() => {
          importa.reset();
          setAperto(true);
          setConferma(false);
          setTitolo(
            esistente?.titolo || fonte.nome_file || "Documento da archivio",
          );
          setOrdine(esistente?.order_id || "");
        }}
      >
        {presente
          ? "Nel fascicolo"
          : esistente
          ? "Riprendi importazione"
          : "Porta nel fascicolo"}
      </Button>
      <Dialog
        open={aperto}
        onOpenChange={(v) => {
          if (!importa.isPending) setAperto(v);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importa dall’archivio precedente</DialogTitle>
            <DialogDescription>
              Conserva una copia del file nel nuovo fascicolo. Il documento
              resta da verificare; il caricamento non conferma validità o
              idoneità.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <strong>{fonte.nome_file || fonte.tipo}</strong>
              <p className="text-xs text-muted-foreground">
                Classificazione proposta:{" "}
                {nomeTipo}. Date riprese dall’archivio e da controllare.
              </p>
              {fonte.tipo === "pos" && (
                <p className="mt-2 text-xs">
                  Il POS appartiene a uno specifico cantiere: scegli la commessa
                  corretta.
                </p>
              )}
            </div>
            <Label className="block">
              Titolo della copia<Input
                value={titolo}
                onChange={(e) => setTitolo(e.target.value)}
                disabled={importa.isPending || !!esistente}
              />
            </Label>
            <Label className="block">
              Ambito della copia<select
                aria-label="Ambito della copia"
                className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={ordine}
                disabled={importa.isPending || !!esistente ||
                  commesse.isLoading || commesse.isError}
                onChange={(e) => setOrdine(e.target.value)}
              >
                <option value="">Impresa / organico</option>
                {commesse.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.order_code} · {c.description}
                  </option>
                ))}
              </select>
            </Label>
            {commesse.isError && (
              <p role="alert" className="text-sm text-destructive">
                Commesse non disponibili.{" "}
                <button
                  className="underline"
                  onClick={() =>
                    void commesse.refetch()}
                >
                  Riprova
                </button>
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={conferma}
                disabled={importa.isPending}
                onChange={(e) => setConferma(e.target.checked)}
              />Ho controllato il documento e l’ambito della copia. La verifica
              tecnica resta da eseguire.
            </label>
            {importa.isError && (
              <p role="alert" className="text-sm text-destructive">
                {importa.error instanceof Error
                  ? importa.error.message
                  : (importa.error as { message?: string }).message ||
                    "Importazione non riuscita. La copia incompleta, se creata, rimane recuperabile dal fascicolo."}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={importa.isPending}
              onClick={() => setAperto(false)}
            >
              Annulla
            </Button>
            <Button
              disabled={!conferma || !titolo.trim() ||
                (!ordine && fonte.tipo === "pos") || importa.isPending ||
                commesse.isError}
              onClick={async () => {
                try {
                  const r = await importa.mutateAsync({
                    fonte,
                    destinazione: {
                      companyId,
                      subId,
                      orderId: ordine || null,
                      titolo,
                    },
                  });
                  toast.success(
                    r.giaPresente
                      ? "Documento già presente: nessuna copia aggiunta."
                      : "Copia conservata nel fascicolo, da verificare.",
                  );
                  setAperto(false);
                } catch {
                  /* Error remains visible; an interrupted import can be resumed. */
                }
              }}
            >
              {importa.isPending ? "Importazione…" : "Importa copia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
