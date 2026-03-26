interface AIImageProps {
  prompt: string;
  alt: string;
  className?: string;
}

// Illustration: stressed person at desk with documents
function IllustrationStress() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Desk */}
      <rect x="40" y="210" width="320" height="16" rx="4" fill="#1a2744" opacity="0.15" />
      <rect x="60" y="226" width="12" height="60" rx="4" fill="#1a2744" opacity="0.1" />
      <rect x="328" y="226" width="12" height="60" rx="4" fill="#1a2744" opacity="0.1" />

      {/* Monitor */}
      <rect x="150" y="120" width="160" height="100" rx="8" fill="#1a2744" />
      <rect x="158" y="128" width="144" height="80" rx="4" fill="#0fa68c" opacity="0.15" />
      {/* Screen lines */}
      <rect x="168" y="140" width="80" height="6" rx="3" fill="#0fa68c" opacity="0.6" />
      <rect x="168" y="153" width="60" height="4" rx="2" fill="white" opacity="0.3" />
      <rect x="168" y="163" width="100" height="4" rx="2" fill="white" opacity="0.2" />
      <rect x="168" y="173" width="70" height="4" rx="2" fill="white" opacity="0.2" />
      <rect x="168" y="184" width="90" height="4" rx="2" fill="#0fa68c" opacity="0.4" />
      {/* Monitor stand */}
      <rect x="218" y="220" width="24" height="12" rx="2" fill="#1a2744" opacity="0.2" />
      <rect x="205" y="232" width="50" height="6" rx="3" fill="#1a2744" opacity="0.15" />

      {/* Papers scattered on desk */}
      <rect x="55" y="195" width="70" height="90" rx="4" fill="white" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.15" transform="rotate(-8 55 195)" />
      <rect x="60" y="200" width="60" height="4" rx="2" fill="#1a2744" opacity="0.1" />
      <rect x="60" y="210" width="50" height="3" rx="1.5" fill="#0fa68c" opacity="0.2" />
      <rect x="60" y="217" width="55" height="3" rx="1.5" fill="#1a2744" opacity="0.08" />

      <rect x="70" y="190" width="65" height="85" rx="4" fill="white" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.2" transform="rotate(5 70 190)" />
      <rect x="75" y="198" width="50" height="4" rx="2" fill="#1a2744" opacity="0.12" />
      <rect x="75" y="207" width="40" height="3" rx="1.5" fill="#0fa68c" opacity="0.25" />

      {/* Calculator */}
      <rect x="108" y="180" width="36" height="50" rx="6" fill="#1a2744" opacity="0.12" />
      <rect x="113" y="186" width="26" height="14" rx="3" fill="#0fa68c" opacity="0.3" />
      <circle cx="118" cy="208" r="3" fill="#1a2744" opacity="0.2" />
      <circle cx="126" cy="208" r="3" fill="#1a2744" opacity="0.2" />
      <circle cx="134" cy="208" r="3" fill="#1a2744" opacity="0.2" />
      <circle cx="118" cy="218" r="3" fill="#0fa68c" opacity="0.3" />
      <circle cx="126" cy="218" r="3" fill="#1a2744" opacity="0.2" />
      <circle cx="134" cy="218" r="3" fill="#1a2744" opacity="0.2" />

      {/* Person sitting */}
      {/* Chair */}
      <rect x="80" y="200" width="50" height="10" rx="4" fill="#1a2744" opacity="0.12" />
      <rect x="100" y="210" width="10" height="30" rx="3" fill="#1a2744" opacity="0.1" />
      <rect x="76" y="230" width="58" height="6" rx="3" fill="#1a2744" opacity="0.1" />

      {/* Body */}
      <ellipse cx="105" cy="190" rx="22" ry="28" fill="#1a2744" opacity="0.12" />
      {/* Shirt detail */}
      <ellipse cx="105" cy="192" rx="18" ry="22" fill="#0fa68c" opacity="0.18" />

      {/* Head */}
      <circle cx="105" cy="152" r="22" fill="#f5c9a0" />
      {/* Hair */}
      <ellipse cx="105" cy="134" rx="22" ry="10" fill="#1a2744" opacity="0.7" />
      {/* Face - stressed expression */}
      <circle cx="99" cy="150" r="2.5" fill="#1a2744" opacity="0.6" />
      <circle cx="111" cy="150" r="2.5" fill="#1a2744" opacity="0.6" />
      {/* Frown */}
      <path d="M99 162 Q105 158 111 162" stroke="#1a2744" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
      {/* Stress lines */}
      <path d="M90 140 L86 135" stroke="#1a2744" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      <path d="M120 140 L124 135" stroke="#1a2744" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />

      {/* Arm reaching to head (stressed) */}
      <path d="M85 178 Q75 165 83 148" stroke="#f5c9a0" strokeWidth="10" strokeLinecap="round" fill="none" />

      {/* Floating exclamation */}
      <circle cx="320" cy="100" r="18" fill="#0fa68c" opacity="0.15" />
      <text x="320" y="107" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#0fa68c" opacity="0.7">!</text>

      {/* Coffee cup */}
      <rect x="340" y="195" width="26" height="22" rx="4" fill="white" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.2" />
      <path d="M366 203 Q374 203 374 210 Q374 217 366 217" stroke="#1a2744" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.2" />
      <path d="M343 197 Q353 192 363 197" stroke="#1a2744" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.15" />

      {/* Background dots */}
      <circle cx="360" cy="60" r="4" fill="#0fa68c" opacity="0.1" />
      <circle cx="50" cy="80" r="6" fill="#0fa68c" opacity="0.08" />
      <circle cx="380" cy="160" r="5" fill="#1a2744" opacity="0.06" />
    </svg>
  );
}

