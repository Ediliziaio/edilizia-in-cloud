/**
 * Editor varianti costo manodopera per una tariffa.
 *
 * Sprint B — Varianti Costo Manodopera. Visibile solo ad admin (can_view_costs).
 *
 * Integrato dentro TariffaDialog di SettingsTariffe: l'admin apre una tariffa
 * esistente e in fondo al form vede la lista varianti + CTA per aggiungerne.
 *
 * Varianti disattivate (attivo=false) sono escluse dalla lista a meno che
 * l'utente clicchi "Mostra varianti scadute / disattivate".
 */
import { useState } from "react";
import { Plus, Pencil, PowerOff, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/formatters";
import {
  useTariffaVarianti,
  useTariffaVariantiMutations,
  type VarianteCreateInput,
} from "@/hooks/useTariffaVarianti";
import type {
  TariffaCostoVariante,
  ModalitaContabile,
} from "@/types/costVariants";
import {
  MODALITA_CONTABILE_LABELS,
  MODALITA_CONTABILE_ICONS,
} from "@/types/costVariants";

interface Props {
  tariffaId: string;
  costoDefault: number | null;
}

const MODALITA_OPTIONS: ModalitaContabile[] = [
  "dipendente",
  "subappalto_fatturato",
  "subappalto_forfait",
  "forfait",
  "altro",
];

export function TariffaVariantiEditor({ tariffaId, costoDefault }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TariffaCostoVariante | null>(null);
  const [showExpired, setShowExpired] = useState(false);

  const { data: varianti = [], isLoading } = useTariffaVarianti(tariffaId, {
    includeExpired: showExpired,
  });
  const { setDefault, disableVariante } = useTariffaVariantiMutations();

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (v: TariffaCostoVariante) => {
    setEditing(v);
    setDialogOpen(true);
  };

  const handleSetDefault = async (v: TariffaCostoVariante) => {
    try {
      await setDefault.mutateAsync({ tariffaId, varianteId: v.id });
      toast.success(`"${v.nome}" impostata come variante default`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore impostazione default");
    }
  };

  const handleDisable = async (v: TariffaCostoVariante) => {
    if (!confirm(`Disattivare la variante "${v.nome}"? Le assegnazioni storiche resteranno intatte.`))
      return;
    try {
      await disableVariante.mutateAsync(v.id);
      toast.success("Variante disattivata");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore disattivazione");
    }
  };

  const hasVariants = varianti.length > 0;
  const defaultVar = varianti.find((v) => v.is_default);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-sm font-semibold">Varianti di costo</h4>
          <p className="text-xs text-muted-foreground">
            Configura varianti diverse (dipendente, subappaltatore, forfait) per tracciare il costo reale della manodopera.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Aggiungi variante
        </Button>
      </div>

      {!hasVariants && !isLoading && (
        <div className="rounded-md bg-background border p-3 text-xs text-muted-foreground">
          Questa tariffa usa solo il costo default
          {costoDefault != null && costoDefault > 0
            ? ` (${formatCurrency(costoDefault)})`
            : " (non impostato)"}
          . Aggiungi varianti per distinguere dipendente vs subappaltatori.
        </div>
      )}

      {isLoading && (
        <p className="text-xs text-muted-foreground py-2">Caricamento varianti…</p>
      )}

      {hasVariants && (
        <div className="space-y-2">
          {varianti.map((v) => {
            const icon = MODALITA_CONTABILE_ICONS[v.modalita_contabile];
            const modLabel = MODALITA_CONTABILE_LABELS[v.modalita_contabile];
            const expired = v.valid_to != null && v.valid_to < new Date().toISOString().slice(0, 10);
            return (
              <div
                key={v.id}
                className={`rounded-md border bg-background p-3 flex items-start justify-between gap-2 flex-wrap ${
                  !v.attivo ? "opacity-60" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base">{icon}</span>
                    <span className="font-medium">{v.nome}</span>
                    <Badge variant="outline" className="text-xs">{modLabel}</Badge>
                    {v.is_default && (
                      <Badge className="text-xs bg-amber-100 text-amber-800 hover:bg-amber-200">
                        <Star className="h-3 w-3 mr-0.5" /> Default
                      </Badge>
                    )}
                    {!v.attivo && <Badge variant="secondary" className="text-xs">Disattivata</Badge>}
                    {expired && <Badge variant="destructive" className="text-xs">Scaduta</Badge>}
                  </div>
                  {v.descrizione && (
                    <p className="text-xs text-muted-foreground mt-1">{v.descrizione}</p>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Costo: <span className="font-semibold text-foreground">{formatCurrency(v.costo)}</span>
                    {v.valid_from && ` · Dal ${new Date(v.valid_from).toLocaleDateString("it-IT")}`}
                    {v.valid_to && ` · Al ${new Date(v.valid_to).toLocaleDateString("it-IT")}`}
                  </div>
                </div>
                <div className="flex gap-1">
                  {!v.is_default && v.attivo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Imposta come default"
                      onClick={() => handleSetDefault(v)}
                    >
                      <StarOff className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" title="Modifica" onClick={() => openEdit(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {v.attivo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      title="Disattiva"
                      onClick={() => handleDisable(v)}
                    >
                      <PowerOff className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {hasVariants && !defaultVar && (
            <p className="text-xs text-amber-600">
              ⚠ Nessuna variante marcata come default: verrà usato il costo della tariffa.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground underline"
          onClick={() => setShowExpired((s) => !s)}
        >
          {showExpired ? "Nascondi" : "Mostra"} varianti scadute / disattivate
        </button>
      </div>

      {dialogOpen && (
        <VarianteDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          tariffaId={tariffaId}
        />
      )}
    </div>
  );
}

// ─── Variante Dialog ──────────────────────────────────────────────────────────
function VarianteDialog({
  open,
  onClose,
  editing,
  tariffaId,
}: {
  open: boolean;
  onClose: () => void;
  editing: TariffaCostoVariante | null;
  tariffaId: string;
}) {
  const { createVariante, updateVariante } = useTariffaVariantiMutations();
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [modalita, setModalita] = useState<ModalitaContabile>(
    editing?.modalita_contabile ?? "subappalto_fatturato",
  );
  const [costo, setCosto] = useState(String(editing?.costo ?? ""));
  const [validFrom, setValidFrom] = useState(
    editing?.valid_from ?? new Date().toISOString().slice(0, 10),
  );
  const [validTo, setValidTo] = useState(editing?.valid_to ?? "");
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [fornitoreId, setFornitoreId] = useState(editing?.fornitore_id ?? "");
  const [risorsaId, setRisorsaId] = useState(editing?.risorsa_id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Il nome è obbligatorio");
      return;
    }
    const costoNum = parseFloat(costo);
    if (isNaN(costoNum) || costoNum < 0) {
      toast.error("Il costo deve essere un numero ≥ 0");
      return;
    }
    setSaving(true);
    try {
      const payload: VarianteCreateInput = {
        tariffa_id: tariffaId,
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        modalita_contabile: modalita,
        fornitore_id: fornitoreId.trim() || null,
        risorsa_id: risorsaId.trim() || null,
        costo: costoNum,
        valid_from: validFrom,
        valid_to: validTo.trim() || null,
        is_default: isDefault,
        attivo: true,
        sort_order: editing?.sort_order ?? 0,
      };
      if (editing) {
        await updateVariante.mutateAsync({ id: editing.id, patch: payload });
        toast.success("Variante aggiornata");
      } else {
        await createVariante.mutateAsync(payload);
        toast.success("Variante creata");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio variante");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica variante costo" : "Nuova variante costo"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Es. Subappalto Bianchi, Squadra interna"
            />
          </div>
          <div>
            <Label>Descrizione</Label>
            <Textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Opzionale"
              rows={2}
            />
          </div>
          <div>
            <Label>Modalità contabile *</Label>
            <Select value={modalita} onValueChange={(v) => setModalita(v as ModalitaContabile)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODALITA_OPTIONS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODALITA_CONTABILE_ICONS[m]} {MODALITA_CONTABILE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Costo unitario € *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Valido dal *</Label>
              <Input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <Label>Valido al (opz.)</Label>
              <Input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                min={validFrom}
              />
            </div>
          </div>
          {/* FK deboli: gli autocomplete fornitori/risorse saranno aggiunti quando le tabelle target saranno definite (vedi §3.1 masterprompt). */}
          <div>
            <Label className="text-xs text-muted-foreground">
              ID fornitore (opz.) · ID risorsa HR (opz.)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={fornitoreId}
                onChange={(e) => setFornitoreId(e.target.value)}
                placeholder="UUID fornitore"
                className="text-xs"
              />
              <Input
                value={risorsaId}
                onChange={(e) => setRisorsaId(e.target.value)}
                placeholder="UUID risorsa"
                className="text-xs"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quando i moduli Fornitori/HR saranno attivi, questi ID verranno risolti in un dropdown.
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm">Imposta come variante default per questa tariffa</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio…" : editing ? "Aggiorna" : "Crea variante"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
