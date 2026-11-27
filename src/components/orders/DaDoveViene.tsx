/**
 * DaDoveViene — il rendiconto e le giornate che l'hanno prodotto, affiancate.
 * ────────────────────────────────────────────────────────────────────────────
 * Si apre dal rendiconto di una commessa. A sinistra quello che andrà al
 * committente, a destra i rapportini giorno per giorno: chi c'era e quante ore,
 * i mezzi, le voci scritte in cantiere, e la descrizione dei lavori — che nei
 * dati veri è l'unica cosa sempre presente ed è quella che spiega al
 * committente cosa si è fatto («carico a …, scarico a … con gru»).
 *
 * Il confronto col listino non si calcola qui: `prezzo_fonte`,
 * `vendita_proposta` e `prezzo_a_mano` sono già scritti sulla voce da quando è
 * nata. Il pannello li mostra, così non può raccontare una cosa diversa da
 * quella salvata.
 *
 * Gli avvisi servono a non fatturare una sciocchezza: un prezzo di vendita
 * pari a 1,00 è quasi sempre il campo obbligatorio compilato per uscire dalla
 * schermata (47 voci su 137 alla prima misura), e una riga senza costo rende il
 * margine impossibile, non pari all'incasso.
 *
 * Lotti 3 e 4 di docs/piano-rendiconto-da-rapportini-verifica.md (27/11/2026).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Loader2, Truck, Users, FileText, Receipt, Pencil, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseDecimalITStrict, formatDecimalIT } from "@/lib/parseDecimalIT";
import { euro } from "@/lib/clienti/schedaCliente";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/* ─── Tipi: la forma che restituisce rendiconto_provenienza ─────────── */

interface Persona { nome: string; ore: number | null }
interface Mezzo { mezzo_id: string | null; nome: string; ore: number | null }

interface Voce {
  id: string;
  descrizione: string;
  quantita: number;
  unita: string;
  vendita_unitaria: number | null;
  vendita_proposta: number | null;
  prezzo_fonte: string | null;
  prezzo_a_mano: boolean;
  al_listino: boolean;
  costo_unitario: number | null;
  rendicontata: boolean;
}

interface RigaNata {
  id: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  prezzo_unitario: number;
  importo: number | null;
  stato: string;
  da_voce: boolean;
  da_mezzo: boolean;
  costo_interno: number | null;
}

interface Giornata {
  rapportino_id: string;
  data_lavoro: string;
  descrizione_lavori: string | null;
  persone: Persona[];
  mezzi: Mezzo[];
  voci: Voce[];
  righe: RigaNata[];
}

interface Props {
  orderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  puoModificare: boolean;
  vedeCosti: boolean;
}

/* ─── Aiuti ────────────────────────────────────────────────────────── */