// Illustration: bar chart / margins
function IllustrationCharts() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Background card */}
      <rect x="30" y="30" width="340" height="260" rx="16" fill="white" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.1" />

      {/* Title bar */}
      <rect x="50" y="50" width="120" height="8" rx="4" fill="#1a2744" opacity="0.12" />
      <rect x="50" y="64" width="80" height="6" rx="3" fill="#0fa68c" opacity="0.3" />

      {/* KPI badges */}
      <rect x="270" y="46" width="80" height="30" rx="8" fill="#0fa68c" opacity="0.12" />
      <rect x="278" y="54" width="40" height="6" rx="3" fill="#0fa68c" opacity="0.5" />
      <rect x="278" y="64" width="60" height="4" rx="2" fill="#0fa68c" opacity="0.3" />

      {/* Main bar chart */}
      {/* Grid lines */}
      <line x1="60" y1="230" x2="370" y2="230" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.06" />
      <line x1="60" y1="200" x2="370" y2="200" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.06" />
      <line x1="60" y1="170" x2="370" y2="170" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.06" />
      <line x1="60" y1="140" x2="370" y2="140" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.06" />
      <line x1="60" y1="110" x2="370" y2="110" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.06" />

      {/* Bars */}
      {[
        { x: 75, h: 80, label: "Gen" },
        { x: 120, h: 110, label: "Feb" },
        { x: 165, h: 70, label: "Mar" },
        { x: 210, h: 120, label: "Apr" },
        { x: 255, h: 95, label: "Mag" },
        { x: 300, h: 140, label: "Giu", highlight: true },
      ].map((bar, i) => (
        <g key={i}>
          <rect
            x={bar.x}
            y={230 - bar.h}
            width="35"
            height={bar.h}
            rx="5"
            fill={bar.highlight ? "#0fa68c" : "#0fa68c"}
            opacity={bar.highlight ? 0.9 : 0.35 + i * 0.08}
          />
          {bar.highlight && (
            <>
              <rect x={bar.x} y={230 - bar.h} width="35" height="8" rx="5" fill="#0fa68c" opacity="0.6" />
              <text x={bar.x + 17} y={230 - bar.h - 8} textAnchor="middle" fontSize="9" fill="#0fa68c" fontWeight="bold" opacity="0.9">+18%</text>
            </>
          )}
          <text x={bar.x + 17} y="248" textAnchor="middle" fontSize="9" fill="#1a2744" opacity="0.4">{bar.label}</text>
        </g>
      ))}

      {/* Trend line */}
      <polyline
        points="92,210 137,180 182,200 227,170 272,185 317,140"
        stroke="#0fa68c"
        strokeWidth="2.5"
        strokeDasharray="0"
        fill="none"
        opacity="0.5"
      />
      {/* Trend dots */}
      {[
        [92, 210], [137, 180], [182, 200], [227, 170], [272, 185], [317, 140]
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#0fa68c" opacity="0.7" />
      ))}

      {/* Mini pie chart */}
      <circle cx="330" cy="95" r="28" fill="#f8fafb" stroke="#1a2744" strokeWidth="1" strokeOpacity="0.1" />
      <path d="M330 95 L330 67 A28 28 0 0 1 358 95 Z" fill="#0fa68c" opacity="0.8" />
      <path d="M330 95 L358 95 A28 28 0 0 1 330 123 Z" fill="#1a2744" opacity="0.3" />
      <path d="M330 95 L330 123 A28 28 0 0 1 302 95 Z" fill="#0fa68c" opacity="0.3" />
      <circle cx="330" cy="95" r="12" fill="white" />
      <text x="330" y="99" textAnchor="middle" fontSize="8" fill="#1a2744" fontWeight="bold" opacity="0.6">38%</text>

      {/* Legend */}
      <circle cx="55" cy="278" r="5" fill="#0fa68c" opacity="0.8" />
      <text x="65" y="282" fontSize="9" fill="#1a2744" opacity="0.5">Fatturato</text>
      <circle cx="120" cy="278" r="5" fill="#1a2744" opacity="0.3" />
      <text x="130" y="282" fontSize="9" fill="#1a2744" opacity="0.5">Margine</text>
    </svg>
  );
}

