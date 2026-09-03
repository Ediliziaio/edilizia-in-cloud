/**
 * "Abbina alle commesse" — le fatture arrivate da un gestionale esterno
 * (Fatture in Cloud, Aruba, il commercialista) non sanno a quale cantiere
 * appartengono, e finché non lo sanno la commessa non sa quanto ha incassato.
 *
 * Qui il programma propone, la persona decide. Ogni riga mostra i MOTIVI per
 * cui una commessa è stata proposta: chi conferma deve poter vedere su cosa si
 * basa la proposta, altrimenti sta solo timbrando quello che dice la macchina.
 *
 * Gli abbinamenti "certi e senza rivali" si possono confermare in blocco; tutti
 * gli altri uno per uno. Non c'è nessun percorso che attacchi una fattura a una
 * commessa senza che una persona l'abbia visto, tranne il codice commessa
 * scritto in fattura — che è una dichiarazione esplicita di chi l'ha emessa.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link2, CheckCheck, FileText } from "lucide-react";
import {
  riconcilia,
  type CommessaCandidata,
  type FatturaDaAbbinare,
  type Confidenza,
} from "@/lib/fatture/riconciliazione";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

interface RigaFattura extends FatturaDaAbbinare {
  numeroVisibile: string;
}

const COLORE_CONFIDENZA: Record<Confidenza, string> = {
  certa: "border-emerald-200 bg-emerald-50 text-emerald-700",
  probabile: "border-amber-200 bg-amber-50 text-amber-800",
  debole: "border-slate-200 bg-slate-50 text-slate-600",
};

const ETICHETTA_CONFIDENZA: Record<Confidenza, string> = {
  certa: "certa",
  probabile: "probabile",
  debole: "da verificare",
};

export function AbbinaFattureCommesseDialog({ open, onOpenChange, companyId }: Props) {
  const qc = useQueryClient();
  const [inCorso, setInCorso] = useState(false);
  /** Scelte fatte a mano nel menu, che vincono sulla proposta. */
  const [scelte, setScelte] = useState<Record<string, string>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fatture-da-abbinare", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      // Tre letture separate invece di embed annidati: sotto RLS l'embed fa
      // pagare il planning a ogni riga (lezione della Formazione).
      const [fattRes, ordRes, rateRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, number, notes, total, issue_date, client_id, client_email, client_vat_number, client_fiscal_code, client_company_name")
          .eq("company_id", companyId)
          .is("order_id", null)
          .order("issue_date", { ascending: false })
          .limit(200),
        supabase
          .from("orders")
          .select("id, order_code, description, customer_id, start_date, end_date")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .limit(500),
        supabase
          .from("order_installments")
          .select("id, order_id, label, amount, is_paid, invoice_id"),
      ]);
      if (fattRes.error) throw fattRes.error;
      if (ordRes.error) throw ordRes.error;

      type OrdRow = {
        id: string; order_code: string | null; description: string | null;
        customer_id: string | null; start_date: string | null; end_date: string | null;
      };
      const ordini = (ordRes.data ?? []) as unknown as OrdRow[];

      // Anagrafica del cliente di ogni commessa: serve a confrontarla con
      // l'intestatario della fattura (che vive su un'altra tabella).
      const idClienti = Array.from(new Set(ordini.map((o) => o.customer_id).filter((v): v is string => !!v)));
      const anagrafica = new Map<string, { email: string | null; cf: string | null; piva: string | null; nome: string | null }>();
      if (idClienti.length > 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id, email, fiscal_code, vat_number, first_name, last_name")
          .in("id", idClienti);
        ((prof ?? []) as unknown as Array<Record<string, string | null>>).forEach((p) => {
          anagrafica.set(p.id as string, {
            email: p.email ?? null,
            cf: p.fiscal_code ?? null,
            piva: p.vat_number ?? null,
            nome: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null,
          });
        });
      }

      const ratePerOrdine = new Map<string, CommessaCandidata["rate"]>();
      ((rateRes.data ?? []) as unknown as Array<{
        id: string; order_id: string; label: string; amount: number; is_paid: boolean; invoice_id: string | null;
      }>).forEach((r) => {
        const lista = ratePerOrdine.get(r.order_id) ?? [];
        lista.push({ id: r.id, label: r.label, amount: Number(r.amount), is_paid: r.is_paid, invoice_id: r.invoice_id });
        ratePerOrdine.set(r.order_id, lista);
      });

      const commesse: CommessaCandidata[] = ordini.map((o) => {
        const a = o.customer_id ? anagrafica.get(o.customer_id) : undefined;
        return {
          id: o.id,
          order_code: o.order_code,
          customerProfileId: o.customer_id,
          clienteEmail: a?.email ?? null,
          clientePiva: a?.piva ?? null,
          clienteCodiceFiscale: a?.cf ?? null,
          clienteRagioneSociale: a?.nome ?? null,
          dataInizio: o.start_date,
          dataFine: o.end_date,
          rate: ratePerOrdine.get(o.id) ?? [],
        };
      });

      const fatture: RigaFattura[] = ((fattRes.data ?? []) as unknown as Array<Record<string, unknown>>)
        .map((f) => ({
          id: f.id as string,
          numeroVisibile: (f.number as string) || "senza numero",
          numero: f.number as string | null,
          testo: (f.notes as string | null) ?? null,
          totale: Number(f.total ?? 0),
          data: (f.issue_date as string | null) ?? null,
          clientePiva: (f.client_vat_number as string | null) ?? null,
          clienteCodiceFiscale: (f.client_fiscal_code as string | null) ?? null,
          clienteEmail: (f.client_email as string | null) ?? null,
          clienteRagioneSociale: (f.client_company_name as string | null) ?? null,
        }));

      const etichetta = new Map(ordini.map((o) => [o.id, o.order_code || o.description?.slice(0, 40) || "commessa"]));
      return { fatture, commesse, etichetta };
    },
  });

  const proposte = useMemo(() => {
    if (!data) return [];
    return data.fatture.map((f) => ({ fattura: f, esito: riconcilia(f, data.commesse) }));
  }, [data]);

  const conProposta = proposte.filter((p) => p.esito.migliore);
  const automatiche = proposte.filter((p) => p.esito.agganciabileDaSolo);

  const abbina = async (
    fatturaId: string,
    commessaId: string,
    rataId: string | null,
    origine: "codice" | "cliente" | "importo" | "manuale",
  ) => {
    const { error } = await supabase
      .from("invoices")
      .update({ order_id: commessaId, order_match_origine: origine } as never)
      .eq("id", fatturaId)
      .eq("company_id", companyId);
    if (error) throw error;

    // La rata è il legame sugli IMPORTI: da lì in poi, quando la fattura
    // risulta pagata, la rata diventa incassata da sola e il flusso riparte.
    if (rataId) {
      const { error: errRata } = await supabase
        .from("order_installments")
        .update({ invoice_id: fatturaId } as never)
        .eq("id", rataId)
        .is("invoice_id", null);
      if (errRata) throw errRata;
    }
  };

  const abbinaUna = async (fatturaId: string, commessaId: string, rataId: string | null) => {
    setInCorso(true);
    try {
      await abbina(fatturaId, commessaId, rataId, "manuale");
      toast.success("Fattura collegata alla commessa.");
      await refetch();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      toast.error("Non riesco a collegare: " + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setInCorso(false);
    }
  };

  const abbinaTutteLeCerte = async () => {
    setInCorso(true);
    let fatte = 0;
    try {
      for (const p of automatiche) {
        const m = p.esito.migliore!;
        const origine = m.motivi.some((x) => x.codice === "codice_in_fattura") ? "codice" : "importo";
        await abbina(p.fattura.id, m.commessaId, m.rataId ?? null, origine);
        fatte++;
      }
      toast.success(`${fatte} fatture collegate.`);
      await refetch();
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      // Quelle già fatte restano fatte: si dice quante, per non far ripartire
      // l'utente da zero senza sapere a che punto si era.
      toast.error(`Collegate ${fatte}, poi errore: ` + (e instanceof Error ? e.message : "riprova"));
    } finally {
      setInCorso(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-orange-500" /> Abbina le fatture alle commesse
          </DialogTitle>
          <DialogDescription>
            Le fatture che arrivano dal gestionale esterno non dicono a quale cantiere appartengono.
            Qui trovi quelle ancora senza commessa, con la proposta e il motivo per cui è stata fatta.
            Confermi tu.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Caricamento…</p>
        ) : proposte.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Tutte le fatture hanno già la loro commessa.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {proposte.length} fatture senza commessa · {conProposta.length} con una proposta ·{" "}
                <span className="font-medium text-emerald-700">{automatiche.length} certe</span>
              </span>
              <Button size="sm" disabled={inCorso || automatiche.length === 0} onClick={abbinaTutteLeCerte}>
                <CheckCheck className="mr-1 h-4 w-4" />
                Conferma le {automatiche.length} certe
              </Button>
            </div>

            <div className="space-y-2">
              {proposte.map(({ fattura, esito }) => {
                const scelta = scelte[fattura.id] ?? esito.migliore?.commessaId ?? "";
                const candidato = esito.candidati.find((c) => c.commessaId === scelta) ?? esito.migliore;
                return (
                  <div key={fattura.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{fattura.numeroVisibile}</span>
                      <span className="text-sm text-muted-foreground">
                        {fattura.clienteRagioneSociale ?? "—"} ·{" "}
                        {fattura.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
                        {fattura.data ? ` · ${new Date(fattura.data).toLocaleDateString("it-IT")}` : ""}
                      </span>
                      {candidato && (
                        <Badge variant="outline" className={`ml-auto text-[10px] ${COLORE_CONFIDENZA[candidato.confidenza]}`}>
                          {ETICHETTA_CONFIDENZA[candidato.confidenza]}
                        </Badge>
                      )}
                    </div>

                    {esito.candidati.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nessuna commessa somigliante: va scelta a mano dalla scheda della fattura.
                      </p>
                    ) : (
                      <>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Commessa</span>
                          <Select
                            value={scelta}
                            onValueChange={(v) => setScelte((p) => ({ ...p, [fattura.id]: v }))}
                          >
                            <SelectTrigger className="h-8 w-[280px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {esito.candidati.map((c) => (
                                <SelectItem key={c.commessaId} value={c.commessaId}>
                                  {data?.etichetta.get(c.commessaId) ?? c.commessaId} · {ETICHETTA_CONFIDENZA[c.confidenza]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={inCorso || !scelta}
                            onClick={() => abbinaUna(fattura.id, scelta, candidato?.rataId ?? null)}
                          >
                            Collega
                          </Button>
                        </div>

                        {/* I motivi in chiaro: chi conferma deve vedere su cosa
                            si basa la proposta, non timbrare al buio. */}
                        {candidato && (
                          <ul className="mt-2 space-y-0.5 pl-1 text-[11px] text-muted-foreground">
                            {candidato.motivi.map((m) => (
                              <li key={m.codice}>· {m.testo}</li>
                            ))}
                            {candidato.rataId && (
                              <li className="text-emerald-700">
                                · Verrà legata alla rata: quando la fattura risulta pagata, la rata si segna incassata da sola.
                              </li>
                            )}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
