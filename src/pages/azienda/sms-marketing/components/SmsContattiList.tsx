/**
 * Tabella contatti SMS con ricerca, filtro tag, filtro opt-out ed export CSV.
 */
import { useState } from "react";
import { Search, Plus, Download, UserX, UserCheck, Loader2, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { escapeCsvCell } from "@/lib/csvExport";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSmsContatti } from "@/hooks/useSmsContatti";
import { SmsContattoForm } from "./SmsContattoForm";
import type { SmsContatto } from "@/types/sms-marketing";

type OptOutFiltro = "tutti" | "attivi" | "opt_out";

export function SmsContattiList() {
  const [search, setSearch] = useState("");
  const [optOutFiltro, setOptOutFiltro] = useState<OptOutFiltro>("tutti");
  const [editContatto, setEditContatto] = useState<SmsContatto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filtri = {
    search: search || undefined,
    soloPropri: optOutFiltro === "attivi",
    soloOptOut: optOutFiltro === "opt_out",
  };

  const { contatti, isLoading, remove, isRemoving } = useSmsContatti(filtri);

  const handleExportCsv = () => {
    const header = "telefono,nome,cognome,consenso,opt_out,tags";
    const rows = contatti.map((c) =>
      [
        c.telefono,
        c.nome ?? "",
        c.cognome ?? "",
        String(c.consenso_marketing),
        String(c.opt_out),
        c.tags.join(";"),
      ].map((v) => escapeCsvCell(v, ",")).join(",")
    );
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatti-sms-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome, cognome o telefono..."
            className="pl-8"
          />
        </div>
        <Select value={optOutFiltro} onValueChange={(v) => setOptOutFiltro(v as OptOutFiltro)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti">Tutti</SelectItem>
            <SelectItem value="attivi">Attivi</SelectItem>
            <SelectItem value="opt_out">Opt-out</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={contatti.length === 0}>
          <Download className="h-4 w-4 mr-1" />
          Esporta CSV
        </Button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" onClick={() => setEditContatto(null)}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{editContatto ? "Modifica contatto" : "Nuovo contatto"}</SheetTitle>
            </SheetHeader>
            <div className="mt-4">
              <SmsContattoForm
                initialData={editContatto ?? undefined}
                onSuccess={() => setSheetOpen(false)}
                onCancel={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && contatti.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <UserCheck className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nessun contatto trovato.</p>
            <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Aggiungi il primo contatto
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabella */}
      {!isLoading && contatti.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Contatto</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Telefono</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Consenso</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Stato</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tag</th>
                  <th className="px-4 py-2 w-20" />
                </tr>
              </thead>
              <tbody>
                {contatti.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">
                        {[c.nome, c.cognome].filter(Boolean).join(" ") || <span className="text-muted-foreground italic">Senza nome</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{c.telefono}</td>
                    <td className="px-4 py-2.5">
                      {c.consenso_marketing ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                          <UserCheck className="h-3 w-3 mr-1" /> Consenso
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                          No consenso
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {c.opt_out ? (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          <UserX className="h-3 w-3 mr-1" /> Opt-out
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Attivo</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                        {c.tags.length > 2 && (
                          <Badge variant="secondary" className="text-xs">+{c.tags.length - 2}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => { setEditContatto(c); setSheetOpen(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </SheetTrigger>
                        </Sheet>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                              {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare il contatto?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è irreversibile. Il contatto verrà eliminato definitivamente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => remove(c.id)}
                              >
                                Elimina
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-muted-foreground">
            {contatti.length.toLocaleString("it-IT")} contatti
          </div>
        </Card>
      )}
    </div>
  );
}
