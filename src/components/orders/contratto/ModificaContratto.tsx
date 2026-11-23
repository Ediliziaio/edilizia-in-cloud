/**
 * Correggere la lettura prima di applicarla (17/11/2026): l'AI sbaglia (fasi prese dalle rate, una riga
 * sola invece del computo), e chi carica deve poter rimettere a posto fasi e lavorazioni, articoli, rate,
 * date e importo senza ricaricare il documento. Ogni editor riceve la lettura e restituisce quella nuova.
 */
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { ContractExtract } from "@/lib/orders/contractExtract";

type Props = { extract: ContractExtract; onModifica: (e: ContractExtract) => void };

const num = (v: string): number | null => {
  const t = v.trim().replace(/\./g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const testoNum = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("it-IT", { maximumFractionDigits: 2 }));

/** Un numero che si scrive all'italiana e si salva uscendo dal campo. */
function CampoNumero({ valore, onValore, etichetta, className }: { valore: number | null | undefined; onValore: (n: number | null) => void; etichetta: string; className?: string }) {
  const [testo, setTesto] = useState(testoNum(valore));
  return (
    <Input value={testo} inputMode="decimal" aria-label={etichetta} className={className ?? "h-7 text-right text-xs tabular-nums"}
      onChange={(e) => setTesto(e.target.value)} onBlur={() => onValore(num(testo))} />
  );
}

export function ModificaFasi({ extract, onModifica }: Props) {
  const tr = useT();
  const fasi = extract.fasi_lavoro ?? [];
  const metti = (nuove: typeof fasi) => onModifica({ ...extract, fasi_lavoro: nuove, lavorazioni_escluse: nuove.length === 0 });
  const [nuova, setNuova] = useState<Record<number, string>>({});
  return (
    <div className="space-y-2">
      {fasi.map((f, i) => (
        <div key={i} className="space-y-1 rounded-md border p-2">
          <div className="flex items-center gap-1.5">
            <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
            <Input value={f.nome} aria-label={tr("Nome della fase {n}", { n: i + 1 })} className="h-7 flex-1 text-xs"
              onChange={(e) => metti(fasi.map((x, k) => (k === i ? { ...x, nome: e.target.value } : x)))} />
            <CampoNumero valore={f.giorni} etichetta={tr("Giorni della fase {n}", { n: i + 1 })} className="h-7 w-16 text-right text-xs"
              onValore={(n) => metti(fasi.map((x, k) => (k === i ? { ...x, giorni: n != null && n > 0 ? Math.round(n) : null } : x)))} />
            <span className="text-[11px] text-muted-foreground">{tr("gg")}</span>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={tr("Togli la fase {nome}", { nome: f.nome })} onClick={() => metti(fasi.filter((_, k) => k !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1 pl-6">
            {f.sottofasi.map((x, k) => (
              <span key={k} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {x}
                <button type="button" aria-label={tr("Togli la lavorazione {nome}", { nome: x })} className="text-muted-foreground hover:text-foreground"
                  onClick={() => metti(fasi.map((y, j) => (j === i ? { ...y, sottofasi: y.sottofasi.filter((_, z) => z !== k), ...(y.lavorazioni ? { lavorazioni: y.lavorazioni.filter((_, z) => z !== k) } : {}) } : y)))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <form className="inline-flex" onSubmit={(e) => {
              e.preventDefault();
              const t = (nuova[i] ?? "").trim();
              if (!t) return;
              metti(fasi.map((y, j) => (j === i ? { ...y, sottofasi: [...y.sottofasi, t], ...(y.lavorazioni ? { lavorazioni: [...y.lavorazioni, { riferimento: `manuale:${crypto.randomUUID()}`, descrizione: t, quantita: null, unita: null, articolo_riferimenti: [] }] } : {}) } : y)));
              setNuova((p) => ({ ...p, [i]: "" }));
            }}>
              <Input value={nuova[i] ?? ""} placeholder={tr("+ lavorazione")} aria-label={tr("Aggiungi una lavorazione a {nome}", { nome: f.nome })} className="h-6 w-36 text-[11px]"
                onChange={(e) => setNuova((p) => ({ ...p, [i]: e.target.value }))} />
            </form>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => metti([...fasi, { nome: "Nuova fase", giorni: null, sottofasi: [] }])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {tr("Aggiungi fase")}
      </Button>
    </div>
  );
}

export function ModificaArticoli({ extract, onModifica }: Props) {
  const t = useT();
  const metti = (voci: ContractExtract["voci"]) => onModifica({ ...extract, voci });
  if (extract.posizioni_allegato?.length) return <div className="space-y-2">
    <p className="text-xs text-muted-foreground">{t("Correggi le posizioni del documento: le quantità aggiornano sia il lavoro previsto sia gli articoli necessari.")}</p>
    {extract.posizioni_allegato.map((p, i) => <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_8rem] gap-2 text-xs">
      <span className="self-center">{p.codice} · {p.descrizione}</span>
      <CampoNumero valore={p.quantita} etichetta={t("Quantità della posizione {codice}", { codice: p.codice })} onValore={n => {
        if (n != null && n > 0) onModifica({ ...extract, posizioni_allegato: extract.posizioni_allegato!.map((x, k) => k === i ? { ...x, quantita: n } : x) });
      }} />
      <Input className="h-7 text-xs" aria-label={t("Misure della posizione {codice}", { codice: p.codice })} placeholder={t("L×H mm")} value={p.dimensioni ?? ""}
        onChange={e => onModifica({ ...extract, posizioni_allegato: extract.posizioni_allegato!.map((x, k) => k === i ? { ...x, dimensioni: e.target.value || null } : x) })} />
    </div>)}
  </div>;
  return (
    <div className="space-y-2">
      <div className="max-h-80 space-y-1 overflow-y-auto">
        {extract.voci.map((v, i) => (
          <div key={`${i}-${extract.voci.length}`} className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_1.75rem] items-center gap-1.5">
            <Input value={v.descrizione} aria-label={t("Descrizione dell'articolo {n}", { n: i + 1 })} className="h-7 text-xs"
              onChange={(e) => metti(extract.voci.map((x, k) => (k === i ? { ...x, descrizione: e.target.value } : x)))} />
            <CampoNumero valore={v.quantita} etichetta={t("Quantità dell'articolo {n}", { n: i + 1 })}
              onValore={(n) => metti(extract.voci.map((x, k) => (k === i ? { ...x, quantita: n ?? 1, quantita_da_confermare: n == null } : x)))} />
            <CampoNumero valore={v.prezzo_unitario_eur} etichetta={t("Prezzo dell'articolo {n}", { n: i + 1 })}
              onValore={(n) => metti(extract.voci.map((x, k) => (k === i ? { ...x, prezzo_unitario_eur: n ?? 0 } : x)))} />
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("Togli l'articolo {nome}", { nome: v.descrizione })} onClick={() => metti(extract.voci.filter((_, k) => k !== i))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => metti([...extract.voci, { descrizione: "Nuovo articolo", quantita: 1, prezzo_unitario_eur: 0 }])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {t("Aggiungi articolo")}
      </Button>
    </div>
  );
}

export function ModificaPagamento({ extract, onModifica }: Props) {
  const t = useT();
  const rate = extract.fasi_pagamento;
  const metti = (r: typeof rate) => onModifica({ ...extract, fasi_pagamento: r });
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">{t("Modalità")}</span>
        <Input value={extract.modalita_pagamento ?? ""} aria-label={t("Modalità di pagamento")} className="h-7 flex-1 text-xs"
          onChange={(e) => onModifica({ ...extract, modalita_pagamento: e.target.value || null })} />
      </label>
      {rate.map((f, i) => (
        <div key={`${i}-${rate.length}`} className="grid grid-cols-[minmax(0,1fr)_4rem_6rem_1.75rem] items-center gap-1.5">
          <Input value={f.descrizione} aria-label={t("Descrizione della rata {n}", { n: i + 1 })} className="h-7 text-xs"
            onChange={(e) => metti(rate.map((x, k) => (k === i ? { ...x, descrizione: e.target.value } : x)))} />
          <CampoNumero valore={f.percentuale} etichetta={t("Percentuale della rata {n}", { n: i + 1 })}
            onValore={(n) => metti(rate.map((x, k) => (k === i ? { ...x, percentuale: n } : x)))} />
          <CampoNumero valore={f.importo_eur} etichetta={t("Importo della rata {n}", { n: i + 1 })}
            onValore={(n) => metti(rate.map((x, k) => (k === i ? { ...x, importo_eur: n } : x)))} />
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={t("Togli la rata {nome}", { nome: f.descrizione })} onClick={() => metti(rate.filter((_, k) => k !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => metti([...rate, { descrizione: "Nuova rata", percentuale: null, importo_eur: null }])}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {t("Aggiungi rata")}
      </Button>
    </div>
  );
}

export function ModificaDate({ extract, onModifica }: Props) {
  const t = useT();
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <label className="space-y-1"><span className="text-muted-foreground">{t("Inizio lavori")}</span>
        <Input type="date" value={extract.data_inizio_lavori ?? ""} className="h-8 text-xs" onChange={(e) => onModifica({ ...extract, data_inizio_lavori: e.target.value || null })} />
      </label>
      <label className="space-y-1"><span className="text-muted-foreground">{t("Fine lavori")}</span>
        <Input type="date" value={extract.data_fine_lavori ?? ""} className="h-8 text-xs" onChange={(e) => onModifica({ ...extract, data_fine_lavori: e.target.value || null })} />
      </label>
    </div>
  );
}

export function ModificaImporto({ extract, onModifica }: Props) {
  const t = useT();
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-3">
      <label className="space-y-1"><span className="text-muted-foreground">{t("Imponibile €")}</span>
        <CampoNumero valore={extract.importo_totale_eur} etichetta={t("Imponibile")} className="h-8 text-right text-xs tabular-nums"
          onValore={(n) => onModifica({ ...extract, importo_totale_eur: n })} />
      </label>
      <label className="space-y-1"><span className="text-muted-foreground">{t("IVA %")}</span>
        <CampoNumero valore={extract.iva_pct} etichetta={t("Aliquota IVA")} className="h-8 text-right text-xs tabular-nums"
          onValore={(n) => onModifica({ ...extract, iva_pct: n })} />
      </label>
      <label className="space-y-1"><span className="text-muted-foreground">{t("Totale con IVA €")}</span>
        <CampoNumero valore={extract.importo_totale_ivato_eur} etichetta={t("Totale con IVA")} className="h-8 text-right text-xs tabular-nums"
          onValore={(n) => onModifica({ ...extract, importo_totale_ivato_eur: n })} />
      </label>
    </div>
  );
}