// Illustration: team / people
function IllustrationTeam() {
  const people = [
    { x: 80, color: "#0fa68c", initials: "A" },
    { x: 170, color: "#1a2744", initials: "B" },
    { x: 260, color: "#0fa68c", initials: "C" },
  ];

  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Background */}
      <rect x="20" y="180" width="360" height="6" rx="3" fill="#1a2744" opacity="0.06" />

      {people.map((p, i) => (
        <g key={i}>
          {/* Body */}
          <ellipse cx={p.x + 30} cy={210} rx="28" ry="32" fill={p.color} opacity="0.12" />
          {/* Shirt */}
          <ellipse cx={p.x + 30} cy={212} rx="22" ry="26" fill={p.color} opacity="0.18" />
          {/* Head */}
          <circle cx={p.x + 30} cy={158} r="26" fill="#f5c9a0" />
          {/* Hair */}
          <ellipse cx={p.x + 30} cy={137} rx="26" ry="12" fill={p.color} opacity="0.7" />
          {/* Eyes */}
          <circle cx={p.x + 22} cy={155} r="2.5" fill="#1a2744" opacity="0.5" />
          <circle cx={p.x + 38} cy={155} r="2.5" fill="#1a2744" opacity="0.5" />
          {/* Smile */}
          <path d={`M${p.x + 22} 167 Q${p.x + 30} 173 ${p.x + 38} 167`} stroke="#1a2744" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4" />
          {/* Avatar badge */}
          <circle cx={p.x + 30} cy={246} r="18" fill={p.color} opacity="0.15" />
          <text x={p.x + 30} y={251} textAnchor="middle" fontSize="11" fill={p.color} fontWeight="bold" opacity="0.8">{p.initials}</text>
        </g>
      ))}

      {/* Connection lines */}
      <line x1="110" y1="185" x2="170" y2="185" stroke="#0fa68c" strokeWidth="2" strokeDasharray="4 3" strokeOpacity="0.3" />
      <line x1="200" y1="185" x2="260" y2="185" stroke="#0fa68c" strokeWidth="2" strokeDasharray="4 3" strokeOpacity="0.3" />

      {/* Speech bubbles */}
      <rect x="20" y="60" width="90" height="36" rx="10" fill="#0fa68c" opacity="0.12" />
      <polygon points="45,96 55,96 50,108" fill="#0fa68c" opacity="0.12" />
      <rect x="28" y="70" width="60" height="5" rx="2.5" fill="#0fa68c" opacity="0.4" />
      <rect x="28" y="80" width="40" height="4" rx="2" fill="#0fa68c" opacity="0.25" />

      <rect x="200" y="40" width="100" height="40" rx="10" fill="#1a2744" opacity="0.1" />
      <polygon points="230,80 240,80 235,92" fill="#1a2744" opacity="0.1" />
      <rect x="210" y="52" width="70" height="5" rx="2.5" fill="#1a2744" opacity="0.25" />
      <rect x="210" y="62" width="50" height="4" rx="2" fill="#1a2744" opacity="0.18" />

      {/* Floating icons */}
      <circle cx="340" cy="100" r="22" fill="#0fa68c" opacity="0.1" />
      <text x="340" y="107" textAnchor="middle" fontSize="16" fill="#0fa68c" opacity="0.6">+</text>

      <circle cx="50" cy="250" r="16" fill="#1a2744" opacity="0.06" />
    </svg>
  );
}

