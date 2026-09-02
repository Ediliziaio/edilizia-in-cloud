/**
 * BloccaPrezzoCard — i versamenti che bloccano il listino.
 *
 * Il cliente firma un blocca prezzo e versa una somma con bonifico ORDINARIO
 * (causale "blocca prezzo"). Quella somma non è un acconto lavori: prima che
 * partano i bonifici parlanti va restituita, altrimenti su quell'importo la
 * detrazione salta. Qui si registra, si segna la restituzione e si viene
 * avvisati se il saldo arriva prima.
 *
 * Non tocca il totale contratto né il piano rate: sta di proposito fuori.
 * Compare solo se l'azienda ha acceso "Blocca prezzo" in Impostazioni.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, Trash2, TriangleAlert, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/formatters";
import { parseDecimalIT } from "@/lib/parseDecimalIT";
import { useBonusFiscaliFlags } from "@/hooks/useBonusFiscaliFlags";
import {
  type BloccaPrezzo,
  type BloccaPrezzoStato,
  type BloccaPrezzoMetodo,
  STATI_BLOCCA_PREZZO,
  METODI_BLOCCA_PREZZO,
  parseBloccaPrezzo,
  serializeBloccaPrezzo,
  daRestituire,
  avvisiBloccaPrezzo,
} from "@/lib/orders/bloccaPrezzo";

interface Props {
  /** Almeno uno dei due: il versamento può nascere sul preventivo o sulla commessa. */
  orderId?: string | null;
  quoteId?: string | null;
  customerId?: string | null;
  hasBuildingBonus?: boolean;
  /** Il saldo della commessa risulta già incassato: caso peggiore per un blocca prezzo aperto. */
  saldoPagato?: boolean;
  readOnly?: boolean;
}

const oggiLocale = () => new Date().toLocaleDateString("en-CA");

