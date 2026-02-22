import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CalendarFormData {
  name: string;
  group_name: string;
  duration_minutes: number;
  calendar_type: string;
  description: string;
}

interface CalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CalendarFormData) => void;
  initialData?: Partial<CalendarFormData> | null;
  isLoading?: boolean;
}

export default function CalendarDialog({ open, onOpenChange, onSubmit, initialData, isLoading }: CalendarDialogProps) {
  const [form, setForm] = useState<CalendarFormData>({
    name: "",
    group_name: "",
    duration_minutes: 30,
    calendar_type: "personal",
    description: "",
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name || "",
        group_name: initialData.group_name || "",
        duration_minutes: initialData.duration_minutes || 30,
        calendar_type: initialData.calendar_type || "personal",
        description: initialData.description || "",
      });
    } else {
      setForm({ name: "", group_name: "", duration_minutes: 30, calendar_type: "personal", description: "" });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initialData ? "Modifica calendario" : "Nuovo calendario"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cal-name">Nome *</Label>
            <Input id="cal-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-group">Gruppo</Label>
            <Input id="cal-group" value={form.group_name} onChange={(e) => setForm(f => ({ ...f, group_name: e.target.value }))} placeholder="Es: Non raggruppato" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Durata (min)</Label>
              <Select value={String(form.duration_minutes)} onValueChange={(v) => setForm(f => ({ ...f, duration_minutes: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">60 min</SelectItem>
                  <SelectItem value="90">90 min</SelectItem>
                  <SelectItem value="120">120 min</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.calendar_type} onValueChange={(v) => setForm(f => ({ ...f, calendar_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personale</SelectItem>
                  <SelectItem value="team">Team</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cal-desc">Descrizione</Label>
            <Textarea id="cal-desc" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={!form.name.trim() || isLoading}>
              {isLoading ? "Salvataggio..." : initialData ? "Salva modifiche" : "Crea calendario"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