// Illustration: smartphone / mobile
function IllustrationMobile() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Phone body */}
      <rect x="140" y="20" width="120" height="220" rx="20" fill="#1a2744" />
      <rect x="148" y="32" width="104" height="196" rx="12" fill="#0f1d35" />

      {/* Notch */}
      <rect x="170" y="28" width="60" height="8" rx="4" fill="#0a1222" />

      {/* Screen content */}
      {/* Status bar */}
      <rect x="156" y="48" width="30" height="4" rx="2" fill="white" opacity="0.2" />
      <rect x="228" y="48" width="16" height="4" rx="2" fill="white" opacity="0.2" />

      {/* App header */}
      <rect x="156" y="60" width="88" height="6" rx="3" fill="#0fa68c" opacity="0.7" />

      {/* KPI cards */}
      <rect x="156" y="76" width="40" height="34" rx="6" fill="white" opacity="0.06" />
      <rect x="161" y="82" width="20" height="4" rx="2" fill="#0fa68c" opacity="0.5" />
      <rect x="161" y="90" width="30" height="6" rx="3" fill="white" opacity="0.4" />
      <rect x="161" y="100" width="18" height="3" rx="1.5" fill="white" opacity="0.2" />

      <rect x="204" y="76" width="40" height="34" rx="6" fill="white" opacity="0.06" />
      <rect x="209" y="82" width="20" height="4" rx="2" fill="#0fa68c" opacity="0.5" />
      <rect x="209" y="90" width="28" height="6" rx="3" fill="white" opacity="0.4" />
      <rect x="209" y="100" width="16" height="3" rx="1.5" fill="white" opacity="0.2" />

      {/* Chart area */}
      <rect x="156" y="120" width="88" height="50" rx="6" fill="white" opacity="0.04" />
      <rect x="162" y="126" width="50" height="4" rx="2" fill="white" opacity="0.2" />
      {/* Mini bars */}
      {[
        { x: 163, h: 20 },
        { x: 172, h: 30 },
        { x: 181, h: 18 },
        { x: 190, h: 35 },
        { x: 199, h: 25 },
        { x: 208, h: 38 },
      ].map((b, i) => (
        <rect key={i} x={b.x} y={162 - b.h} width="7" height={b.h} rx="2" fill="#0fa68c" opacity={0.3 + i * 0.1} />
      ))}

      {/* List items */}
      <rect x="156" y="180" width="88" height="12" rx="4" fill="white" opacity="0.04" />
      <rect x="162" y="184" width="50" height="4" rx="2" fill="white" opacity="0.15" />
      <rect x="224" y="184" width="14" height="4" rx="2" fill="#0fa68c" opacity="0.4" />

      <rect x="156" y="197" width="88" height="12" rx="4" fill="white" opacity="0.04" />
      <rect x="162" y="201" width="40" height="4" rx="2" fill="white" opacity="0.15" />
      <rect x="224" y="201" width="14" height="4" rx="2" fill="#0fa68c" opacity="0.4" />

      <rect x="156" y="214" width="88" height="12" rx="4" fill="white" opacity="0.04" />
      <rect x="162" y="218" width="55" height="4" rx="2" fill="white" opacity="0.15" />

      {/* Home bar */}
      <rect x="180" y="230" width="40" height="4" rx="2" fill="white" opacity="0.15" />

      {/* Floating elements outside phone */}
      <rect x="290" y="80" width="70" height="50" rx="10" fill="#0fa68c" opacity="0.1" />
      <rect x="298" y="92" width="45" height="5" rx="2.5" fill="#0fa68c" opacity="0.5" />
      <rect x="298" y="102" width="35" height="4" rx="2" fill="#0fa68c" opacity="0.3" />
      <polygon points="290,118 300,118 295,128" fill="#0fa68c" opacity="0.1" />

      <circle cx="60" cy="130" r="30" fill="#1a2744" opacity="0.05" />
      <rect x="40" y="122" width="40" height="5" rx="2.5" fill="#1a2744" opacity="0.12" />
      <rect x="44" y="132" width="30" height="4" rx="2" fill="#1a2744" opacity="0.08" />

      {/* Signal waves */}
      <path d="M310 50 Q320 40 330 50" stroke="#0fa68c" strokeWidth="2" fill="none" opacity="0.3" />
      <path d="M305 56 Q320 38 335 56" stroke="#0fa68c" strokeWidth="2" fill="none" opacity="0.2" />
      <circle cx="320" cy="60" r="3" fill="#0fa68c" opacity="0.4" />
    </svg>
  );
}

