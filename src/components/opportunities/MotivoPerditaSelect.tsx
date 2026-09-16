/**
 * Scelta del motivo di perdita: i motivi standard, quelli dell'azienda e,
 * sotto, «Nuovo motivo» per aggiungerne uno senza uscire dal dialog.
 * Usato dal kanban (LossReasonDialog) e dalla scheda opportunità.
 */
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAddLossReason, useLossReasons } from "@/hooks/useLossReasons";

export function MotivoPerditaSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (valore: string) => void;
}) {
  const { motivi } = useLossReasons();
  const aggiungi = useAddLossReason();
  const [nuovoMotivo, setNuovoMotivo] = useState("");
  const [mostraAggiungi, setMostraAggiungi] = useState(false);

  const standard = motivi.filter((m) => m.predefinito);
  const aziendali = motivi.filter((m) => !m.predefinito);

  const conferma = () =>
    aggiungi.mutate(nuovoMotivo, {
      onSuccess: (etichetta) => {
        onChange(etichetta);
        setNuovoMotivo("");
        setMostraAggiungi(false);
        toast.success("Motivo aggiunto per tutta l'azienda");
      },
      onError: (e) =>
        toast.error("Motivo non aggiunto", {
          description: e instanceof Error ? e.message : String(e),
        }),
    });

  return (
    <div className="space-y-1">
      <Label className="text-sm font-medium">Motivo *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1">
          <SelectValue placeholder="Scegli il motivo…" />
        </SelectTrigger>
        <SelectContent>
          {standard.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
          {aziendali.length > 0 && <SelectSeparator />}
          {aziendali.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!mostraAggiungi ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1"
          onClick={() => setMostraAggiungi(true)}
        >
          <Plus className="h-3 w-3" /> Nuovo motivo
        </button>
      ) : (
        <div className="flex gap-2 mt-1.5">
          <Input
            autoFocus
            placeholder="Es. misure sbagliate, condominio non delibera…"
            value={nuovoMotivo}
            onChange={(e) => setNuovoMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nuovoMotivo.trim()) { e.preventDefault(); conferma(); }
              if (e.key === "Escape") { e.stopPropagation(); setMostraAggiungi(false); setNuovoMotivo(""); }
            }}
            className="h-8 text-sm"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={aggiungi.isPending || !nuovoMotivo.trim()}
            onClick={conferma}
          >
            {aggiungi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Aggiungi"}
          </Button>
        </div>
      )}
    </div>
  );
}
