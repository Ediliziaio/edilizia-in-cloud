/**
 * EmojiPicker — emoji picker leggero stile WhatsApp.
 *
 * Niente dipendenze esterne (no emoji-mart): un set curato di emoji più usate
 * organizzate in tab. Tab + grid 8 colonne. Click → callback con il glyph.
 *
 * USO:
 *   <EmojiPicker
 *     trigger={<Button><Smile /></Button>}
 *     onPick={(emoji) => setText(t => t + emoji)}
 *   />
 */
import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Category = "recenti" | "smile" | "gesti" | "cuori" | "oggetti" | "natura" | "cibo" | "attivita" | "simboli";

const EMOJI_BY_CATEGORY: Record<Category, string[]> = {
  recenti: [], // popolato dinamicamente
  smile: [
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
    "😘","😗","😚","😙","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨",
    "😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕",
    "🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁",
    "☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣",
    "😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👻",
  ],
  gesti: [
    "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️",
    "👋","🤚","🖐️","✋","🖖","👏","🙌","👐","🤲","🤝","🙏","✊","👊","🤛","🤜","💪",
    "🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄",
  ],
  cuori: [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
    "💘","💝","💟","♥️","💌","💋","💯","💢","💥","💫","💦","💨","🕳️","💣","💬","🗨️",
  ],
  oggetti: [
    "📱","💻","⌨️","🖥️","🖨️","🖱️","📷","📸","📹","🎥","📺","📻","☎️","📞","📟","📠",
    "🔋","🔌","💡","🔦","🕯️","🧯","🛢️","💸","💵","💴","💶","💷","💰","💳","🧾","💹",
    "📧","📨","📩","📤","📥","📦","📫","📪","📬","📭","📮","🗳️","✏️","✒️","🖋️","🖊️",
    "🖌️","🖍️","📝","💼","📁","📂","🗂️","📅","📆","🗒️","🗓️","📇","📈","📉","📊","📋",
    "📌","📍","📎","🖇️","📏","📐","✂️","🗃️","🗄️","🗑️","🔒","🔓","🔏","🔐","🔑","🗝️",
    "🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🔫","🪃","🏹","🛡️","🪚","🔧","🪛","🔩","⚙️",
  ],
  natura: [
    "🌱","🌲","🌳","🌴","🌵","🌾","🌿","☘️","🍀","🍁","🍂","🍃","🌺","🌸","🌷","🌹",
    "🥀","🌻","🌼","💐","🪴","🌎","🌍","🌏","🌑","🌒","🌓","🌔","🌕","🌖","🌗","🌘",
    "🌙","🌚","🌛","🌜","☀️","🌝","🌞","⭐","🌟","✨","⚡","☄️","💥","🔥","🌪️","🌈",
    "☁️","⛅","⛈️","🌤️","🌥️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","💧","💦","🌊",
  ],
  cibo: [
    "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥",
    "🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠",
    "🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴",
    "🌭","🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🥗","🥘","🥫","🍝","🍜","🍲","🍛",
    "🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦",
    "🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🍯","🥛","🍼",
    "☕","🍵","🧃","🥤","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🍾","🧊","🥄","🍴",
  ],
  attivita: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍",
    "🏏","🪃","🥅","⛳","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛷","⛸️","🥌","🎿","⛷️",
    "🏂","🏋️","🤸","🤺","⛹️","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴",
    "🏆","🥇","🥈","🥉","🏅","🎖️","🏵️","🎗️","🎫","🎟️","🎪","🤹","🎭","🩰","🎨","🎬",
  ],
  simboli: [
    "🆗","✅","❌","❎","✔️","☑️","🔘","🟢","🔴","🟠","🟡","🟣","🟤","⚫","⚪","🟥",
    "🟧","🟨","🟩","🟦","🟪","🟫","⬛","⬜","◾","◽","🔶","🔷","🔺","🔻","🔸","🔹",
    "❓","❔","❗","❕","‼️","⁉️","💯","🔝","⬆️","⬇️","⬅️","➡️","↗️","↘️","↙️","↖️",
    "↔️","↕️","🔄","🔃","🔂","🔁","🔀","▶️","⏸️","⏯️","⏹️","⏺️","⏭️","⏮️","⏩","⏪",
  ],
};

const CATEGORY_LABELS: Record<Category, string> = {
  recenti: "🕒",
  smile: "😀",
  gesti: "👍",
  cuori: "❤️",
  oggetti: "📦",
  natura: "🌿",
  cibo: "🍕",
  attivita: "⚽",
  simboli: "🔣",
};

const RECENT_KEY = "edilizia.emoji.recent";
const RECENT_MAX = 32;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string): string[] {
  const cur = loadRecent().filter((e) => e !== emoji);
  const next = [emoji, ...cur].slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
  return next;
}

interface Props {
  trigger: React.ReactNode;
  onPick: (emoji: string) => void;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  /** Tema accento (per tab attivo) */
  accent?: "orange" | "violet" | "blue" | "green";
}

const ACCENT_BG: Record<NonNullable<Props["accent"]>, string> = {
  orange: "bg-orange-100 text-orange-700",
  violet: "bg-violet-100 text-violet-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
};

export function EmojiPicker({ trigger, onPick, side = "top", align = "end", accent = "orange" }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Category>("smile");
  const [recent, setRecent] = useState<string[]>(loadRecent);

  const handleClick = (emoji: string) => {
    onPick(emoji);
    setRecent(pushRecent(emoji));
    // niente auto-close: stile WhatsApp permette pick multipli
  };

  const visibleEmojis = activeTab === "recenti" ? recent : EMOJI_BY_CATEGORY[activeTab];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-[340px] sm:w-[360px] p-0 border-slate-200 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "min(60vh, 380px)" }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-slate-100 bg-slate-50/60 shrink-0 overflow-x-auto">
          {(Object.keys(EMOJI_BY_CATEGORY) as Category[]).map((cat) => {
            const isRecentTab = cat === "recenti";
            if (isRecentTab && recent.length === 0) return null;
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveTab(cat)}
                className={cn(
                  "h-8 w-8 shrink-0 rounded-md text-lg leading-none flex items-center justify-center transition-colors",
                  isActive ? ACCENT_BG[accent] : "hover:bg-slate-200/60 text-slate-700",
                )}
                aria-label={cat}
                title={cat}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            );
          })}
        </div>
        {/* Grid */}
        <div className="overflow-y-auto p-2 flex-1 min-h-0">
          {visibleEmojis.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Nessuna emoji recente.</p>
          ) : (
            <div className="grid grid-cols-8 gap-0.5">
              {visibleEmojis.map((e, i) => (
                <button
                  key={`${e}-${i}`}
                  type="button"
                  onClick={() => handleClick(e)}
                  className="h-9 w-9 rounded-md hover:bg-slate-100 active:bg-slate-200 text-xl leading-none flex items-center justify-center transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