// Illustration: construction site / cantiere
function IllustrationConstruction() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Sky */}
      <rect x="0" y="0" width="400" height="320" fill="#f8fafb" opacity="0.5" />

      {/* Building under construction */}
      <rect x="60" y="100" width="140" height="180" rx="4" fill="#1a2744" opacity="0.08" />
      {/* Floors */}
      {[100, 135, 170, 205, 240].map((y, i) => (
        <line key={i} x1="60" y1={y} x2="200" y2={y} stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.1" />
      ))}
      {/* Windows */}
      {[115, 150, 185, 220].map((y) =>
        [80, 115, 150].map((x, j) => (
          <rect key={`${y}-${j}`} x={x} y={y} width="20" height="16" rx="2" fill="#0fa68c" opacity="0.2" />
        ))
      )}

      {/* Scaffold */}
      <line x1="200" y1="80" x2="200" y2="280" stroke="#1a2744" strokeWidth="3" strokeOpacity="0.15" />
      <line x1="225" y1="80" x2="225" y2="280" stroke="#1a2744" strokeWidth="3" strokeOpacity="0.15" />
      {[80, 115, 150, 185, 220, 255].map((y, i) => (
        <line key={i} x1="200" y1={y} x2="225" y2={y} stroke="#1a2744" strokeWidth="2" strokeOpacity="0.12" />
      ))}
      {/* Diagonal braces */}
      {[80, 150, 220].map((y, i) => (
        <line key={i} x1="200" y1={y} x2="225" y2={y + 35} stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.08" />
      ))}

      {/* Crane */}
      <line x1="270" y1="280" x2="270" y2="50" stroke="#1a2744" strokeWidth="4" strokeOpacity="0.2" />
      <line x1="270" y1="60" x2="360" y2="60" stroke="#0fa68c" strokeWidth="4" strokeOpacity="0.4" />
      <line x1="270" y1="60" x2="210" y2="60" stroke="#1a2744" strokeWidth="3" strokeOpacity="0.2" />
      {/* Crane hook */}
      <line x1="340" y1="60" x2="340" y2="110" stroke="#1a2744" strokeWidth="2" strokeDasharray="3 2" strokeOpacity="0.2" />
      <rect x="326" y="110" width="28" height="18" rx="4" fill="#0fa68c" opacity="0.25" />

      {/* Ground */}
      <rect x="30" y="278" width="340" height="12" rx="4" fill="#1a2744" opacity="0.08" />

      {/* Worker */}
      <circle cx="100" cy="265" r="14" fill="#f5c9a0" />
      <rect x="87" y="250" width="8" height="6" rx="2" fill="#1a2744" opacity="0.5" />
      <rect x="105" y="250" width="8" height="6" rx="2" fill="#1a2744" opacity="0.5" />
      <ellipse cx="100" cy="250" rx="15" ry="5" fill="#0fa68c" opacity="0.4" />
      <ellipse cx="100" cy="280" rx="12" ry="20" fill="#1a2744" opacity="0.12" />

      {/* Hard hat */}
      <ellipse cx="100" cy="250" rx="16" ry="7" fill="#0fa68c" opacity="0.7" />

      {/* Measurement tool floating */}
      <rect x="310" y="160" width="60" height="30" rx="6" fill="#0fa68c" opacity="0.12" />
      <rect x="318" y="168" width="35" height="5" rx="2.5" fill="#0fa68c" opacity="0.5" />
      <rect x="318" y="177" width="25" height="4" rx="2" fill="#0fa68c" opacity="0.3" />

      {/* Decorative dots */}
      <circle cx="350" cy="200" r="5" fill="#0fa68c" opacity="0.1" />
      <circle cx="40" cy="150" r="7" fill="#1a2744" opacity="0.06" />
    </svg>
  );
}

