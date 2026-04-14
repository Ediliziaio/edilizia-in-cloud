import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Mail, MessageSquare, Bell } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  useCampaignsList,
  useCreateCampaign,
  type Campaign,
  type CreateCampaignPayload,
} from "@/hooks/superadmin/useCampaigns";

// ─── Configurazione badge stato ────────────────────────────

const configStatoCampagna: Record<
  Campaign["status"],
  { label: string; className: string }
> = {
  draft: { label: "Bozza", className: "bg-gray-100 text-gray-700 border-gray-200" },
  scheduled: { label: "Programmata", className: "bg-blue-100 text-blue-700 border-blue-200" },
  sending: { label: "In invio", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  sent: { label: "Inviata", className: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "Annullata", className: "bg-red-100 text-red-700 border-red-200" },
  failed: { label: "Fallita", className: "bg-red-100 text-red-700 border-red-200" },
};

// ─── Badge tipo campagna ───────────────────────────────────

function BadgeTipoCampagna({ tipo }: { tipo: Campaign["type"] }) {
  const icone: Record<Campaign["type"], React.ReactNode> = {
    email: <Mail className="h-3 w-3" />,
    sms: <MessageSquare className="h-3 w-3" />,
    push: <Bell className="h-3 w-3" />,
  };
  const label: Record<Campaign["type"], string> = {
    email: "Email",
    sms: "SMS",
    push: "Push",
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {icone[tipo]}
      {label[tipo]}
    </span>
  );
}

// ─── Stato iniziale wizard ─────────────────────────────────

interface FormWizard {
  nome: string;
  tipo: Campaign["type"];
  oggettoA: string;
  oggettoB: string;
  splitPct: number;
  bodyHtmlA: string;
  bodyHtmlB: string;
}

const FORM_VUOTO: FormWizard = {
  nome: "",
  tipo: "email",
  oggettoA: "",
  oggettoB: "",
  splitPct: 50,
  bodyHtmlA: "",
  bodyHtmlB: "",
};

// ─── Dialog creazione campagna ─────────────────────────────

interface DialogCreazioneCampagnaProps {
  aperto: boolean;
  onChiudi: () => void;
}

function DialogCreazioneCampagna({ aperto, onChiudi }: DialogCreazioneCampagnaProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState<FormWizard>(FORM_VUOTO);
  const { mutate: creaCampagna, isPending } = useCreateCampaign();

  const aggiorna = <K extends keyof FormWizard>(chiave: K, valore: FormWizard[K]) => {
    setForm(prev => ({ ...prev, [chiave]: valore }));
  };

  const handleChiudi = () => {
    setStep(1);
    setForm(FORM_VUOTO);
    onChiudi();
  };

  const handleCrea = () => {
    const splitB = 100 - form.splitPct;
    const payload: CreateCampaignPayload = {
      name: form.nome,
      type: form.tipo,
      variants: [
        {
          variant_name: "A",
          weight_pct: form.splitPct,
          subject: form.oggettoA,
          body_html: form.bodyHtmlA,
          body_text: form.bodyHtmlA.replace(/<[^>]+>/g, ""),
        },
        {
          variant_name: "B",
          weight_pct: splitB,
          subject: form.oggettoB,
          body_html: form.bodyHtmlB,
          body_text: form.bodyHtmlB.replace(/<[^>]+>/g, ""),
        },
      ],
    };
    creaCampagna(payload, { onSuccess: handleChiudi });
  };

  const step1Valido = form.nome.trim() && form.oggettoA.trim() && form.oggettoB.trim();

  return (
    <Dialog open={aperto} onOpenChange={chiudi => !chiudi && handleChiudi()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Nuova campagna — Step 1 di 2" : "Nuova campagna — Step 2 di 2"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="nome-campagna">Nome campagna</Label>
              <Input
                id="nome-campagna"
                placeholder="es. Newsletter aprile 2026"
                value={form.nome}
                onChange={e => aggiorna("nome", e.target.value)}
              />
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={v => aggiorna("tipo", v as Campaign["type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="push">Push notification</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Oggetto A */}
            <div className="space-y-1.5">
              <Label htmlFor="oggetto-a">Oggetto — Variante A</Label>
              <Input
                id="oggetto-a"
                placeholder="Oggetto email variante A"
                value={form.oggettoA}
                onChange={e => aggiorna("oggettoA", e.target.value)}
              />
            </div>

            {/* Oggetto B */}
            <div className="space-y-1.5">
              <Label htmlFor="oggetto-b">Oggetto — Variante B</Label>
              <Input
                id="oggetto-b"
                placeholder="Oggetto email variante B"
                value={form.oggettoB}
                onChange={e => aggiorna("oggettoB", e.target.value)}
              />
            </div>

            {/* Split */}
            <div className="space-y-1.5">
              <Label htmlFor="split-pct">
                % split variante A{" "}
                <span className="text-muted-foreground text-xs">
                  (B = {100 - form.splitPct}%)
                </span>
              </Label>
              <Input
                id="split-pct"
                type="number"
                min={1}
                max={99}
                value={form.splitPct}
                onChange={e =>
                  aggiorna("splitPct", Math.min(99, Math.max(1, parseInt(e.target.value, 10) || 50)))
                }
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            {/* Corpo A */}
            <div className="space-y-1.5">
              <Label htmlFor="body-a">Corpo HTML — Variante A</Label>
              <Textarea
                id="body-a"
                placeholder="<p>Contenuto variante A...</p>"
                rows={6}
                value={form.bodyHtmlA}
                onChange={e => aggiorna("bodyHtmlA", e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {/* Corpo B */}
            <div className="space-y-1.5">
              <Label htmlFor="body-b">Corpo HTML — Variante B</Label>
              <Textarea
                id="body-b"
                placeholder="<p>Contenuto variante B...</p>"
                rows={6}
                value={form.bodyHtmlB}
                onChange={e => aggiorna("bodyHtmlB", e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button variant="ghost" onClick={handleChiudi}>
                Annulla
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!step1Valido}
              >
                Avanti →
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Indietro
              </Button>
              <Button onClick={handleCrea} disabled={isPending}>
                {isPending ? "Creazione..." : "Crea Campagna"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pagina principale ─────────────────────────────────────

/** Pagina lista campagne con AB test */
export default function CampaignsPage() {
  const navigate = useNavigate();
  const { data: campagne = [], isLoading } = useCampaignsList();
  const [dialogAperto, setDialogAperto] = useState(false);

  return (
    <div className="space-y-4 md:space-y-6 p-3 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Campagne Email/SMS</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestisci e monitora le campagne con AB test
          </p>
        </div>
        <Button onClick={() => setDialogAperto(true)} className="self-end sm:self-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nuova Campagna
        </Button>
      </div>

      {/* Tabella campagne */}
      <div className="rounded-md border bg-background overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Destinatari</TableHead>
              <TableHead>Inviata il</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
              ))}

            {!isLoading && campagne.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-10"
                >
                  Nessuna campagna trovata. Crea la prima!
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              campagne.map(campagna => {
                const configStato = configStatoCampagna[campagna.status];
                return (
                  <TableRow
                    key={campagna.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate(`/admin/campagne/${campagna.id}/analytics`)
                    }
                  >
                    <TableCell className="font-medium">{campagna.name}</TableCell>
                    <TableCell>
                      <BadgeTipoCampagna tipo={campagna.type} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={configStato.className}
                      >
                        {configStato.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {campagna.total_recipients.toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell>
                      {campagna.sent_at
                        ? format(new Date(campagna.sent_at), "dd/MM/yyyy HH:mm", {
                            locale: it,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {campagna.variants.length} varianti
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog creazione */}
      <DialogCreazioneCampagna
        aperto={dialogAperto}
        onChiudi={() => setDialogAperto(false)}
      />
    </div>
  );
}
