import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Warehouse as WarehouseIcon,
  Plus,
  Pencil,
  PowerOff,
  Star,
  ArrowLeft,
  Truck,
  Building2,
  MapPin,
  Car,
  Users,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWarehouses, type Warehouse, type WarehouseInsert } from "@/hooks/useWarehouses";
import { WarehouseAssignmentsDialog } from "@/components/warehouse/WarehouseAssignmentsDialog";

const TYPE_ICONS: Record<string, React.ReactNode> = {
  main: <Building2 className="h-4 w-4" />,
  secondary: <WarehouseIcon className="h-4 w-4" />,
  site: <MapPin className="h-4 w-4" />,
  vehicle: <Car className="h-4 w-4" />,
};

const TYPE_LABELS: Record<string, string> = {
  main: "Principale",
  secondary: "Secondario",
  site: "Cantiere",
  vehicle: "Veicolo",
};

const TYPE_COLORS: Record<string, string> = {
  main: "bg-blue-100 text-blue-800",
  secondary: "bg-purple-100 text-purple-800",
  site: "bg-amber-100 text-amber-800",
  vehicle: "bg-green-100 text-green-800",
};

const emptyForm = (): WarehouseInsert => ({
  name: "",
  type: "secondary",
  is_active: true,
  is_default: false,
  position: 0,
  address: null,
  city: null,
  province: null,
  postal_code: null,
  contact_name: null,
  contact_phone: null,
  linked_order_id: null,
  notes: null,
});