// Illustration: dashboard / software
function IllustrationDashboard() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Laptop base */}
      <ellipse cx="200" cy="290" rx="130" ry="10" fill="#1a2744" opacity="0.06" />
      <rect x="90" y="278" width="220" height="12" rx="4" fill="#1a2744" opacity="0.1" />
      <rect x="70" y="286" width="260" height="8" rx="4" fill="#1a2744" opacity="0.08" />

      {/* Laptop screen */}
      <rect x="80" y="50" width="240" height="168" rx="10" fill="#1a2744" />
      <rect x="88" y="58" width="224" height="152" rx="6" fill="#0f1d35" />

      {/* Screen sidebar */}
      <rect x="88" y="58" width="36" height="152" rx="0" fill="#0a1222" />
      <rect x="88" y="58" width="36" height="152" rx="6 0 0 6" fill="#0a1222" />

      {/* Sidebar items */}
      {[72, 96, 116, 136, 156, 176].map((y, i) => (
        <rect key={i} x="96" y={y} width="20" height="12" rx="4" fill={i === 0 ? "#0fa68c" : "white"} opacity={i === 0 ? 0.3 : 0.06} />
      ))}

      {/* Main area */}
      {/* Header */}
      <rect x="134" y="68" width="80" height="6" rx="3" fill="white" opacity="0.2" />
      <rect x="280" y="66" width="24" height="10" rx="5" fill="#0fa68c" opacity="0.3" />

      {/* Stats row */}
      {[134, 186, 238, 290].map((x, i) => (
        <g key={i}>
          <rect x={x} y={86} width="42" height="28" rx="5" fill="white" opacity="0.05" />
          <rect x={x + 5} y={91} width="24" height="4" rx="2" fill={i % 2 === 0 ? "#0fa68c" : "white"} opacity={i % 2 === 0 ? 0.5 : 0.15} />
          <rect x={x + 5} y={99} width="32" height="7" rx="3" fill="white" opacity="0.3" />
          <rect x={x + 5} y={108} width="18" height="3" rx="1.5" fill="white" opacity="0.1" />
        </g>
      ))}

      {/* Chart */}
      <rect x="134" y="124" width="100" height="70" rx="5" fill="white" opacity="0.04" />
      <rect x="140" y="130" width="50" height="4" rx="2" fill="white" opacity="0.15" />
      {/* Bars */}
      {[
        { x: 143, h: 28 },
        { x: 156, h: 40 },
        { x: 169, h: 20 },
        { x: 182, h: 48 },
        { x: 195, h: 35 },
        { x: 208, h: 55 },
        { x: 221, h: 44 },
      ].map((b, i) => (
        <rect key={i} x={b.x} y={188 - b.h} width="10" height={b.h} rx="2" fill="#0fa68c" opacity={0.25 + i * 0.06} />
      ))}

      {/* Table */}
      <rect x="244" y="124" width="92" height="70" rx="5" fill="white" opacity="0.04" />
      <rect x="250" y="130" width="40" height="4" rx="2" fill="white" opacity="0.15" />
      {[140, 152, 164, 176].map((y, i) => (
        <g key={i}>
          <rect x="250" y={y} width="50" height="4" rx="2" fill="white" opacity="0.1" />
          <rect x="312" y={y} width="18" height="4" rx="2" fill="#0fa68c" opacity={0.2 + i * 0.05} />
        </g>
      ))}

      {/* Laptop hinge */}
      <rect x="80" y="218" width="240" height="6" rx="2" fill="#1a2744" opacity="0.15" />

      {/* Floating badge */}
      <rect x="280" y="170" width="90" height="50" rx="10" fill="#0fa68c" opacity="0.12" />
      <rect x="290" y="182" width="55" height="6" rx="3" fill="#0fa68c" opacity="0.7" />
      <rect x="290" y="193" width="40" height="4" rx="2" fill="#0fa68c" opacity="0.4" />
      <rect x="290" y="202" width="62" height="4" rx="2" fill="#0fa68c" opacity="0.3" />

      <circle cx="40" cy="130" r="20" fill="#1a2744" opacity="0.04" />
      <circle cx="370" cy="80" r="14" fill="#0fa68c" opacity="0.08" />
    </svg>
  );
}

