import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCodaMaterialiOperazione, useMagazzinoMaterialiOperazione, type RegistroMateriale } from "@/hooks/useMaterialiOperazione";
import { usePermissions } from "@/hooks/usePermissions";
import { prontoDaOrdinare, quoteGiacenzaMateriali } from "@/lib/distinta/registroMaterialiOperazione";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { createMaterialPurchaseOrder } from "@/lib/orders/createMaterialPurchaseOrder";
import { prezzoAcquistoDaDefinire, unitaMateriale } from "@/lib/orders/materialProcurement";
import { parseDecimalITStrict } from "@/lib/parseDecimalIT";
import { queryKeys } from "@/lib/queryKeys";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Esito = { nome: string; poId?: string; errore?: string };
const quantita = new Intl.NumberFormat("it", { maximumFractionDigits: 4 });

export function AcquistiMaterialiOperazione({ riepilogo, edificio, ricerca, idsGruppo, chiudi }: {
  riepilogo: RiepilogoGenerale; edificio: string; ricerca: string; idsGruppo?: Set<string>; chiudi: () => void;
}) {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const permessi = usePermissions();
  const qc = useQueryClient();
  const [fornitore, setFornitore] = useState("");
  const [selezione, setSelezione] = useState<Set<string>>(() => new Set());
  const [occupato, setOccupato] = useState(false);
  const [esiti, setEsiti] = useState<Esito[]>([]);
  const [quantitaScelte, setQuantitaScelte] = useState<Record<string, string>>({});
  const { generale, figlie } = riepilogo;
  const scopes = new Map([generale, ...figlie].map(o => [o.id, o]));
  const registro = useCodaMaterialiOperazione(generale.id, true, true, edificio);
  const stock = useMagazzinoMaterialiOperazione(permessi.canViewWarehouse);
  const registroScorte = useCodaMaterialiOperazione(generale.id, !!edificio && permessi.canViewWarehouse, false);
  const righeScorte = edificio ? registroScorte.data : registro.data;
  const quote = useMemo(() => righeScorte && stock.data
    ? quoteGiacenzaMateriali(righeScorte, stock.data.stock, stock.data.codici) : null, [righeScorte, stock.data]);
  const disponibili = useMemo(() => (registro.data ?? []).filter(r => prontoDaOrdinare(r)
    && (!idsGruppo || idsGruppo.has(r.id)) && cercaNellOperazione(ricerca, [r.name, r.product_code, r.fase?.name, r.fornitore?.name])),
  [registro.data, idsGruppo, ricerca]);
  const fornitori = [...new Map(disponibili.map(r => [r.supplier_id!, r.fornitore?.name || t("Fornitore")]))]
    .sort((a, b) => a[1].localeCompare(b[1], "it"));
  const scelto = fornitore || fornitori[0]?.[0] || "";
  const gruppi = new Map<string, RegistroMateriale[]>();
  for (const riga of disponibili) {
    if (riga.supplier_id !== scelto) continue;
    const righe = gruppi.get(riga.order_id);
    if (righe) righe.push(riga);
    else gruppi.set(riga.order_id, [riga]);
  }
  const ordini = [...gruppi].filter(([id]) => selezione.has(id));
  const nArticoli = ordini.reduce((n, [, righe]) => n + righe.length, 0);
  const quantitaValide = ordini.every(([, righe]) => righe.every(r => {
    const scritta = quantitaScelte[r.id]?.trim();
    if (!scritta) return true;
    const n = parseDecimalITStrict(scritta);
    return n > 0 && n <= r.piano.remaining && Math.abs(n * 1000 - Math.round(n * 1000)) < 0.00001;
  }));
  const etichetta = (id: string) => {
    const c = scopes.get(id);
    return c ? [c.codice, c.nome].filter(Boolean).join(" · ") : t("Commessa");
  };

  const creaBozze = async () => {
    if (occupato || !ordini.length || !effectiveCompany?.id || !scelto || !quantitaValide) return;
    setOccupato(true);
    const riusciti = new Set<string>();
    try {
      for (const [id, righe] of ordini) {
        const nome = etichetta(id);
        try {
          const { poId } = await createMaterialPurchaseOrder({
            companyId: effectiveCompany.id, orderId: id, orderCode: scopes.get(id)?.codice,
            supplierId: scelto, userId: user?.id, items: righe.map(r => ({ ...r, quantity: r.piano.remaining })),
            quantita: Object.fromEntries(righe.flatMap(r => quantitaScelte[r.id]?.trim()
              ? [[r.id, parseDecimalITStrict(quantitaScelte[r.id])]] : [])),
          });
          riusciti.add(id);
          setEsiti(precedenti => [...precedenti.filter(e => e.nome !== nome || !!e.poId), { nome, poId }]);
        } catch (e) {
          const errore = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : t("Verifica la connessione e la disponibilità delle righe.");
          setEsiti(precedenti => [...precedenti.filter(x => x.nome !== nome || !!x.poId), { nome, errore }]);
        }
      }
      setSelezione(attive => new Set([...attive].filter(id => !riusciti.has(id))));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["generale-materiali-operazione"] }),
        qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
        qc.invalidateQueries({ queryKey: ["linked-purchase-orders"] }),
        qc.invalidateQueries({ queryKey: ["material-procurement"] }),
        qc.invalidateQueries({ queryKey: ["material-procurement-unmapped"] }),
        qc.invalidateQueries({ queryKey: ["generale-movimenti-operazione"] }),
        qc.invalidateQueries({ queryKey: ["generale-controllo-forniture"] }),
        qc.invalidateQueries({ queryKey: ["order-items"] }),
      ]);
    } finally {
      setOccupato(false);
    }
  };

  return <Dialog open onOpenChange={open => { if (!open && !occupato) chiudi(); }}>
    <DialogContent className="max-h-[90dvh] max-w-2xl gap-3 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t("Prepara gli OdA per fornitore")}</DialogTitle>
        <DialogDescription>{t("Scegli le commesse da includere. Ogni bozza resta collegata alla propria commessa per le consegne. Apri gli articoli per ordinare solo una parte del residuo.")}</DialogDescription>
      </DialogHeader>
      {registro.isPending ? <p role="status" className="text-sm">{t("Controllo le quantità residue…")}</p>
        : registro.isError ? <p role="status" className="text-sm">{t("Materiali da ordinare non disponibili.")}{" "}
          <Button size="sm" variant="link" onClick={() => void registro.refetch()}>{t("Riprova")}</Button></p>
        : !fornitori.length ? <p className="rounded-md border p-3 text-sm text-muted-foreground">{t("Nessun articolo pronto per i filtri attivi.")}</p>
        : <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm"><span>{t("Fornitore")}</span>
              <Select value={scelto} disabled={occupato} onValueChange={id => { setFornitore(id); setSelezione(new Set()); setQuantitaScelte({}); }}>
                <SelectTrigger aria-label={t("Fornitore")} className="h-8 w-auto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fornitore && !fornitori.some(([id]) => id === fornitore) && <SelectItem value={fornitore}>{t("Fornitore già completato")}</SelectItem>}
                  {fornitori.map(([id, nome]) => <SelectItem key={id} value={id}>{nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {gruppi.size > 0 && <Button size="sm" variant="outline" className="h-8" disabled={occupato}
              onClick={() => setSelezione(selezione.size === gruppi.size ? new Set() : new Set(gruppi.keys()))}>
              {selezione.size === gruppi.size ? t("Togli tutte") : t("Seleziona tutte le commesse")}
            </Button>}
          </div>
          <ul className="max-h-[46dvh] divide-y overflow-auto rounded-md border">
            {[...gruppi].map(([id, righe]) => <li key={id} className="px-3 py-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selezione.has(id)} disabled={occupato} className="size-4 accent-primary"
                  onChange={e => setSelezione(s => { const prossima = new Set(s); if (e.target.checked) prossima.add(id); else prossima.delete(id); return prossima; })} />
                <span className="flex-1 font-medium">{etichetta(id)}</span>
                <span className="text-xs text-muted-foreground">{t(righe.length === 1 ? "{n} articolo" : "{n} articoli", { n: righe.length })}</span>
              </label>
              <details className="ml-6 mt-1 text-xs">
                <summary className="cursor-pointer text-muted-foreground">{t("Vedi articoli e quantità")}</summary>
                <ul className="py-1">{righe.map(r => {
                  const libero = quote?.get(r.id)?.suggerita ?? 0;
                  return <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <div>{r.name}{prezzoAcquistoDaDefinire(r) && <span className="text-muted-foreground"> · {t("prezzo da definire")}</span>}
                      {r.piano.daScorta > 0 && <div className="text-muted-foreground">{t("Da scorta {quantita} {unita}", { quantita: quantita.format(r.piano.daScorta), unita: unitaMateriale(r) })}</div>}
                      {libero > 0 && <div className="text-muted-foreground">{t("Libero suggerito in magazzino {quantita} {unita}", { quantita: quantita.format(libero), unita: unitaMateriale(r) })}</div>}
                    </div>
                    <span className="ml-auto flex items-center gap-2 whitespace-nowrap tabular-nums">
                      {t("Residuo {quantita} {unita}", { quantita: quantita.format(r.piano.remaining), unita: unitaMateriale(r) })}
                      {!r.posizioni?.length && <Input inputMode="decimal" placeholder={t("Tutto")} disabled={occupato} className="h-7 w-20 text-xs md:text-xs"
                        aria-label={t("Quantità da ordinare di {nome} · {commessa}", { nome: r.name, commessa: etichetta(id) })}
                        value={quantitaScelte[r.id] ?? ""} onChange={e => setQuantitaScelte(s => ({ ...s, [r.id]: e.target.value }))} />}
                    </span>
                  </li>;
                })}</ul>
              </details>
            </li>)}
          </ul>
        </div>}
      {!!esiti.length && <ul aria-live="polite" className="divide-y rounded-md border text-sm">{esiti.map(e => <li key={`${e.nome}:${e.poId ?? "errore"}`} className="px-3 py-1.5">
        {e.nome}{" "}
        {e.poId ? <Link to={`/azienda/ordini-acquisto/${e.poId}`} className="text-primary underline">{t("Apri bozza")}</Link>
          : <p className="text-destructive">{e.errore}</p>}
      </li>)}</ul>}
      {!quantitaValide && <p role="alert" className="text-sm text-destructive">{t("Usa quantità maggiori di zero, entro il residuo e con al massimo tre decimali.")}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={chiudi} disabled={occupato}>{t("Chiudi")}</Button>
        <Button onClick={() => void creaBozze()} disabled={occupato || registro.isFetching || !ordini.length || !quantitaValide}
          aria-label={t(ordini.length === 1 ? "Crea {n} bozza" : "Crea {n} bozze", { n: ordini.length })}>
          {occupato ? t("Creo le bozze…") : ordini.length ? `${t(ordini.length === 1 ? "Crea {n} bozza" : "Crea {n} bozze", { n: ordini.length })} · ${t(nArticoli === 1 ? "{n} articolo" : "{n} articoli", { n: nArticoli })}` : t("Seleziona le commesse")}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
