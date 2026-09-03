/**
 * Personale → Uffici.
 *
 * Gli uffici dell'azienda (Amministrazione, Tecnico, Commerciale, Cantiere…),
 * con i loro membri e un responsabile. Servono al flusso di lavoro commessa:
 * un passo può andare a una persona o a un ufficio, e assegnare all'ufficio è
 * ciò che tiene in piedi il flusso quando le persone cambiano.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useUffici, useSalvaUfficio, useEliminaUfficio, type Ufficio } from "@/hooks/useUffici";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Pencil, Trash2, UserRound, Users } from "lucide-react";

const NESSUN_RESPONSABILE = "__nessuno__";

/** Suggerimenti al primo avvio: sono i reparti che ricorrono in ogni impresa. */
const UFFICI_TIPICI = ["Amministrazione", "Ufficio tecnico", "Commerciale", "Cantiere", "Acquisti"];

export function TabUffici() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: uffici = [], isLoading } = useUffici(companyId);
  const { data: staff = [] } = useCompanyStaffUsers(companyId);
  const salva = useSalvaUfficio(companyId);
  const elimina = useEliminaUfficio(companyId);

  const [inModifica, setInModifica] = useState<Ufficio | null>(null);
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [daEliminare, setDaEliminare] = useState<Ufficio | null>(null);

  const nomePersona = useMemo(() => {
    const m = new Map<string, string>();
    staff.forEach((p) => m.set(p.id, `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Utente"));
    return m;
  }, [staff]);

  const personeInUnUfficio = useMemo(
    () => new Set(uffici.flatMap((u) => u.membri)),
    [uffici],
  );
  const senzaUfficio = staff.filter((p) => !personeInUnUfficio.has(p.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><Building2 className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{uffici.length}</p>
              <p className="text-xs text-muted-foreground">Uffici</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><Users className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{personeInUnUfficio.size}</p>
              <p className="text-xs text-muted-foreground">Persone assegnate</p>
            </div>
          </CardContent>
        </Card>
        <Card className={senzaUfficio.length > 0 ? "border-amber-200" : undefined}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted"><UserRound className="h-5 w-5 text-muted-foreground" /></div>
            <div>
              <p className="text-2xl font-bold">{senzaUfficio.length}</p>
              <p className="text-xs text-muted-foreground">Fuori da ogni ufficio</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Un passo del flusso commessa può essere assegnato a un ufficio invece che a una persona.
        </p>
        <Button size="sm" onClick={() => setNuovoAperto(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo ufficio
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento…</div>
      ) : uffici.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nessun ufficio. Finché non ce n'è uno, i passi del flusso si possono assegnare solo a singole persone.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {UFFICI_TIPICI.map((nome) => (
                <Button
                  key={nome}
                  variant="outline"
                  size="sm"
                  disabled={salva.isPending}
                  onClick={() => salva.mutate({ nome, membri: [] })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> {nome}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {uffici.map((u) => (
            <Card key={u.id} className={u.attivo ? undefined : "opacity-60"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-semibold truncate">{u.nome}</span>
                      {!u.attivo && <Badge variant="secondary" className="text-[10px]">Disattivato</Badge>}
                    </div>
                    {u.descrizione && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{u.descrizione}</p>
                    )}
                  </div>
                  <div className="flex shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setInModifica(u)} aria-label="Modifica ufficio">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDaEliminare(u)} aria-label="Elimina ufficio">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <p className="text-muted-foreground">
                    Responsabile:{" "}
                    <span className="text-foreground font-medium">
                      {u.responsabile_id ? nomePersona.get(u.responsabile_id) ?? "—" : "nessuno"}
                    </span>
                  </p>
                  {u.membri.length === 0 ? (
                    // Un ufficio vuoto non e' un dettaglio estetico: le attivita'
                    // che gli arrivano non le vedrebbe nessuno.
                    <p className="text-amber-600">Nessun membro: le attività assegnate qui non le vedrebbe nessuno.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.membri.map((id) => (
                        <Badge key={id} variant="secondary" className="text-[10px] font-normal">
                          {nomePersona.get(id) ?? "Utente"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(nuovoAperto || inModifica) && (
        <UfficioDialog
          ufficio={inModifica}
          staff={staff.map((p) => ({ id: p.id, nome: nomePersona.get(p.id) ?? "Utente" }))}
          salvataggioInCorso={salva.isPending}
          onSalva={(dati) => salva.mutate(dati, {
            onSuccess: () => { setInModifica(null); setNuovoAperto(false); },
          })}
          onClose={() => { setInModifica(null); setNuovoAperto(false); }}
        />
      )}

      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              I passi del flusso e le attività assegnate a questo ufficio non si perdono: restano
              semplicemente senza ufficio, da riassegnare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (daEliminare) elimina.mutate(daEliminare.id); setDaEliminare(null); }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface UfficioDialogProps {
  ufficio: Ufficio | null;
  staff: Array<{ id: string; nome: string }>;
  salvataggioInCorso: boolean;
  onSalva: (dati: {
    id?: string; nome: string; descrizione: string | null;
    responsabile_id: string | null; attivo: boolean; membri: string[];
  }) => void;
  onClose: () => void;
}

function UfficioDialog({ ufficio, staff, salvataggioInCorso, onSalva, onClose }: UfficioDialogProps) {
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [responsabile, setResponsabile] = useState<string>(NESSUN_RESPONSABILE);
  const [attivo, setAttivo] = useState(true);
  const [membri, setMembri] = useState<string[]>([]);

  useEffect(() => {
    setNome(ufficio?.nome ?? "");
    setDescrizione(ufficio?.descrizione ?? "");
    setResponsabile(ufficio?.responsabile_id ?? NESSUN_RESPONSABILE);
    setAttivo(ufficio?.attivo ?? true);
    setMembri(ufficio?.membri ?? []);
  }, [ufficio]);

  const togglMembro = (id: string) =>
    setMembri((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const salva = () => {
    onSalva({
      id: ufficio?.id,
      nome,
      descrizione: descrizione.trim() || null,
      responsabile_id: responsabile === NESSUN_RESPONSABILE ? null : responsabile,
      attivo,
      membri,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ufficio ? "Modifica ufficio" : "Nuovo ufficio"}</DialogTitle>
          <DialogDescription>
            Le attività assegnate a questo ufficio le vedono tutti i membri; il responsabile se le
            trova in carico, ma chiunque del gruppo può prenderle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Amministrazione" maxLength={60} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrizione <span className="text-muted-foreground font-normal">(facoltativa)</span></Label>
            <Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)} placeholder="Di cosa si occupa" maxLength={160} />
          </div>

          <div className="space-y-1.5">
            <Label>Responsabile</Label>
            <Select value={responsabile} onValueChange={setResponsabile}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NESSUN_RESPONSABILE}>Nessuno — resta da prendere in carico</SelectItem>
                {staff.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Il responsabile entra automaticamente fra i membri.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Membri</Label>
            <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
              {staff.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Nessun utente nello staff.</p>
              ) : staff.map((p) => (
                <label key={p.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={membri.includes(p.id) || p.id === responsabile}
                    disabled={p.id === responsabile}
                    onCheckedChange={() => togglMembro(p.id)}
                  />
                  <span>{p.nome}</span>
                  {p.id === responsabile && (
                    <Badge variant="secondary" className="ml-auto text-[10px]">responsabile</Badge>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Ufficio attivo</p>
              <p className="text-xs text-muted-foreground">Se lo spegni non viene più proposto nei flussi.</p>
            </div>
            <Switch checked={attivo} onCheckedChange={setAttivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggioInCorso || !nome.trim()}>
            {salvataggioInCorso ? "Salvataggio…" : "Salva ufficio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
