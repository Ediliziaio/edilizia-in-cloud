import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcolaIvaComputo, type ImpostazioniIvaComputo } from "@/lib/computo/ivaComputo";
import { formatEuro } from "@/lib/computo/computoStrutturato";

export default function ComputoIva({ value, imponibile, onChange }: {
  value: ImpostazioniIvaComputo; imponibile: number; onChange: (patch: ImpostazioniIvaComputo) => void;
}) {
  const fiscale = calcolaIvaComputo(imponibile, value);
  const aliquote = ["0", "4", "5", "10", "22"];
  const [personalizzata, setPersonalizzata] = useState(false);
  const custom = personalizzata || !aliquote.includes(value.ivaAliquota ?? "22");
  return <section aria-label="IVA del preventivo" className="space-y-4 border-t pt-5">
    <h3 className="text-sm font-semibold">IVA e totale</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2"><Label htmlFor="computo-iva-modalita">Trattamento IVA</Label>
        <Select value={value.ivaModalita ?? "da-definire"} onValueChange={v => onChange({ ivaModalita: v as ImpostazioniIvaComputo["ivaModalita"] })}>
          <SelectTrigger id="computo-iva-modalita"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="da-definire">Da definire</SelectItem><SelectItem value="applicata">Applica IVA</SelectItem><SelectItem value="non-applicabile">IVA non applicabile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.ivaModalita === "applicata" && <div className="space-y-2"><Label htmlFor="computo-iva-aliquota">Aliquota IVA</Label>
        <Select value={custom ? "custom" : value.ivaAliquota ?? "22"} onValueChange={v => { setPersonalizzata(v === "custom"); onChange({ ivaAliquota: v === "custom" ? "" : v }); }}>
          <SelectTrigger id="computo-iva-aliquota"><SelectValue /></SelectTrigger><SelectContent>
            {aliquote.map(a => <SelectItem key={a} value={a}>{a}%</SelectItem>)}<SelectItem value="custom">Personalizzata</SelectItem>
          </SelectContent>
        </Select>
        {custom && <Input aria-label="Aliquota IVA personalizzata" inputMode="decimal" maxLength={40} value={value.ivaAliquota ?? ""} onChange={e => onChange({ ivaAliquota: e.target.value })} />}
      </div>}
    </div>
    {value.ivaModalita !== "da-definire" && <div className="space-y-2"><Label htmlFor="computo-iva-nota">Nota IVA</Label><Input id="computo-iva-nota" maxLength={1000} value={value.ivaNota ?? ""} onChange={e => onChange({ ivaNota: e.target.value })} /></div>}
    {fiscale.errore && <p role="alert" className="text-sm text-amber-800">{fiscale.errore}</p>}
    <dl className="space-y-2 text-sm tabular-nums">
      <div className="flex justify-between gap-4"><dt>Imponibile</dt><dd>{formatEuro(imponibile)} €</dd></div>
      <div className="flex justify-between gap-4"><dt>IVA</dt><dd>{fiscale.iva == null ? "Da definire" : `${formatEuro(fiscale.iva)} €`}</dd></div>
      <div className="flex justify-between gap-4 border-t pt-2 font-semibold"><dt>Totale{fiscale.modalita === "applicata" ? " IVA inclusa" : ""}</dt><dd>{fiscale.totale == null ? "Da definire" : `${formatEuro(fiscale.totale)} €`}</dd></div>
    </dl>
  </section>;
}
