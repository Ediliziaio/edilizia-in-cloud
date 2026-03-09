import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function TierMaterialsTab() {
  const queryClient = useQueryClient();
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", type: "banner", file_url: "", thumbnail_url: "", min_tier: "bronze", sort_order: 0 });

  const { data: tiers = [] } = useQuery({
    queryKey: ["admin-referral-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("referral_tiers").select("*").order("position");
      return data || [];
    },
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["admin-partner-materials"],
    queryFn: async () => {
      const { data } = await supabase.from("partner_materials").select("*").order("sort_order");
      return data || [];
    },
  });

  const saveMaterial = useMutation({
    mutationFn: async () => {
      if (editingMaterial) {
        const { error } = await supabase.from("partner_materials").update(form).eq("id", editingMaterial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_materials").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partner-materials"] });
      setMaterialDialog(false);
      setEditingMaterial(null);
      toast.success(editingMaterial ? "Materiale aggiornato" : "Materiale creato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-partner-materials"] });
      toast.success("Materiale eliminato");
    },
  });

  const openNew = () => {
    setEditingMaterial(null);
    setForm({ name: "", description: "", type: "banner", file_url: "", thumbnail_url: "", min_tier: "bronze", sort_order: 0 });
    setMaterialDialog(true);
  };

  const openEdit = (m: any) => {
    setEditingMaterial(m);
    setForm({
      name: m.name, description: m.description || "", type: m.type,
      file_url: m.file_url, thumbnail_url: m.thumbnail_url || "",
      min_tier: m.min_tier || "bronze", sort_order: m.sort_order || 0,
    });
    setMaterialDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Tiers overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier Attivi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tiers.map((t: any) => (
              <div key={t.id} className="border rounded-lg p-3 text-center space-y-1">
                <div className="text-2xl">{t.icon}</div>
                <div className="font-medium text-sm">{t.name}</div>
                <Badge variant="outline" className="text-xs">≥{t.min_active_companies} aziende</Badge>
                <div className="text-xs text-muted-foreground">×{t.commission_multiplier} commissione</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Materials */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Materiali Marketing</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Nuovo Materiale
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nessun materiale caricato
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tier Minimo</TableHead>
                  <TableHead>Attivo</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline">{m.type}</Badge></TableCell>
                    <TableCell>{m.min_tier}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? "default" : "secondary"}>
                        {m.is_active ? "Attivo" : "Inattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                          if (confirm("Eliminare questo materiale?")) deleteMaterial.mutate(m.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Material dialog */}
      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? "Modifica Materiale" : "Nuovo Materiale"}</DialogTitle>
            <DialogDescription>I materiali saranno accessibili ai partner del tier selezionato e superiore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo">Logo</SelectItem>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="email_template">Email Template</SelectItem>
                    <SelectItem value="social_post">Post Social</SelectItem>
                    <SelectItem value="pdf_brochure">PDF Brochure</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier Minimo</Label>
                <Select value={form.min_tier} onValueChange={(v) => setForm({ ...form, min_tier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t: any) => (
                      <SelectItem key={t.slug} value={t.slug}>{t.icon} {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL File *</Label>
              <Input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>URL Thumbnail</Label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." />
            </div>
            <Button className="w-full" onClick={() => saveMaterial.mutate()} disabled={!form.name || !form.file_url || saveMaterial.isPending}>
              {editingMaterial ? "Salva Modifiche" : "Crea Materiale"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
