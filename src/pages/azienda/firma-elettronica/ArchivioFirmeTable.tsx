import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { useMemo, useState, type ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFirmaDate } from "@/lib/fea/firmaElettronicaHub";
import { costruisciCsv, scaricaCsv } from "@/lib/csv";
import type { SignatureRequestRow } from "./index";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const columns = ["Documento", "Tipo", "Firmatario", "Email", "Metodo", "Stato", "Creata il", "Inviata il", "Firmata il", "Scadenza"] as const;
type Column = typeof columns[number];
export function useColonneFirme(storageKey: string) {
  const initial = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved)) return columns.filter(c => c === "Documento" || saved.includes(c));
    } catch { /* Preferenze facoltative. */ }
    return [...columns];
  }, [storageKey]);
  const [choice, setChoice] = useState<{key: string; columns: Column[]}>();
  const visible = choice?.key === storageKey ? choice.columns : initial;
  function toggleColumn(column: Column) {
    const next = columns.filter(c => c === column ? !visible.includes(c) : visible.includes(c));
    setChoice({key: storageKey, columns: next});
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Valida nella sessione. */ }
  }
  return { visible, toggleColumn };
}

export function MenuColonneFirme({ visible, toggleColumn }: ReturnType<typeof useColonneFirme>) {
  const t = useT();
  return (<DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs"><Columns3 className="h-3.5 w-3.5" />{t("Colonne")}</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label={t("Colonne visibili")}>{columns.map(c =>
          <DropdownMenuCheckboxItem key={c} checked={visible.includes(c)} disabled={c === "Documento"}
            onSelect={e => e.preventDefault()} onCheckedChange={() => toggleColumn(c)}>{t(c)}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
      </DropdownMenu>);
}

export function ArchivioFirmeTable({ rows, visible, openDetail, status, documentType, actions }: {
  rows: SignatureRequestRow[];
  visible: Column[];
  openDetail: (id: string) => void;
  status: (row: SignatureRequestRow) => { label: string; className: string };
  documentType: (row: SignatureRequestRow) => string;
  actions: (row: SignatureRequestRow) => ReactNode;
}) {
  const t = useT();
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const telefono = useIsMobile(640);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRows = rows.filter(r => selected.has(r.id));
  const all = rows.length > 0 && selectedRows.length === rows.length;
  function values(r: SignatureRequestRow): Record<Column, string> {
    return {
      Documento: r.documento_label || "Documento", Tipo: documentType(r), Firmatario: r.signer_name || "—",
      Email: r.signer_email || "—", Metodo: r.metodo_firma, Stato: status(r).label,
      "Creata il": formatFirmaDate(r.created_at), "Inviata il": formatFirmaDate(r.sent_at),
      "Firmata il": formatFirmaDate(r.signed_at), Scadenza: formatFirmaDate(r.expires_at),
    };
  }
  // Telefono: una riga per richiesta (documento, firmatario, stato), non la tabella a dieci colonne
  // che scorreva di lato (collaudo 23/11/2026). Il tocco apre il dettaglio, come «Apri» da computer.
  if (telefono) {
    return <ul aria-label={t("Archivio richieste di firma")} className="divide-y overflow-hidden rounded-xl border bg-card">
      {rows.map(r => {
        const st = status(r);
        return <li key={r.id}>
          <button type="button" onClick={() => openDetail(r.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{r.documento_label || t("Documento")}</span>
              <span className="block truncate text-xs text-muted-foreground">{r.signer_name || "—"} · {t(documentType(r))} · {formatFirmaDate(r.sent_at ?? r.created_at)}</span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", st.className)}>{t(st.label)}</span>
          </button>
        </li>;
      })}
    </ul>;
  }
  return <div className="overflow-hidden rounded-xl border bg-card">
    {selectedRows.length > 0 && <div className="flex flex-wrap items-center justify-end gap-2 border-b px-3 py-1.5">
        <span role="status" className="mr-auto text-xs">{t("{n} selezionate", { n: selectedRows.length })}</span>
        <Button size="sm" variant="outline" onClick={() => scaricaCsv("richieste-firma.csv", costruisciCsv(selectedRows.map(values), visible.map(c => ({ label: c, valore: row => row[c] }))))}>{t("Esporta CSV")}</Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t("Deseleziona")}</Button>
    </div>}
      <BarraScorrimentoOrizzontale contenitore={scrollContainer} className="mx-3 my-2" />
    <Table wrapperRef={setScrollContainer} aria-label={t("Archivio richieste di firma")} className="whitespace-nowrap text-sm [&_td]:py-2">
      <TableHeader><TableRow><TableHead><Checkbox aria-label={t("Seleziona tutte le richieste visualizzate")}
        checked={all || (selectedRows.length ? "indeterminate" : false)} onCheckedChange={checked => setSelected(new Set(checked ? rows.map(r => r.id) : []))} /></TableHead>
        {visible.map(c => <TableHead key={c}>{t(c)}</TableHead>)}<TableHead className="text-right">{t("Azione")}</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(r => {
        const data = values(r);
        return <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
          <TableCell><Checkbox aria-label={t("Seleziona {documento} · {fornitore}", { documento: String(data.Documento ?? ""), fornitore: String(data.Firmatario ?? "") })} checked={selected.has(r.id)}
            onCheckedChange={checked => setSelected(prev => {
              const next = new Set(prev);
              if (checked) next.add(r.id); else next.delete(r.id);
              return next;
            })} /></TableCell>
          {visible.map(c => <TableCell key={c}>{c === "Documento"
            ? <button type="button" title={data.Documento} className="block max-w-[32vw] truncate text-left font-medium text-blue-700 hover:underline" onClick={() => openDetail(r.id)}>{data.Documento}</button>
            : c === "Stato" ? <Badge className={status(r).className}>{t(data.Stato)}</Badge> : c === "Tipo" || c === "Metodo" ? t(data[c]) : data[c]}</TableCell>)}
          <TableCell className="text-right">{actions(r)}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </div>;
}