export default function WarehouseManager() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const {
    warehouses,
    isLoading,
    createWarehouse,
    updateWarehouse,
    setDefaultWarehouse,
    deactivateWarehouse,
    isCreating,
    isUpdating,
  } = useWarehouses(false); // mostra anche disattivati

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseInsert>(emptyForm());
  const [deactivateTarget, setDeactivateTarget] = useState<Warehouse | null>(null);
  const [assignTarget, setAssignTarget] = useState<Warehouse | null>(null);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6" />
            Gestione Magazzini
          </h1>
        </div>
        <Card className="max-w-xl mx-auto">
          <CardContent
            className="py-10 flex flex-col items-center gap-4 text-center"
            role="alert"
            aria-live="polite"
          >
            <ShieldAlert
              className="h-12 w-12 text-amber-500"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">Accesso riservato</p>
              <p className="text-sm text-muted-foreground mt-1">
                Solo l&apos;amministratore dell&apos;azienda può creare o
                gestire i magazzini e le assegnazioni magazzinieri. Contatta
                l&apos;amministratore per richiedere l&apos;accesso.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate("/azienda/magazzino")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              Torna al magazzino
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setForm({
      name: w.name,
      type: w.type,
      is_active: w.is_active,
      is_default: w.is_default,
      position: w.position,
      address: w.address ?? null,
      city: w.city ?? null,
      province: w.province ?? null,
      postal_code: w.postal_code ?? null,
      contact_name: w.contact_name ?? null,
      contact_phone: w.contact_phone ?? null,
      linked_order_id: w.linked_order_id ?? null,
      notes: w.notes ?? null,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // P2 FIX: client-side duplicate name check + uppercase province
    // (la colonna DB può accettare duplicati ma UI li rende indistinguibili).
    const normalizedName = form.name.trim();
    const duplicate = warehouses.some(
      (w) => w.name.toLowerCase() === normalizedName.toLowerCase() && w.id !== editingId,
    );
    if (duplicate) {
      toast.error("Nome magazzino già in uso", {
        description: "Scegli un nome diverso per distinguerli nei selettori.",
      });
      return;
    }
    const normalizedForm: typeof form = {
      ...form,
      name: normalizedName,
      province: form.province ? form.province.toString().toUpperCase().slice(0, 2) : form.province,
    };
    if (editingId) {
      await updateWarehouse({ id: editingId, ...normalizedForm });
    } else {
      await createWarehouse(normalizedForm);
    }
    setDialogOpen(false);
  };

  const f = (field: keyof WarehouseInsert, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value || null }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <WarehouseIcon className="h-6 w-6" />
            Gestione Magazzini
          </h1>
          <p className="text-muted-foreground">
            Crea e gestisci i magazzini fisici della tua azienda
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Magazzino
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-muted-foreground">Caricamento…</p>
      ) : warehouses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <WarehouseIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nessun magazzino configurato.</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crea il primo magazzino
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id} className={!w.is_active ? "opacity-50" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground shrink-0">
                      {TYPE_ICONS[w.type]}
                    </span>
                    <CardTitle className="text-base truncate">{w.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {w.is_default && (
                      <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                    )}
                    <Badge className={TYPE_COLORS[w.type] + " text-xs"}>
                      {TYPE_LABELS[w.type]}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {w.city && (
                  <p className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {[w.address, w.city, w.province].filter(Boolean).join(", ")}
                  </p>
                )}
                {w.contact_name && (
                  <p className="flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 shrink-0" />
                    {w.contact_name}
                    {w.contact_phone && ` · ${w.contact_phone}`}
                  </p>
                )}
                {!w.is_active && (
                  <Badge variant="outline" className="text-xs text-destructive border-destructive/50">
                    Disattivato
                  </Badge>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => openEdit(w)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAssignTarget(w)}
                    title="Gestisci magazzinieri assegnati a questo magazzino"
                  >
                    <Users className="h-3.5 w-3.5 mr-1" />
                    Magazzinieri
                  </Button>
                  {!w.is_default && w.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDefaultWarehouse(w.id)}
                      title="Imposta come predefinito"
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />
                      Default
                    </Button>
                  )}
                  {w.is_active && !w.is_default && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive ml-auto"
                      onClick={() => setDeactivateTarget(w)}
                    >
                      <PowerOff className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Modifica Magazzino" : "Nuovo Magazzino"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="es. Magazzino Nord"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((p) => ({ ...p, type: v as Warehouse["type"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="main">Principale</SelectItem>
                    <SelectItem value="secondary">Secondario</SelectItem>
                    <SelectItem value="site">Cantiere</SelectItem>
                    <SelectItem value="vehicle">Veicolo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Posizione (ordine)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.position}
                  onChange={(e) => setForm((p) => ({ ...p, position: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Indirizzo</Label>
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => f("address", e.target.value)}
                  placeholder="Via Roma 1"
                />
              </div>
              <div className="space-y-2">
                <Label>Città</Label>
                <Input
                  value={form.city ?? ""}
                  onChange={(e) => f("city", e.target.value)}
                  placeholder="Milano"
                />
              </div>
              <div className="space-y-2">
                <Label>Prov.</Label>
                <Input
                  value={form.province ?? ""}
                  onChange={(e) => f("province", e.target.value)}
                  maxLength={2}
                  placeholder="MI"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Referente</Label>
                <Input
                  value={form.contact_name ?? ""}
                  onChange={(e) => f("contact_name", e.target.value)}
                  placeholder="Mario Rossi"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefono referente</Label>
                <Input
                  value={form.contact_phone ?? ""}
                  onChange={(e) => f("contact_phone", e.target.value)}
                  placeholder="+39 333 123456"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => f("notes", e.target.value)}
                rows={2}
                placeholder="Note interne…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={!form.name.trim() || isCreating || isUpdating}
            >
              {isCreating || isUpdating ? "Salvataggio…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign users dialog */}
      {assignTarget && (
        <WarehouseAssignmentsDialog
          warehouseId={assignTarget.id}
          warehouseName={assignTarget.name}
          open={!!assignTarget}
          onOpenChange={(v) => !v && setAssignTarget(null)}
        />
      )}

      {/* Deactivate confirm */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disattivare {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Il magazzino verrà nascosto da tutti i selettori. Lo stock e i movimenti
              esistenti non vengono eliminati. Potrai riattivarlo in futuro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deactivateTarget) {
                  await deactivateWarehouse(deactivateTarget.id);
                  setDeactivateTarget(null);
                }
              }}
            >
              Disattiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
