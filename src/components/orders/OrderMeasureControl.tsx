import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler, CheckCircle2, AlertTriangle, Pencil, Settings2, Loader2 } from "lucide-react";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { confermaMisure, impostaSfridoRiga, salvaImpostazioniMisure, salvaMisureRiga } from "@/lib/api/surveys";
import {
  formaDellaRiga, misureInTesto, NOME_ASSE, NOME_TIPO_MISURA, numeroMisura, scartoDellaRiga, valoreAsse,
  type AsseMisura, type FormaMisura, type TipoMisura,
} from "@/lib/surveys/misureRilievo";

/**
 * OrderMeasureControl — "Controllo misure" della commessa.
 *
 * Solo gli articoli su misura (measure_status valorizzato): provvisoria, rilevata e da
 * ordinare, una accanto all'altra. Da rilevare → rilevata → confermata, una per una o
 * tutte insieme, per chi può validare i materiali. Alla conferma nasce la misura che legge
 * il fornitore, col gioco di posa sempre scritto. Commesse senza su misura: non si vede niente.
 */

type MeasureMap = Record<string, number>;
type Variance = Record<string, { prev: number | null; def: number | null; delta: number | null }>;

interface MeasureItem {
  id: string;
  name: string;
  riferimento: string | null;
  quantity: number | null;
  unita_misura: string | null;
  sfrido: number | null;
  purchase_price: number | null;
  costo_stimato_iniziale: number | null;
  misure_preventivo: MeasureMap | null;
  misure_rilevate: MeasureMap | null;
  misure_da_ordinare: MeasureMap | null;
  measure_status: "da_rilevare" | "rilevato" | "confermato" | null;
  measure_variance: Variance | null;
  misura_tipo: TipoMisura | null;
  misura_forma: FormaMisura | null;
  gioco_posa_mm: number | null;
}

const COLONNE =
  "id, name, riferimento, quantity, unita_misura, sfrido, purchase_price, costo_stimato_iniziale, misure_preventivo, misure_rilevate, misure_da_ordinare, measure_status, measure_variance, misura_tipo, misura_forma, gioco_posa_mm";

