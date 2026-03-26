// Lightweight floating construction icons — pure CSS animation, no JS, hidden on mobile
// Uses animate-float / animate-float-slow from index.css

const PATHS: Record<string, string> = {
  caschetto:  "M6 22h20v2a1 1 0 01-1 1H7a1 1 0 01-1-1v-2zM6 22v-1a10 10 0 0120 0v1M16 8v4M11 10a6 6 0 0110 0M4 22h24",
  infisso:    "M4 4h24v24H4zM16 4v24M4 16h24M8 8v4M24 8v4M8 20v4M24 20v4",
  solare:     "M2 8h28v16H2zM11 8v16M21 8v16M2 13h28M2 19h28M13 28h6M16 24v4",
  casa:       "M4 13L16 3l12 10v16H4zM12 29V19h8v10M20 9l3 2.5M22 6v5M19 7h5",
  gru:        "M10 28V6M10 6h16M26 6v10M26 16l-4 4M21 16H10M18 20v4M7 26h6M10 8l3 2M10 11l3 2M10 14l3 2",
  mattone:    "M2 5h10v6H2zM16 5h14v6H16zM2 14h14v6H2zM20 14h10v6H20zM2 23h10v6H2zM16 23h14v6H16z",
  chiave:     "M20 4a6 6 0 00-5.66 8L4 22.3 5.7 28l5.7-1.7L21 16.66A6 6 0 0020 4zM21 9a2 2 0 11-4 0 2 2 0 014 0z",
  metro:      "M2 11h28v10H2zM7 11v4M12 11v6M17 11v4M22 11v6M27 11v4",
};

type IconItem = {
  icon: keyof typeof PATHS;
  top?: string; bottom?: string;
  left?: string; right?: string;
  size: number;
  delay: string;
  slow?: boolean;
  op: number;
  rot: number;
};

// 5 layout variants — one per dark section
const LAYOUTS: IconItem[][] = [
  // 0 — StatsSection
  [
    { icon: "caschetto", top: "10%",  left: "3%",   size: 28, delay: "0s",   op: 0.18, rot: -8 },
    { icon: "mattone",   top: "60%",  left: "6%",   size: 24, delay: "2.5s", op: 0.14, rot: 5, slow: true },
    { icon: "gru",       top: "15%",  right: "4%",  size: 30, delay: "1s",   op: 0.16, rot: 6 },
    { icon: "metro",     bottom:"8%", right: "8%",  size: 26, delay: "3s",   op: 0.13, rot: -5, slow: true },
    { icon: "infisso",   top: "45%",  left: "50%",  size: 22, delay: "0.5s", op: 0.10, rot: 0 },
  ],
  // 1 — SolutionSection
  [
    { icon: "solare",    top: "8%",   left: "5%",   size: 30, delay: "0.8s", op: 0.16, rot: 10 },
    { icon: "caschetto", top: "70%",  left: "4%",   size: 28, delay: "0s",   op: 0.18, rot: -6, slow: true },
    { icon: "casa",      top: "12%",  right: "5%",  size: 32, delay: "1.5s", op: 0.16, rot: -8 },
    { icon: "chiave",    top: "65%",  right: "7%",  size: 24, delay: "3.2s", op: 0.14, rot: 15, slow: true },
    { icon: "gru",       bottom:"5%", left: "40%",  size: 26, delay: "2s",   op: 0.12, rot: 0 },
  ],
  // 2 — VideoSection
  [
    { icon: "mattone",   top: "10%",  left: "4%",   size: 26, delay: "1s",   op: 0.16, rot: 0 },
    { icon: "metro",     top: "70%",  left: "7%",   size: 24, delay: "2.8s", op: 0.14, rot: -8, slow: true },
    { icon: "infisso",   top: "8%",   right: "5%",  size: 28, delay: "0s",   op: 0.16, rot: 8 },
    { icon: "caschetto", top: "72%",  right: "6%",  size: 30, delay: "1.8s", op: 0.18, rot: -5, slow: true },
    { icon: "solare",    bottom:"8%", left: "45%",  size: 22, delay: "3.5s", op: 0.12, rot: 5 },
  ],
  // 3 — CriteriaSection
  [
    { icon: "gru",       top: "8%",   left: "4%",   size: 30, delay: "0.5s", op: 0.17, rot: 3 },
    { icon: "chiave",    top: "55%",  left: "5%",   size: 24, delay: "2s",   op: 0.14, rot: 15, slow: true },
    { icon: "caschetto", top: "10%",  right: "4%",  size: 28, delay: "1.2s", op: 0.18, rot: -8 },
    { icon: "mattone",   top: "60%",  right: "6%",  size: 26, delay: "3s",   op: 0.14, rot: 0, slow: true },
    { icon: "casa",      bottom:"6%", left: "42%",  size: 24, delay: "0s",   op: 0.12, rot: -5 },
  ],
  // 4 — TestimonialsSection
  [
    { icon: "infisso",   top: "8%",   left: "4%",   size: 28, delay: "0s",   op: 0.16, rot: 6 },
    { icon: "solare",    top: "68%",  left: "5%",   size: 26, delay: "2.2s", op: 0.14, rot: 10, slow: true },
    { icon: "metro",     top: "10%",  right: "5%",  size: 26, delay: "1.5s", op: 0.14, rot: -5 },
    { icon: "caschetto", top: "65%",  right: "4%",  size: 30, delay: "3s",   op: 0.18, rot: -8, slow: true },
    { icon: "gru",       bottom:"5%", left: "44%",  size: 24, delay: "0.8s", op: 0.12, rot: 0 },
    { icon: "mattone",   top: "38%",  left: "3%",   size: 20, delay: "4s",   op: 0.10, rot: 0, slow: true },
  ],
];

interface Props {
  variant?: 0 | 1 | 2 | 3 | 4;
}

export default function FloatingEdiliziaIcons({ variant = 0 }: Props) {
  const layout = LAYOUTS[variant];
  return (
    <>
      {layout.map((p, i) => (
        <div
          key={i}
          className={`absolute pointer-events-none hidden md:block ${p.slow ? "animate-float-slow" : "animate-float"}`}
          style={{
            top: p.top, bottom: p.bottom, left: p.left, right: p.right,
            width: p.size, height: p.size,
            color: "#F97415",
            opacity: p.op,
            animationDelay: p.delay,
            transform: `rotate(${p.rot}deg)`,
            filter: `drop-shadow(0 0 ${Math.round(p.size / 4)}px rgba(249,116,21,0.45))`,
          }}
        >
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d={PATHS[p.icon]} />
          </svg>
        </div>
      ))}
    </>
  );
}