export function BloccaPrezzoCard({
  orderId,
  quoteId,
  customerId,
  hasBuildingBonus = false,
  saldoPagato = false,
  readOnly = false,
}: Props) {
  const { effectiveCompany } = useAuth();
  const { bloccaPrezzo: attivo } = useBonusFiscaliFlags();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [apertoForm, setApertoForm] = useState(false);
  const [nuovoImporto, setNuovoImporto] = useState("");
  const [nuovaData, setNuovaData] = useState(oggiLocale());
  const [nuovoMetodo, setNuovoMetodo] = useState<BloccaPrezzoMetodo>("bonifico_ordinario");
  const [nuovaNota, setNuovaNota] = useState("");

  const chiave = ["blocca-prezzo", orderId ?? null, quoteId ?? null] as const;

  const { data: righe = [] } = useQuery({
    queryKey: chiave,
    enabled: attivo && (!!orderId || !!quoteId),
    queryFn: async (): Promise<BloccaPrezzo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("blocca_prezzo").select("*");
      q = orderId ? q.eq("order_id", orderId) : q.eq("quote_id", quoteId!);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return parseBloccaPrezzo(data);
    },
  });

  const invalida = () => queryClient.invalidateQueries({ queryKey: chiave });

  const aggiungi = useMutation({
    mutationFn: async () => {
      const importo = parseDecimalIT(nuovoImporto);
      if (!(importo > 0)) throw new Error("Inserisci un importo maggiore di zero.");
      if (!effectiveCompany?.id) throw new Error("Azienda non trovata.");
      const payload = serializeBloccaPrezzo({
        companyId: effectiveCompany.id,
        customerId: customerId ?? null,
        orderId: orderId ?? null,
        quoteId: quoteId ?? null,
        importo,
        dataIncasso: nuovaData || oggiLocale(),
        metodo: nuovoMetodo,
        stato: "incassato",
        note: nuovaNota || null,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("blocca_prezzo").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blocca prezzo registrato");
      setApertoForm(false);
      setNuovoImporto("");
      setNuovaNota("");
      setNuovaData(oggiLocale());
      invalida();
    },
    onError: (e) =>
      toast.error("Registrazione non riuscita", {
        description: e instanceof Error ? e.message : "Riprova.",
      }),
  });

  const cambiaStato = useMutation({
    mutationFn: async ({ riga, stato }: { riga: BloccaPrezzo; stato: BloccaPrezzoStato }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("blocca_prezzo")
        .update({
          stato,
          // Il vincolo DB pretende una data sull'esito: se manca è oggi.
          data_esito: stato === "incassato" ? null : riga.dataEsito || oggiLocale(),
        })
        .eq("id", riga.id!);
      if (error) throw error;
    },
    onSuccess: () => {
      invalida();
      toast.success("Stato aggiornato");
    },
    onError: (e) =>
      toast.error("Aggiornamento non riuscito", {
        description: e instanceof Error ? e.message : "Riprova.",
      }),
  });

  const aggiornaCampo = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("blocca_prezzo").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalida(),
    onError: () => toast.error("Modifica non salvata"),
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("blocca_prezzo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Versamento eliminato");
      invalida();
    },
    onError: () => toast.error("Eliminazione non riuscita"),
  });

  const chiediEdElimina = async (riga: BloccaPrezzo) => {
    const ok = await confirm({
      title: "Eliminare il versamento?",
      description: `Verrà cancellato il blocca prezzo di ${formatCurrency(riga.importo)}. L'operazione non è reversibile.`,
      confirmLabel: "Elimina",
    });
    if (ok && riga.id) elimina.mutate(riga.id);
  };

  if (!attivo) return null;

  const aperto = daRestituire(righe);
  const avvisi = avvisiBloccaPrezzo(righe, { hasBuildingBonus, saldoPagato });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-sky-600" />
              Blocca prezzo
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Somme versate per bloccare il listino. Non fanno parte del contratto: vanno restituite
              prima dei bonifici parlanti.
            </p>
          </div>
          {aperto > 0 && (
            <Badge variant="destructive" className="shrink-0 tabular-nums">
              Da restituire {formatCurrency(aperto)}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {avvisi.map((a) => (
          <p
            key={a.testo}
            className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] leading-relaxed ${
              a.livello === "grave"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : a.livello === "attenzione"
                  ? "border-amber-300 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200"
                  : "border-border bg-muted/40 text-muted-foreground"
            }`}
          >
            {a.livello === "info" ? (
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            {a.testo}
          </p>
        ))}

        {righe.length === 0 && (
          <p className="text-xs text-muted-foreground">Nessun blocca prezzo registrato.</p>
        )}

        {righe.map((riga) => (
          <div key={riga.id} className="rounded-md border p-2.5 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(riga.importo)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {riga.dataIncasso
                    ? new Date(riga.dataIncasso).toLocaleDateString("it-IT")
                    : "data non indicata"}{" "}
                  · {METODI_BLOCCA_PREZZO.find((m) => m.value === riga.metodo)?.label ?? riga.metodo}
                </p>
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => chiediEdElimina(riga)}
                  aria-label="Elimina versamento"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={riga.stato}
                onValueChange={(v) => cambiaStato.mutate({ riga, stato: v as BloccaPrezzoStato })}
                disabled={readOnly || cambiaStato.isPending}
              >
                <SelectTrigger className="h-8 text-xs sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATI_BLOCCA_PREZZO.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {riga.stato !== "incassato" && (
                <>
                  <Input
                    type="date"
                    value={riga.dataEsito ?? ""}
                    onChange={(e) =>
                      riga.id &&
                      aggiornaCampo.mutate({
                        id: riga.id,
                        patch: { data_esito: e.target.value || oggiLocale() },
                      })
                    }
                    className="h-8 text-xs sm:w-40"
                    disabled={readOnly}
                  />
                  {/* Salvataggio al blur: onChange avrebbe fatto una UPDATE
                      per ogni tasto premuto. */}
                  <Input
                    defaultValue={riga.riferimento ?? ""}
                    key={`rif-${riga.id}-${riga.riferimento ?? ""}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!riga.id || v === (riga.riferimento ?? "")) return;
                      aggiornaCampo.mutate({ id: riga.id, patch: { riferimento: v || null } });
                    }}
                    placeholder="CRO / riferimento"
                    className="h-8 text-xs flex-1"
                    disabled={readOnly}
                  />
                </>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground">
              {STATI_BLOCCA_PREZZO.find((s) => s.value === riga.stato)?.hint}
            </p>
            {riga.note && <p className="text-[11px] text-muted-foreground">{riga.note}</p>}
          </div>
        ))}

        {!readOnly && !apertoForm && (
          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setApertoForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Registra blocca prezzo
          </Button>
        )}

        {!readOnly && apertoForm && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Importo</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  <Input
                    inputMode="decimal"
                    value={nuovoImporto}
                    onChange={(e) => setNuovoImporto(e.target.value)}
                    placeholder="0,00"
                    className="h-9 pl-5 tabular-nums"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Data incasso</Label>
                <Input
                  type="date"
                  value={nuovaData}
                  onChange={(e) => setNuovaData(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Come è arrivato</Label>
                <Select value={nuovoMetodo} onValueChange={(v) => setNuovoMetodo(v as BloccaPrezzoMetodo)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODI_BLOCCA_PREZZO.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Note (facoltative)</Label>
              <Input
                value={nuovaNota}
                onChange={(e) => setNuovaNota(e.target.value)}
                placeholder="Es. blocco listino fino al 31/12"
                className="h-9 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Il cliente deve versare con bonifico <strong>ordinario</strong>, causale "blocca prezzo":
              con un parlante la banca tratterrebbe l'11% e l'importo non sarebbe più detraibile.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={() => aggiungi.mutate()}
                disabled={aggiungi.isPending}
              >
                {aggiungi.isPending ? "Salvataggio…" : "Registra"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => setApertoForm(false)}
              >
                Annulla
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