const STATUS: Record<string, { label: string; color: string }> = {
  da_rilevare: { label: "Da rilevare", color: "bg-amber-100 text-amber-700 border-amber-300" },
  rilevato: { label: "Rilevata", color: "bg-blue-100 text-blue-700 border-blue-300" },
  confermato: { label: "Confermata", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
};

const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

function assiDellaForma(forma: FormaMisura): AsseMisura[] {
  if (forma === "LxH") return ["larghezza_mm", "altezza_mm"];
  if (forma === "LxPxH") return ["larghezza_mm", "profondita_mm", "altezza_mm"];
  return ["quantita"];
}

export function OrderMeasureControl({ orderId, onProponiVariante }: { orderId: string; onProponiVariante?: () => void }) {
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const { canValidateBom, canEditOrders, canViewCosts, solaLettura } = usePermissions();
  const puoConfermare = canValidateBom && !solaLettura;
  const puoScrivere = (canEditOrders || canValidateBom) && !solaLettura;

  const [editing, setEditing] = useState<MeasureItem | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [tipo, setTipo] = useState<TipoMisura | "">("");
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  const [impostazioni, setImpostazioni] = useState<{ gioco: string; soglia: string } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: items } = useQuery({
    queryKey: ["order-measure-items", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<MeasureItem[]> => {
      const { data, error } = await sb
        .from("order_items")
        .select(COLONNE)
        .eq("order_id", orderId)
        .not("measure_status", "is", null)
        .is("diviso_da", null)
        .order("position");
      if (error) throw error;
      return (data ?? []) as MeasureItem[];
    },
  });

  const { data: regole } = useQuery({
    queryKey: ["misure-impostazioni", companyId],
    enabled: !!companyId && !!items?.length,
    queryFn: async () => {
      const { data } = await sb
        .from("company_fasi_settings")
        .select("misure_gioco_posa_mm, misure_soglia_scarto_mm")
        .eq("company_id", companyId)
        .maybeSingle();
      return {
        gioco: Number(data?.misure_gioco_posa_mm ?? 0),
        soglia: Number(data?.misure_soglia_scarto_mm ?? 5),
      };
    },
  });
  const gioco = regole?.gioco ?? 0;
  const soglia = regole?.soglia ?? 5;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["order-measure-items", orderId] });
    qc.invalidateQueries({ queryKey: ["order-items", orderId] });
  };

  const save = useMutation({
    mutationFn: async (p: { item: MeasureItem; def: MeasureMap; confirm: boolean }) => {
      await salvaMisureRiga(p.item.id, p.def, tipo || null, formaDellaRiga(p.item));
      if (p.confirm) await confermaMisure(orderId, [p.item.id]);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Misure aggiornate");
      setEditing(null);
    },
    onError: (e) => toast.error((e as Error).message || "Misure non salvate"),
  });

  // isPending arriva dopo il render: il secondo clic di un doppio clic non lo vedrebbe.
  const confermaInCorso = useRef(false);
  const conferma = useMutation({
    mutationFn: (righe: string[]) => confermaMisure(orderId, righe),
    onSuccess: (esito) => {
      invalidate();
      setSelezione(new Set());
      toast.success(esito.confermate === 1 ? "1 misura confermata" : `${esito.confermate} misure confermate`);
      if (esito.scarti.some((s) => s.con_ordine)) {
        toast.warning("Una posizione oltre soglia è già in un ordine: il costo non è cambiato, avvisa il fornitore.");
      }
    },
    onError: (e) => toast.error((e as Error).message || "Misure non confermate"),
    onSettled: () => { confermaInCorso.current = false; },
  });
  const confermaUnaVolta = (righe: string[]) => {
    if (confermaInCorso.current) return;
    confermaInCorso.current = true;
    conferma.mutate(righe);
  };

  const sfrido = useMutation({
    mutationFn: (p: { id: string; valore: number }) => impostaSfridoRiga(p.id, p.valore),
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message || "Sfrido non salvato"),
  });

  const salvaRegole = useMutation({
    mutationFn: (p: { gioco: number; soglia: number }) => salvaImpostazioniMisure(companyId!, p.gioco, p.soglia),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["misure-impostazioni", companyId] });
      setImpostazioni(null);
      toast.success("Gioco di posa e soglia salvati. Valgono dalle prossime conferme.");
    },
    onError: (e) => toast.error((e as Error).message || "Impostazioni non salvate"),
  });

  if (!items || items.length === 0) return null; // nessun articolo su misura → niente rumore

  const openEdit = (item: MeasureItem) => {
    const base = item.misure_rilevate ?? item.misure_preventivo ?? {};
    setDraft(Object.fromEntries(assiDellaForma(formaDellaRiga(item)).map((a) => {
      const v = valoreAsse(base, a) ?? (a === "quantita" ? item.quantity : null);
      return [a, v != null ? String(v) : ""];
    })));
    setTipo(item.misura_tipo ?? "");
    setEditing(item);
  };

  const pulito = (): MeasureMap =>
    Object.fromEntries(Object.entries(draft).flatMap(([k, v]) => {
      const n = numeroMisura(v);
      return n == null ? [] : [[k, n]];
    }));

  const daConfermare = items.filter((i) => i.measure_status === "rilevato");
  const selezionate = daConfermare.filter((i) => selezione.has(i.id)).map((i) => i.id);
  const oltreSoglia = items.filter((i) => scartoDellaRiga(i.measure_variance, soglia).oltreSoglia);
  const fatte = items.filter((i) => i.measure_status === "confermato").length;
  const assiEdit = editing ? assiDellaForma(formaDellaRiga(editing)) : [];
  const draftCompleto = assiEdit.length > 0 && assiEdit.every((a) => numeroMisura(draft[a]) != null);

  const scegli = (id: string, si: boolean) =>
    setSelezione((s) => {
      const n = new Set(s);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });

  return (
    <Card>
      <CardHeader className="space-y-2 max-sm:p-3 max-sm:pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Controllo misure
            <span className="text-xs font-normal text-muted-foreground">{fatte} di {items.length} confermate</span>
          </CardTitle>
          {puoConfermare && daConfermare.length > 0 && (
            <Button
              size="sm"
              className="min-h-11"
              disabled={conferma.isPending}
              onClick={() => confermaUnaVolta(selezionate.length ? selezionate : daConfermare.map((i) => i.id))}
            >
              {conferma.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              Conferma {selezionate.length || daConfermare.length} {(selezionate.length || daConfermare.length) === 1 ? "misura" : "misure"}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-2 py-1.5 text-xs">
          <span>Gioco di posa: <strong className="tabular-nums">{gioco} mm</strong> <span className="text-muted-foreground">(tolto dalle misure foro)</span></span>
          <span>Soglia scarto: <strong className="tabular-nums">{soglia} mm</strong></span>
          {puoConfermare && (
            <Button variant="ghost" size="sm" className="ml-auto h-9 px-2 text-xs" onClick={() => setImpostazioni({ gioco: String(gioco), soglia: String(soglia) })}>
              <Settings2 className="mr-1 h-3.5 w-3.5" /> Cambia
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-sm:p-3 max-sm:pt-0">
        {items.map((item) => {
          const cfg = STATUS[item.measure_status ?? "da_rilevare"] ?? STATUS.da_rilevare;
          const forma = formaDellaRiga(item);
          const quantitaRiga = forma !== "LxH" && forma !== "LxPxH";
          const unita = item.unita_misura ?? (quantitaRiga ? forma : null);
          const scarto = scartoDellaRiga(item.measure_variance, soglia);
          const cambiate = Object.entries(item.measure_variance ?? {}).filter(([, v]) => v?.delta);
          const costoCambiato = item.costo_stimato_iniziale != null && item.costo_stimato_iniziale !== item.purchase_price;
          return (
            <div key={item.id} className={`rounded-lg border p-3 ${scarto.oltreSoglia ? "border-amber-400 bg-amber-50/40" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  {puoConfermare && item.measure_status === "rilevato" && (
                    <Checkbox
                      className="mt-0.5"
                      aria-label={`Seleziona ${item.riferimento || item.name}`}
                      checked={selezione.has(item.id)}
                      onCheckedChange={(v) => scegli(item.id, v === true)}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.riferimento || item.name}</p>
                    {item.riferimento && <p className="truncate text-xs text-muted-foreground">{item.name}</p>}
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${cfg.color}`}>{cfg.label}</Badge>
              </div>

              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Provvisoria</dt>
                  <dd className="tabular-nums">{misureInTesto(item.misure_preventivo, unita)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Rilevata{item.misura_tipo ? ` (${NOME_TIPO_MISURA[item.misura_tipo].replace("misura ", "")})` : ""}</dt>
                  <dd className="tabular-nums">{misureInTesto(item.misure_rilevate, unita)}</dd>
                </div>
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-muted-foreground">Da ordinare</dt>
                  <dd className="font-medium tabular-nums">
                    {misureInTesto(item.misure_da_ordinare, unita)}
                    {Number(item.gioco_posa_mm) > 0 && <span className="ml-1 font-normal text-muted-foreground">gioco {item.gioco_posa_mm} mm</span>}
                  </dd>
                </div>
              </dl>

              {cambiate.length > 0 && (
                <p className={`mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] ${scarto.oltreSoglia ? "font-medium text-amber-800" : "text-muted-foreground"}`}>
                  {scarto.oltreSoglia && <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />}
                  {cambiate.map(([k, v]) => `${NOME_ASSE[k as AsseMisura] ?? k} ${v.delta! > 0 ? "+" : ""}${v.delta}`).join(" · ")}
                  {scarto.oltreSoglia ? " · oltre soglia" : ""}
                </p>
              )}
              {canViewCosts && costoCambiato && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Costo stimato: {euro(Number(item.costo_stimato_iniziale))} → {euro(Number(item.purchase_price))}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {puoScrivere && (
                  <Button size="sm" variant="outline" className="min-h-9 text-xs" onClick={() => openEdit(item)}>
                    <Pencil className="mr-1 h-3 w-3" />
                    {item.misure_rilevate ? "Modifica misure" : "Rileva misure"}
                  </Button>
                )}
                {puoConfermare && item.measure_status === "rilevato" && (
                  <Button size="sm" variant="outline" className="min-h-9 text-xs" disabled={conferma.isPending} onClick={() => confermaUnaVolta([item.id])}>
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Conferma
                  </Button>
                )}
                {quantitaRiga && (
                  <label className="flex items-center gap-1.5 text-xs">
                    Sfrido %
                    <Input
                      key={`${item.id}-${item.sfrido ?? 0}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      className="h-9 w-16 tabular-nums"
                      disabled={!puoScrivere}
                      defaultValue={item.sfrido ?? 0}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n !== Number(item.sfrido ?? 0)) sfrido.mutate({ id: item.id, valore: n });
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {oltreSoglia.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <span>
              {oltreSoglia.length === 1 ? "1 posizione oltre soglia" : `${oltreSoglia.length} posizioni oltre soglia`}: il prezzo al cliente non cambia da solo.
            </span>
            {onProponiVariante && (
              <Button size="sm" variant="outline" className="min-h-9 bg-white text-xs" onClick={onProponiVariante}>
                Proponi una variante
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-sm:p-4">
          <DialogHeader>
            <DialogTitle>Misure definitive — {editing?.riferimento || editing?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {editing && assiEdit.map((asse) => (
              <div key={asse} className="grid grid-cols-[1fr_auto_7rem] items-center gap-2">
                <Label htmlFor={`edit-${asse}`} className="text-sm">{NOME_ASSE[asse]}</Label>
                <span className="text-xs tabular-nums text-muted-foreground">prov.: {valoreAsse(editing.misure_preventivo, asse) ?? "—"}</span>
                <Input
                  id={`edit-${asse}`}
                  inputMode="decimal"
                  className="h-11 tabular-nums"
                  value={draft[asse] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [asse]: e.target.value }))}
                  placeholder={asse === "quantita" ? (editing.unita_misura ?? "") : "mm"}
                />
              </div>
            ))}
            {editing && !assiEdit.includes("quantita") && (
              <label className="block text-sm">
                È la misura del
                <select className="mt-1 h-11 w-full rounded-md border bg-white px-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMisura | "")}>
                  <option value="">Non specificato</option>
                  <option value="foro">Foro</option>
                  <option value="telaio">Telaio</option>
                  <option value="finita">Prodotto finito</option>
                </select>
              </label>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              onClick={() => editing && save.mutate({ item: editing, def: pulito(), confirm: false })}
              disabled={save.isPending || !draftCompleto}
            >
              Salva come rilevata
            </Button>
            {puoConfermare && (
              <Button
                className="min-h-11"
                onClick={() => editing && save.mutate({ item: editing, def: pulito(), confirm: true })}
                disabled={save.isPending || !draftCompleto}
              >
                Salva e conferma
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!impostazioni} onOpenChange={(o) => !o && setImpostazioni(null)}>
        <DialogContent className="max-sm:p-4">
          <DialogHeader>
            <DialogTitle>Gioco di posa e soglia</DialogTitle>
            <DialogDescription>Valgono per tutta l'azienda, dalle prossime conferme.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="misure-gioco">Gioco di posa (mm)</Label>
              <Input id="misure-gioco" inputMode="decimal" className="mt-1 h-11" value={impostazioni?.gioco ?? ""} onChange={(e) => setImpostazioni((v) => v && { ...v, gioco: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Tolto da larghezza e altezza solo quando è stato misurato il foro.</p>
            </div>
            <div>
              <Label htmlFor="misure-soglia">Soglia di scarto (mm)</Label>
              <Input id="misure-soglia" inputMode="decimal" className="mt-1 h-11" value={impostazioni?.soglia ?? ""} onChange={(e) => setImpostazioni((v) => v && { ...v, soglia: e.target.value })} />
              <p className="mt-1 text-xs text-muted-foreground">Oltre questa differenza la posizione si evidenzia e il costo stimato si ricalcola.</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="min-h-11"
              disabled={salvaRegole.isPending || !impostazioni || !Number.isFinite(Number(impostazioni.gioco)) || !Number.isFinite(Number(impostazioni.soglia))}
              onClick={() => impostazioni && salvaRegole.mutate({ gioco: Number(impostazioni.gioco.replace(",", ".")), soglia: Number(impostazioni.soglia.replace(",", ".")) })}
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