const giornoLungoIT = (iso: string) => {
  const [a, m, g] = iso.split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

/** Un prezzo a 1,00 o a zero non è un prezzo: è un campo compilato per forza. */
const prezzoSospetto = (v: Voce) =>
  v.vendita_unitaria == null || v.vendita_unitaria <= 1;

const scostaDalListino = (v: Voce) =>
  v.vendita_proposta != null &&
  v.vendita_unitaria != null &&
  Math.abs(v.vendita_unitaria - v.vendita_proposta) > 0.004;

const etichettaFonte = (f: string | null) =>
  f === "committente" ? "listino del committente"
    : f === "generale" ? "listino generale"
      : f === "prodotto" ? "listino prodotti"
        : null;

/* ─── Componente ───────────────────────────────────────────────────── */

export function DaDoveViene({ orderId, open, onOpenChange, puoModificare, vedeCosti }: Props) {
  const tr = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [correggi, setCorreggi] = useState<Voce | null>(null);
  const [prezzoGrezzo, setPrezzoGrezzo] = useState("");
  const [costoGrezzo, setCostoGrezzo] = useState("");

  const giornate = useQuery({
    queryKey: ["rendiconto-provenienza", orderId],
    enabled: open,
    queryFn: async (): Promise<Giornata[]> => {
      const { data, error } = await (supabase as any).rpc("rendiconto_provenienza", {
        p_order_id: orderId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as Giornata[];
    },
  });

  const salvaPrezzo = useMutation({
    mutationFn: async (v: Voce) => {
      const prezzo = parseDecimalITStrict(prezzoGrezzo);
      if (!Number.isFinite(prezzo) || prezzo < 0) {
        throw new Error(tr("Scrivi un prezzo valido, zero o più."));
      }
      const costo = costoGrezzo.trim() ? parseDecimalITStrict(costoGrezzo) : null;
      if (costo !== null && (!Number.isFinite(costo) || costo < 0)) {
        throw new Error(tr("Il costo deve essere zero o più."));
      }
      const { error } = await (supabase as any).rpc("rapportino_voce_prezzo", {
        p_voce_id: v.id, p_vendita: prezzo, p_costo: costo,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setCorreggi(null); setPrezzoGrezzo(""); setCostoGrezzo("");
      queryClient.invalidateQueries({ queryKey: ["rendiconto-provenienza", orderId] });
      queryClient.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
      queryClient.invalidateQueries({ queryKey: ["rapportini-da-rendicontare", orderId] });
      toast({ title: tr("Prezzo corretto") });
    },
    onError: (e: unknown) =>
      toast({
        title: tr("Non corretto"),
        description: e instanceof Error ? e.message : tr("Riprova"),
        variant: "destructive",
      }),
  });

  /** Gli avvisi di tutta la commessa, contati una volta. */
  const avvisi = useMemo(() => {
    const g = giornate.data ?? [];
    const voci = g.flatMap((x) => x.voci);
    return {
      senzaPrezzo: voci.filter(prezzoSospetto).length,
      senzaCosto: vedeCosti ? voci.filter((v) => v.costo_unitario == null).length : 0,
      aMano: voci.filter(scostaDalListino).length,
      fuoriListino: voci.filter((v) => !v.al_listino).length,
      daRendicontare: voci.filter((v) => !v.rendicontata).length,
      totaleRighe: g.flatMap((x) => x.righe).reduce((s, r) => s + Number(r.importo ?? 0), 0),
    };
  }, [giornate.data, vedeCosti]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-6 pr-12 text-left">
            <SheetTitle className="text-lg leading-snug">{tr("Da dove viene")}</SheetTitle>
            <SheetDescription>
              {tr("Le giornate approvate di questa commessa, e cosa ne è diventato un importo.")}
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {giornate.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : giornate.isError ? (
              <p className="text-sm text-destructive">
                {giornate.error instanceof Error ? giornate.error.message : tr("Non si riesce a leggere le giornate.")}
              </p>
            ) : (giornate.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">
                {tr("Nessun rapportino approvato su questa commessa. Il rendiconto si scrive a mano.")}
              </p>
            ) : (
              <div className="space-y-4">
                {/* Gli avvisi, in testa: è quello che non si deve fatturare a occhi chiusi. */}
                {(avvisi.senzaPrezzo > 0 || avvisi.senzaCosto > 0 || avvisi.aMano > 0) && (
                  <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                      <AlertTriangle className="h-3.5 w-3.5" /> {tr("Da controllare prima di fatturare")}
                    </p>
                    {avvisi.senzaPrezzo > 0 && (
                      <p className="text-xs text-amber-900">
                        {tr("{n} voci con prezzo a zero o a 1,00: quasi sempre vuol dire che il prezzo non è stato inserito.", { n: avvisi.senzaPrezzo })}
                      </p>
                    )}
                    {avvisi.senzaCosto > 0 && (
                      <p className="text-xs text-amber-900">
                        {tr("{n} voci senza costo: il margine resta vuoto, non pari all'incasso.", { n: avvisi.senzaCosto })}
                      </p>
                    )}
                    {avvisi.aMano > 0 && (
                      <p className="text-xs text-amber-900">
                        {tr("{n} voci con un prezzo diverso da quello del listino.", { n: avvisi.aMano })}
                      </p>
                    )}
                  </div>
                )}

                {/* Il riepilogo secco */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Riquadro t={tr("Giornate")} v={String((giornate.data ?? []).length)} />
                  <Riquadro t={tr("Già rendicontato")} v={euro(avvisi.totaleRighe, true)} forte />
                  <Riquadro
                    t={tr("Voci da rendicontare")}
                    v={String(avvisi.daRendicontare)}
                    nota={avvisi.fuoriListino > 0 ? tr("{n} fuori listino", { n: avvisi.fuoriListino }) : undefined}
                  />
                </div>

                {/* Le giornate */}
                {(giornate.data ?? []).map((g) => (
                  <div key={g.rapportino_id} className="rounded-xl border bg-white p-3">
                    <p className="text-sm font-semibold text-slate-900">{giornoLungoIT(g.data_lavoro)}</p>

                    {g.descrizione_lavori && (
                      <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{g.descrizione_lavori}</p>
                    )}

                    {/* Chi c'era, e con cosa */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
                      {g.persone.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3 text-slate-400" />
                          {g.persone.map((p) => `${p.nome}${p.ore != null ? ` ${formatDecimalIT(p.ore, { minDecimals: 0, maxDecimals: 2 })} h` : ""}`).join(", ")}
                        </span>
                      )}
                      {g.mezzi.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Truck className="h-3 w-3 text-slate-400" />
                          {g.mezzi.map((m) => `${m.nome}${m.ore != null ? ` ${formatDecimalIT(m.ore, { minDecimals: 0, maxDecimals: 2 })} h` : ""}`).join(", ")}
                        </span>
                      )}
                    </div>

                    {/* Le voci scritte in cantiere, col confronto col listino */}
                    {g.voci.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <FileText className="h-3 w-3" /> {tr("Voci del rapportino")}
                        </p>
                        <div className="space-y-1.5">
                          {g.voci.map((v) => (
                            <div
                              key={v.id}
                              className={cn(
                                "rounded-lg border p-2",
                                prezzoSospetto(v) ? "border-destructive/40 bg-destructive/5" : "border-slate-200",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-900">{v.descrizione}</p>
                                  <p className="text-xs tabular-nums text-slate-600">
                                    {formatDecimalIT(v.quantita, { minDecimals: 0, maxDecimals: 2 })} {v.unita}
                                    {" × "}
                                    {v.vendita_unitaria != null ? euro(v.vendita_unitaria, true) : tr("da definire")}
                                    {v.vendita_unitaria != null && (
                                      <strong className="ml-1">
                                        = {euro(v.quantita * v.vendita_unitaria, true)}
                                      </strong>
                                    )}
                                  </p>
                                  {/* Il confronto col listino: non un calcolo, quello che c'è scritto. */}
                                  {scostaDalListino(v) && (
                                    <p className="text-xs text-amber-800">
                                      {tr("Listino {proposto}, applicato {applicato}", {
                                        proposto: euro(v.vendita_proposta!, true),
                                        applicato: euro(v.vendita_unitaria!, true),
                                      })}
                                      {etichettaFonte(v.prezzo_fonte) ? ` · ${tr(etichettaFonte(v.prezzo_fonte)!)}` : ""}
                                    </p>
                                  )}
                                  {prezzoSospetto(v) && (
                                    <p className="text-xs font-medium text-destructive">
                                      {tr("Prezzo probabilmente non inserito.")}
                                    </p>
                                  )}
                                  {vedeCosti && v.costo_unitario == null && (
                                    <p className="text-xs text-slate-500">{tr("Costo non indicato: margine non calcolabile.")}</p>
                                  )}
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {!v.al_listino && (
                                      <Badge variant="outline" className="text-[10px]">{tr("fuori listino")}</Badge>
                                    )}
                                    {v.prezzo_a_mano && (
                                      <Badge variant="outline" className="text-[10px]">{tr("prezzo a mano")}</Badge>
                                    )}
                                    {v.rendicontata
                                      ? <Badge variant="outline" className="border-emerald-300 text-[10px] text-emerald-700">{tr("rendicontata")}</Badge>
                                      : <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-800">{tr("da rendicontare")}</Badge>}
                                  </div>
                                </div>
                                {puoModificare && (
                                  <Button
                                    variant="ghost" size="icon" className="shrink-0"
                                    aria-label={tr("Correggi il prezzo")}
                                    onClick={() => {
                                      setCorreggi(v);
                                      setPrezzoGrezzo(v.vendita_unitaria != null ? formatDecimalIT(v.vendita_unitaria) : "");
                                      setCostoGrezzo(v.costo_unitario != null ? formatDecimalIT(v.costo_unitario) : "");
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cosa è già diventato un importo */}
                    {g.righe.length > 0 && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-2">
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          <Receipt className="h-3 w-3" /> {tr("Nel rendiconto")}
                        </p>
                        {g.righe.map((r) => (
                          <p key={r.id} className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="min-w-0 truncate text-slate-700">
                              {r.descrizione}
                              <span className="ml-1 text-slate-400">
                                {formatDecimalIT(r.quantita, { minDecimals: 0, maxDecimals: 2 })} {r.unita_misura}
                                {r.da_mezzo ? ` · ${tr("mezzo")}` : r.da_voce ? ` · ${tr("voce")}` : ` · ${tr("ore")}`}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                              {euro(Number(r.importo ?? 0), true)}
                              {r.stato !== "bozza" && <CheckCircle2 className="ml-1 inline h-3 w-3 text-emerald-600" />}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Correzione del prezzo di una voce ─── */}
      <Dialog open={!!correggi} onOpenChange={(o) => !o && setCorreggi(null)}>
        <DialogContent ampiezza="modulo">
          <DialogHeader>
            <DialogTitle>{tr("Correggi il prezzo")}</DialogTitle>
            <DialogDescription>
              {correggi
                ? tr("{descrizione} — {quantita} {unita}. Cambia il prezzo di questa voce del rapportino, e con esso la riga di rendiconto. Ore, presenze e lavori descritti non si toccano.", {
                    descrizione: correggi.descrizione,
                    quantita: formatDecimalIT(correggi.quantita, { minDecimals: 0, maxDecimals: 2 }),
                    unita: correggi.unita,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          {correggi && (
            <div className="space-y-3">
              {correggi.vendita_proposta != null && (
                <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                  {tr("Il listino dice {prezzo}", { prezzo: euro(correggi.vendita_proposta, true) })}
                  {etichettaFonte(correggi.prezzo_fonte) ? ` (${tr(etichettaFonte(correggi.prezzo_fonte)!)})` : ""}
                </p>
              )}
              <div>
                <Label htmlFor="v-prezzo">{tr("Prezzo di vendita")}</Label>
                <Input
                  id="v-prezzo" inputMode="decimal" value={prezzoGrezzo}
                  onChange={(e) => setPrezzoGrezzo(e.target.value)}
                  placeholder="48,00"
                />
              </div>
              {vedeCosti && (
                <div>
                  <Label htmlFor="v-costo">{tr("Costo tuo, al pezzo (facoltativo)")}</Label>
                  <Input
                    id="v-costo" inputMode="decimal" value={costoGrezzo}
                    onChange={(e) => setCostoGrezzo(e.target.value)}
                    placeholder="0,00"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {tr("Senza costo il margine resta vuoto, invece di sembrare pari all'incasso.")}
                  </p>
                </div>
              )}
              {correggi.rendicontata && (
                <p className="text-[11px] text-amber-700">
                  {tr("La riga di rendiconto di questa voce si riscrive col prezzo nuovo.")}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorreggi(null)}>{tr("Annulla")}</Button>
            <Button
              disabled={salvaPrezzo.isPending}
              onClick={() => correggi && salvaPrezzo.mutate(correggi)}
            >
              {salvaPrezzo.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {tr("Salva")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Riquadro({ t, v, nota, forte }: { t: string; v: string; nota?: string; forte?: boolean }) {
  return (
    <div className="rounded-lg border bg-white p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t}</p>
      <p className={cn("tabular-nums", forte ? "text-base font-bold text-slate-900" : "text-sm font-semibold text-slate-800")}>{v}</p>
      {nota && <p className="text-[10px] text-slate-500">{nota}</p>}
    </div>
  );
}

export default DaDoveViene;
