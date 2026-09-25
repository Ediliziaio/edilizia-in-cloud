import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { VAT_RATES } from "@/lib/vatUtils";

const teamSchema = z.object({
  name: z.string().trim().min(1, "Nome squadra obbligatorio"),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  notes: z.string().optional(),
  is_active: z.boolean(),
  vat_rate: z.number(),
  // Squadra unica (08/09/2026): tipo, accesso all'app cantiere, capocantiere, colore.
  // Senza `.default`: con il default zod il tipo in ingresso (kind facoltativo)
  // diverge da quello in uscita e react-hook-form rifiuta il resolver. Il
  // valore iniziale lo danno defaultValues/reset.
  kind: z.enum(["interna", "esterna"]),
  subappaltatore_id: z.string().nullable().optional(),
  leader_user_id: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export type ExternalTeamFormData = z.infer<typeof teamSchema>;

interface ExternalTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: {
    id: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    is_active: boolean;
    vat_rate: number;
    kind?: "interna" | "esterna";
    subappaltatore_id?: string | null;
    leader_user_id?: string | null;
    color?: string | null;
  } | null;
  onSave: (data: ExternalTeamFormData) => void;
  isSaving: boolean;
  /** Ditte con login (per «Accesso all'app cantiere»). Se assente, il campo non compare. */
  subappaltatori?: Array<{ id: string; ragione_sociale: string; user_email: string | null }>;
  /** Utenti dell'azienda (per il capocantiere delle squadre interne). */
  utenti?: Array<{ id: string; nome: string }>;
}

export function ExternalTeamDialog({
  open,
  onOpenChange,
  team,
  onSave,
  isSaving,
  subappaltatori,
  utenti,
}: ExternalTeamDialogProps) {
  const form = useForm<ExternalTeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      contact_name: "",
      phone: "",
      email: "",
      notes: "",
      is_active: true,
      vat_rate: 22,
      kind: "esterna",
      subappaltatore_id: null,
      leader_user_id: null,
      color: "#3b82f6",
    },
  });

  useEffect(() => {
    if (team) {
      form.reset({
        name: team.name,
        contact_name: team.contact_name || "",
        phone: team.phone || "",
        email: team.email || "",
        notes: team.notes || "",
        is_active: team.is_active,
        vat_rate: team.vat_rate ?? 22,
        kind: team.kind ?? "esterna",
        subappaltatore_id: team.subappaltatore_id ?? null,
        leader_user_id: team.leader_user_id ?? null,
        color: team.color ?? null,
      });
    } else {
      form.reset({
        name: "",
        contact_name: "",
        phone: "",
        email: "",
        notes: "",
        is_active: true,
        vat_rate: 22,
        kind: "esterna",
        subappaltatore_id: null,
        leader_user_id: null,
        color: "#3b82f6",
      });
    }
  }, [team, form]);

  const kind = form.watch("kind");

  const handleSubmit = (data: ExternalTeamFormData) => {
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {team ? "Modifica squadra" : "Nuova squadra"}
          </DialogTitle>
          <DialogDescription>
            {team
              ? "Modifica i dati della squadra"
              : "Una squadra di posa: interna o esterna, con il suo colore nel calendario"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Ditta/Squadra *</FormLabel>
                  <FormControl>
                    <Input placeholder={kind === "interna" ? "Squadra ristrutturazioni" : "ABC Installazioni Srl"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="esterna">Esterna (ditta)</SelectItem>
                        <SelectItem value="interna">Interna (dipendenti)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Colore nel calendario</FormLabel>
                    <FormControl>
                      <Input
                        type="color"
                        className="h-10 w-full p-1"
                        value={field.value ?? "#3b82f6"}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {kind === "esterna" && subappaltatori && (
              <FormField
                control={form.control}
                name="subappaltatore_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Accesso all&apos;app cantiere</FormLabel>
                    <Select
                      value={field.value ?? "__nessuno__"}
                      onValueChange={(v) => field.onChange(v === "__nessuno__" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Nessun accesso" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__nessuno__">Nessun accesso</SelectItem>
                        {subappaltatori.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.ragione_sociale}
                            {sub.user_email ? ` · ${sub.user_email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Con un accesso, la squadra vede le sue pose in /campo.</FormDescription>
                  </FormItem>
                )}
              />
            )}

            {kind === "interna" && utenti && (
              <FormField
                control={form.control}
                name="leader_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referente organizzativo</FormLabel>
                    <Select
                      value={field.value ?? "__nessuno__"}
                      onValueChange={(v) => field.onChange(v === "__nessuno__" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Nessuno" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__nessuno__">Nessuno</SelectItem>
                        {utenti.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>Questo riferimento non concede il ruolo di capocantiere nell'app Campo. La delega si gestisce sul singolo cantiere.</FormDescription>
                  </FormItem>
                )}
              />
            )}

            {kind === "interna" && <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">La squadra interna è composta da dipendenti. Dopo aver salvato l'anagrafica, apri «Dipendenti della squadra» in Calendari lavori per verificarne la composizione e la disponibilità del nuovo salvataggio.</p>}

            {kind === "esterna" && <FormField
              control={form.control}
              name="vat_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Regime IVA</FormLabel>
                  <Select
                    value={field.value.toString()}
                    onValueChange={(v) => field.onChange(parseInt(v))}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {VAT_RATES.map((rate) => (
                        <SelectItem key={rate.value} value={rate.value.toString()}>
                          {rate.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    0% per forfettari o reverse charge
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />}

            <FormField
              control={form.control}
              name="contact_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Referente</FormLabel>
                  <FormControl>
                    <Input placeholder="Mario Rossi" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="info@ditta.it" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input placeholder="+39 333 1234567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Note aggiuntive sulla squadra..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Squadra Attiva</FormLabel>
                    <FormDescription>
                      Le squadre inattive non sono selezionabili per nuovi ordini
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Salvataggio..." : team ? "Salva Modifiche" : "Crea Squadra"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