// Illustration: savings / money growth
function IllustrationGrowth() {
  return (
    <svg viewBox="0 0 400 320" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Upward arrow background */}
      <path d="M60 260 L200 80 L340 260" fill="#0fa68c" opacity="0.04" />

      {/* Area chart */}
      <path
        d="M50 250 L90 210 L130 230 L170 170 L210 190 L250 140 L290 110 L330 80 L350 90 L350 260 L50 260 Z"
        fill="#0fa68c"
        opacity="0.08"
      />
      <path
        d="M50 250 L90 210 L130 230 L170 170 L210 190 L250 140 L290 110 L330 80 L350 90"
        stroke="#0fa68c"
        strokeWidth="3"
        fill="none"
        opacity="0.6"
      />

      {/* Data points */}
      {[
        [90, 210], [130, 230], [170, 170], [210, 190], [250, 140], [290, 110], [330, 80]
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5" fill="white" stroke="#0fa68c" strokeWidth="2.5" />
          {i === 6 && (
            <>
              <circle cx={x} cy={y} r="9" fill="#0fa68c" opacity="0.15" />
              <rect x={x - 25} y={y - 30} width="50" height="20" rx="5" fill="#0fa68c" opacity="0.15" />
              <text x={x} y={y - 16} textAnchor="middle" fontSize="9" fill="#0fa68c" fontWeight="bold" opacity="0.9">+38%</text>
            </>
          )}
        </g>
      ))}

      {/* Axis */}
      <line x1="50" y1="260" x2="360" y2="260" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.1" />
      <line x1="50" y1="80" x2="50" y2="260" stroke="#1a2744" strokeWidth="1.5" strokeOpacity="0.1" />

      {/* Y-axis labels */}
      {["0€", "50K", "100K", "150K", "200K"].map((label, i) => (
        <text key={i} x="44" y={260 - i * 45} textAnchor="end" fontSize="8" fill="#1a2744" opacity="0.3">{label}</text>
      ))}

      {/* Coin stack */}
      <ellipse cx="330" cy="200" rx="24" ry="7" fill="#0fa68c" opacity="0.5" />
      <rect x="306" y="190" width="48" height="10" rx="0" fill="#0fa68c" opacity="0.4" />
      <ellipse cx="330" cy="190" rx="24" ry="7" fill="#0fa68c" opacity="0.6" />
      <rect x="306" y="180" width="48" height="10" rx="0" fill="#0fa68c" opacity="0.45" />
      <ellipse cx="330" cy="180" rx="24" ry="7" fill="#0fa68c" opacity="0.7" />

      {/* Euro signs */}
      <circle cx="330" cy="180" r="10" fill="white" opacity="0.3" />
      <text x="330" y="184" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" opacity="0.8">€</text>

      {/* Growth arrow */}
      <path d="M280 150 L310 120 L310 130 L330 130 L330 120 L360 150" stroke="#0fa68c" strokeWidth="0" fill="#0fa68c" opacity="0.12" />

      {/* Decorative elements */}
      <circle cx="60" cy="90" r="16" fill="#1a2744" opacity="0.05" />
      <circle cx="370" cy="230" r="12" fill="#0fa68c" opacity="0.08" />
    </svg>
  );
}

