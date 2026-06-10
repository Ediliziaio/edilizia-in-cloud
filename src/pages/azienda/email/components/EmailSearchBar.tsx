/**
 * EmailSearchBar — barra ricerca con operators stile Gmail
 *
 * Operatori supportati:
 *   from:user@dominio.it    → filtra mittente
 *   to:user@dominio.it      → filtra destinatario
 *   subject:keyword         → filtra oggetto
 *   has:attachment          → solo con allegati
 *   has:star                → solo starred
 *   is:unread               → solo non letti
 *   before:2026-05-01       → ricevute prima di
 *   after:2026-05-01        → ricevute dopo di
 *
 * Token query (testo libero) cerca in subject + raw_text.
 *
 * Il search applica i filtri su v_my_email_inbox; full-text e ricerca AI
 * semantica possono essere collegati a un edge dedicato quando necessari.
 */
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, HelpCircle } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchQuery {
  raw: string;
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  hasStar?: boolean;
  isUnread?: boolean;
  before?: string; // ISO date
  after?: string;  // ISO date
}

// 2026-05-26 (audit fix P1-14): la regex con flag /g mantiene `lastIndex`
// tra invocazioni. Usata come singleton di modulo + exec() in loop, dopo la
// prima chiamata lastIndex resta avanzato → le successive con stringhe più
// corte saltavano match all'inizio (operator persi sulla seconda search).
// Soluzione: matchAll() che non condivide stato e itera in modo sicuro.
const OPERATOR_RE = /(from|to|subject|has|is|before|after):(\S+)/g;

function parseSearchQuery(raw: string): SearchQuery {
  const q: SearchQuery = { raw };
  let textPart = raw;
  for (const m of raw.matchAll(OPERATOR_RE)) {
    const [, op, val] = m;
    textPart = textPart.replace(m[0], "").trim();
    switch (op) {
      case "from":     q.from = val; break;
      case "to":       q.to = val; break;
      case "subject":  q.subject = val; break;
      case "has":
        if (val === "attachment") q.hasAttachment = true;
        else if (val === "star" || val === "starred") q.hasStar = true;
        break;
      case "is":
        if (val === "unread") q.isUnread = true;
        break;
      case "before":   q.before = val; break;
      case "after":    q.after = val; break;
    }
  }
  if (textPart.trim().length > 0) q.text = textPart.trim();
  return q;
}

interface EmailSearchBarProps {
  initialValue?: string;
  onSearch: (query: SearchQuery | null) => void;
}

export function EmailSearchBar({ initialValue = "", onSearch }: EmailSearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    if (initialValue) setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => {
      const trimmed = value.trim();
      if (!trimmed || (trimmed.length < 2 && !trimmed.includes(":"))) {
        onSearch(null);
      } else {
        onSearch(parseSearchQuery(trimmed));
      }
    }, 400);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [value, onSearch]);

  return (
    <div className="border-b border-blue-100 bg-white px-3 py-2">
      <div className="relative flex items-center gap-1">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-500" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Cerca email…"
          aria-label="Cerca nello storico email"
          className="h-9 rounded-xl border-blue-100 bg-blue-50/40 pl-8 pr-16 text-base md:text-sm focus-visible:ring-blue-200"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
              className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl text-blue-600 hover:bg-blue-50" title="Operatori ricerca">
              <HelpCircle className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-xs space-y-2 p-3">
            <p className="font-semibold">Operatori ricerca</p>
            <ul className="space-y-1">
              <li><Badge variant="outline" className="text-[10px]">from:</Badge> mittente</li>
              <li><Badge variant="outline" className="text-[10px]">to:</Badge> destinatario</li>
              <li><Badge variant="outline" className="text-[10px]">subject:</Badge> oggetto contiene</li>
              <li><Badge variant="outline" className="text-[10px]">has:attachment</Badge> con allegati</li>
              <li><Badge variant="outline" className="text-[10px]">has:star</Badge> starred</li>
              <li><Badge variant="outline" className="text-[10px]">is:unread</Badge> non letti</li>
              <li><Badge variant="outline" className="text-[10px]">before:2026-05-01</Badge></li>
              <li><Badge variant="outline" className="text-[10px]">after:2026-05-01</Badge></li>
            </ul>
            <p className="text-muted-foreground text-[10px]">
              Combina più operatori: <code>from:bob has:attachment is:unread</code>. Lo storico viene caricato a pagine, quindi la UI resta fluida anche con molte email.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
