/**
 * CollegamentiEmailPanel — MP-EMAIL-AI-10 · Collega email a cantieri/pratiche
 *
 * Mostra i collegamenti esistenti (chip rimovibili) e un selettore per
 * collegare l'email a una commessa (orders) o pratica (pratiche_edilizie).
 * Collegamento, non spostamento: l'email resta in casella.
 */
import { useMemo } from "react";
import { Link2, X, Building2, FileBadge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCollegamentiPerEmail,
  useCantieriPraticheOpzioni,
  useCollegaEmail,
  useScollegaEmail,
} from "@/lib/email-ai/hooks";

export function CollegamentiEmailPanel({ emailId, threadId }: { emailId: string; threadId?: string | null }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data: collegamenti } = useCollegamentiPerEmail(emailId);
  const { data: opzioni } = useCantieriPraticheOpzioni(companyId);
  const collega = useCollegaEmail();
  const scollega = useScollegaEmail();

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of opzioni ?? []) m.set(`${o.tipo}:${o.id}`, o.label);
    return m;
  }, [opzioni]);

  const linkedKeys = new Set((collegamenti ?? []).map((c) => `${c.oggetto_tipo}:${c.oggetto_id}`));

  return (
    <div className="px-3 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" /> Collegata a:
        </span>

        {(collegamenti ?? []).length === 0 && (
          <span className="text-[11px] text-muted-foreground/70">nessun cantiere/pratica</span>
        )}

        {(collegamenti ?? []).map((c) => (
          <Badge key={c.id} variant="outline" className="gap-1 bg-white text-[10px]">
            {c.oggetto_tipo === "cantiere" ? <Building2 className="h-3 w-3" /> : <FileBadge className="h-3 w-3" />}
            <span className="max-w-[180px] truncate">{labelById.get(`${c.oggetto_tipo}:${c.oggetto_id}`) || (c.oggetto_tipo === "cantiere" ? "Commessa" : "Pratica")}</span>
            <button onClick={() => scollega.mutate({ id: c.id, email_id: emailId })} aria-label="Scollega" className="ml-0.5 rounded-full hover:bg-rose-100">
              <X className="h-3 w-3 text-rose-600" />
            </button>
          </Badge>
        ))}

        <Select
          value=""
          onValueChange={(v) => {
            if (!companyId) return;
            const [tipo, id] = v.split(":");
            collega.mutate({ email_id: emailId, thread_id: threadId ?? null, oggetto_tipo: tipo as "cantiere" | "pratica", oggetto_id: id, company_id: companyId });
          }}
        >
          <SelectTrigger className="h-7 w-auto gap-1 border-dashed text-[11px]">
            <SelectValue placeholder="+ Collega" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Cantieri / Commesse</SelectLabel>
              {(opzioni ?? []).filter((o) => o.tipo === "cantiere" && !linkedKeys.has(`cantiere:${o.id}`)).map((o) => (
                <SelectItem key={o.id} value={`cantiere:${o.id}`} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Pratiche</SelectLabel>
              {(opzioni ?? []).filter((o) => o.tipo === "pratica" && !linkedKeys.has(`pratica:${o.id}`)).map((o) => (
                <SelectItem key={o.id} value={`pratica:${o.id}`} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
