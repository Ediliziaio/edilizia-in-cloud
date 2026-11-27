import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filtriFornitore, useFattureFornitoreContestuali, type FatturaConScadenze } from "@/hooks/useFattureFornitoreContestuali";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { etichettaMetodo, gruppoMetodo } from "@/lib/finance/metodoScadenza";
import { nonSiPaga } from "@/lib/fatturazione/noteDiCredito";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function haScadenzeAperte(f: FatturaConScadenze): boolean {
  if (nonSiPaga(f.tipo_documento ?? "") || ["annullata", "scartata", "rifiutata"].includes(f.stato ?? "")) return false;
  const pagabili = new Set(["da pagare", "avvisata", "insoluta", "pagamento parziale", "da verificare"]);
  // Se ci sono rate, prevalgono sul vecchio indicatore di pagamento della fattura.
  return f.scadenze.length ? f.scadenze.some(r => pagabili.has(r.stato) && r.residuo !== 0) : !f.pagata_il;
}

export function ContestoFornitoreRicevuta({ companyId, fatturaId, supplierId, piva, cf, paese, onApriFattura, onChiudi }: {
  companyId: string; fatturaId: string; supplierId?: string | null; piva?: string | null; cf?: string | null; paese?: string | null;
  onApriFattura: (id: string) => void; onChiudi: () => void;
}) {
  const t = useT();
  const [soloAperte, setSoloAperte] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [limite, setLimite] = useState(20);
  const ricercaDisponibile = filtriFornitore(supplierId, piva, cf, paese).length > 0;
  const fatture = useFattureFornitoreContestuali({ companyId, fatturaId, supplierId, piva, cf, paese, enabled: ricercaDisponibile });
  const termine = ricerca.trim().toLocaleLowerCase("it");
  const righe = (fatture.data ?? []).filter(f => (!soloAperte || haScadenzeAperte(f)) &&
    (!termine || `${f.numero_fattura ?? ""} ${f.data_fattura ?? ""}`.toLocaleLowerCase("it").includes(termine)));
  return <aside id="contesto-fornitore-ricevuta" aria-label={t("Fatture e scadenze del fornitore")} className="ricevuta-contesto-fornitore rounded-lg border bg-muted/20 p-3">
    <div className="flex items-start justify-between gap-2">
      <div><h3 className="text-sm font-semibold">{t("Fatture e scadenze")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("Dello stesso fornitore")}</p></div>
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onChiudi}>{t("Chiudi")}</Button>
    </div>
    {!ricercaDisponibile ? <p className="mt-3 text-sm text-muted-foreground">{t("Collega un fornitore o indica una partita IVA o un codice fiscale per vedere le altre fatture.")}</p> : <>
      <div className="my-3 flex flex-wrap items-center gap-1 rounded-lg bg-background p-1 text-xs">
        <Button size="sm" variant={!soloAperte ? "secondary" : "ghost"} className="h-8 px-2" aria-pressed={!soloAperte} onClick={() => { setSoloAperte(false); setLimite(20); }}>{t("Tutte")}</Button>
        <Button size="sm" variant={soloAperte ? "secondary" : "ghost"} className="h-8 px-2" aria-pressed={soloAperte} onClick={() => { setSoloAperte(true); setLimite(20); }}>{t("Da pagare")}</Button>
        {!fatture.isLoading && !fatture.isError && <span className="ml-auto pr-1 text-muted-foreground">{t("{n} fatture", { n: righe.length })}</span>}
      </div>
      <Input className="mb-3 h-9 bg-background text-sm" aria-label={t("Cerca una fattura del fornitore")} placeholder={t("Cerca numero o anno…")}
        value={ricerca} onChange={e => { setRicerca(e.target.value); setLimite(20); }} />
      {fatture.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Caricamento fatture…")}</p> : fatture.isError ? <p role="alert" className="text-sm text-destructive">
        {t("Non riesco a caricare le fatture del fornitore.")} <Button size="sm" variant="link" onClick={() => void fatture.refetch()}>{t("Riprova")}</Button>
      </p> : !righe.length ? <p className="text-sm text-muted-foreground">{termine ? t("Nessuna fattura corrisponde alla ricerca.") : soloAperte ? t("Nessuna fattura da pagare trovata.") : t("Nessun'altra fattura trovata.")}</p> :
      <div className="ricevuta-contesto-lista"><ul className="space-y-2">{righe.slice(0, limite).map(f => <li key={f.id} className="rounded-lg border bg-background p-2.5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0"><p className="break-words font-medium">{t("Fattura")} {f.numero_fattura || "—"}</p>
            <p className="text-xs text-muted-foreground">{f.data_fattura ? formatDateShort(f.data_fattura) : t("Senza data")}{f.totale_documento != null ? ` · ${formatCurrency(f.totale_documento)}` : ""}</p></div>
          {f.id === fatturaId ? <span className="shrink-0 rounded bg-primary/10 px-1.5 py-1 text-xs text-primary">{t("Aperta")}</span>
            : <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" aria-label={t("Apri fattura {numero}", { numero: f.numero_fattura || "—" })} onClick={() => onApriFattura(f.id)}>{t("Apri")}</Button>}
        </div>
        {["annullata", "scartata", "rifiutata"].includes(f.stato ?? "") ? <p className="mt-2 text-xs text-muted-foreground">{t("Documento non pagabile")} · {f.stato}</p>
          : nonSiPaga(f.tipo_documento ?? "") ? <p className="mt-2 text-xs text-muted-foreground">{t("Nota di credito o documento non pagabile")}</p>
          : !f.scadenze.length ? <p className="mt-2 text-xs text-muted-foreground">{f.pagata_il ? t("Pagata") : t("Scadenze non indicate")}</p>
          : <ul className="mt-2 divide-y border-t">{f.scadenze.map(r => <li key={r.id} className="flex items-start justify-between gap-2 py-1.5 text-xs">
            <div className="min-w-0"><p>{t("Rata {numero}", { numero: r.numero })} · {r.scadenza ? formatDateShort(r.scadenza) : t("Senza data")}</p>
              <p className="text-muted-foreground">{r.metodo ? `${gruppoMetodo(r.metodo) === "riba" ? "Ri.Ba." : etichettaMetodo(r.metodo) ?? r.metodo} · ` : ""}{r.prevista ? t("Da fattura, da verificare") : r.stato}</p></div>
            <div className="shrink-0 text-right tabular-nums"><p>{r.importo == null ? "—" : formatCurrency(r.importo)}</p>
              <p className="text-muted-foreground">{r.stato === "pagata" ? t("Pagata") : r.residuo == null ? t("Residuo da verificare") : `${t("Residuo")} ${formatCurrency(r.residuo)}`}</p></div>
          </li>)}</ul>}
      </li>)}</ul>{righe.length > limite && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => setLimite(limite + 20)}>
        {t("Mostra altre fatture")} · {t("{n} rimanenti", { n: righe.length - limite })}
      </Button>}</div>}
    </>}
  </aside>;
}
