/**
 * ArticleVariantsEditor — editor varianti prezzo di una famiglia listino.
 *
 * Le varianti modificano il prezzo finale dell'articolo senza duplicarlo
 * a catalogo. Esempi:
 *   - "Vetro triplo basso-emissivo"      modificatore_tipo=fisso  +80€
 *   - "Colore antracite"                  modificatore_tipo=percentuale +5%
 *   - "Ferramenta anti-effrazione RC2"   fisso +120€
 *
 * Le varianti scelte nel picker BOM vengono salvate come snapshot sulla
 * riga preventivo (varianti_selezionate jsonb) -> immuni a modifiche
 * future del listino.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2, Layers, GripVertical } from "lucide-react";
import {
  useArticleVariants,
  useCreateArticleVariant,
  useUpdateArticleVariant,
  useDeleteArticleVariant,
} from "@/lib/serramenti/queries";
import type { ArticleVariantRow } from "@/types/serramenti";

interface Props {
  familyId: string;
}

export function ArticleVariantsEditor({ familyId }: Props) {
  const { data: variants = [], isLoading } = useArticleVariants(familyId);
  const createMut = useCreateArticleVariant(familyId);
  const updateMut = useUpdateArticleVariant(familyId);
  const deleteMut = useDeleteArticleVariant(familyId);

  const handleAdd = () => {
    createMut.mutate({
      nome: "Nuova variante",
      modificatore_tipo: "fisso",
      modificatore_valore: 0,
      attivo: true,
      sort_order: variants.length,
    });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-blue-700" />
              Varianti / opzioni prezzo
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-prose">
              Opzioni che modificano il prezzo dell'articolo senza duplicarlo.
              Es: vetro triplo +€80, colore antracite +5%, ferramenta antieffrazione +€120.
              Il commerciale puo' sceglierne piu' di una nel picker BOM.
            </p>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={createMut.isPending} className="gap-1">
            {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Aggiungi variante
          </Button>
        </div>

        {isLoading ? (
          <div className="text-center text-xs text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
            Caricamento varianti…
          </div>
        ) : variants.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-md">
            <p className="text-xs text-muted-foreground mb-2">
              Nessuna variante. Aggiungi opzioni per offrire personalizzazioni al cliente.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {variants.map((v) => (
              <VariantRow
                key={v.id}
                variant={v}
                onUpdate={(patch) => updateMut.mutate({ id: v.id, patch })}
                onDelete={() => deleteMut.mutate(v.id)}
                deleting={deleteMut.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Riga variante editabile ────────────────────────────────────────────────

function VariantRow({
  variant: v, onUpdate, onDelete, deleting,
}: {
  variant: ArticleVariantRow;
  onUpdate: (patch: Partial<ArticleVariantRow>) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  // Stato locale dei campi editabili (onBlur scrive sul DB)
  const [nome, setNome] = useState(v.nome);
  const [descrizione, setDescrizione] = useState(v.descrizione ?? "");
  const [tipo, setTipo] = useState<"percentuale" | "fisso">(v.modificatore_tipo);
  const [valore, setValore] = useState<string>(String(v.modificatore_valore));

  return (
    <div className={
      "rounded-md border p-2.5 grid grid-cols-12 gap-2 items-end " +
      (v.attivo ? "bg-white border-slate-200" : "bg-slate-50/60 border-slate-200 opacity-60")
    }>
      <GripVertical className="h-4 w-4 text-slate-300 mt-2 col-span-12 md:col-span-1 hidden md:block" />
      <div className="col-span-12 md:col-span-4">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Nome</Label>
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => { if (nome !== v.nome) onUpdate({ nome }); }}
          placeholder="Es. Vetro triplo basso-emissivo"
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-6 md:col-span-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
        <Select
          value={tipo}
          onValueChange={(val) => {
            setTipo(val as "percentuale" | "fisso");
            onUpdate({ modificatore_tipo: val as "percentuale" | "fisso" });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percentuale">Percentuale (%)</SelectItem>
            <SelectItem value="fisso">Fisso (€)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="col-span-6 md:col-span-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Valore {tipo === "percentuale" ? "(%)" : "(€)"}
        </Label>
        <Input
          type="number"
          step="0.01"
          value={valore}
          onChange={(e) => setValore(e.target.value)}
          onBlur={() => {
            const n = Number(valore);
            if (Number.isFinite(n) && n !== Number(v.modificatore_valore)) {
              onUpdate({ modificatore_valore: n });
            }
          }}
          className="h-8 text-xs tabular-nums"
        />
      </div>
      <div className="col-span-12 md:col-span-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Descrizione</Label>
        <Input
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          onBlur={() => { if (descrizione !== (v.descrizione ?? "")) onUpdate({ descrizione: descrizione || null }); }}
          placeholder="Note opzionali"
          className="h-8 text-xs"
        />
      </div>
      <div className="col-span-8 md:col-span-1 flex items-center gap-2 pt-4 md:pt-0">
        <Switch
          checked={v.attivo}
          onCheckedChange={(checked) => onUpdate({ attivo: checked })}
        />
        <span className="text-[10px] text-muted-foreground">
          {v.attivo ? "Attiva" : "Disattiva"}
        </span>
      </div>
      <div className="col-span-4 md:col-span-12 md:hidden flex justify-end">
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          disabled={deleting}
          className="h-8 w-8"
          title="Elimina variante"
        >
          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
        </Button>
      </div>
      <div className="hidden md:flex md:col-span-12 justify-end -mt-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={deleting}
          className="h-7 text-[11px] text-rose-600 hover:text-rose-700 gap-1"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Elimina
        </Button>
      </div>
    </div>
  );
}