function selectIllustration(prompt: string): React.ReactElement {
  const p = prompt.toLowerCase();

  if (
    p.includes("stress") ||
    p.includes("carta") ||
    p.includes("document") ||
    p.includes("fogli") ||
    p.includes("fattur") ||
    p.includes("calcol") ||
    p.includes("scrivania")
  ) {
    return <IllustrationStress />;
  }

  if (
    p.includes("team") ||
    p.includes("persone") ||
    p.includes("dipendenti") ||
    p.includes("collaboratori") ||
    p.includes("operai") ||
    p.includes("gruppo")
  ) {
    return <IllustrationTeam />;
  }

  if (
    p.includes("mobile") ||
    p.includes("smartphone") ||
    p.includes("telefon") ||
    p.includes("cantiere") && p.includes("app")
  ) {
    return <IllustrationMobile />;
  }

  if (
    p.includes("cantiere") ||
    p.includes("costruzion") ||
    p.includes("edil") ||
    p.includes("lavori") ||
    p.includes("operaio") ||
    p.includes("capocantiere")
  ) {
    return <IllustrationConstruction />;
  }

  if (
    p.includes("dashboard") ||
    p.includes("software") ||
    p.includes("gestional") ||
    p.includes("laptop") ||
    p.includes("computer") ||
    p.includes("schermo")
  ) {
    return <IllustrationDashboard />;
  }

  if (
    p.includes("margin") ||
    p.includes("grafico") ||
    p.includes("crescita") ||
    p.includes("utile") ||
    p.includes("profit") ||
    p.includes("guadagn") ||
    p.includes("risparmio") ||
    p.includes("risultati")
  ) {
    return <IllustrationCharts />;
  }

  // Default: growth illustration
  return <IllustrationGrowth />;
}

export default function AIImage({ prompt, alt, className = "" }: AIImageProps) {
  const illustration = selectIllustration(prompt);

  return (
    <div
      className={`${className} rounded-2xl overflow-hidden flex items-center justify-center`}
      style={{ background: "linear-gradient(135deg, #f8fafb 0%, #eef6f4 100%)" }}
      role="img"
      aria-label={alt}
    >
      <div className="w-full h-full p-4">
        {illustration}
      </div>
    </div>
  );
}
