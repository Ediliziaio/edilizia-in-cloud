/**
 * qrcode.ts — Generatore QR Code SVG minimale, zero dipendenze.
 *
 * Implementazione QR Code Model 2 con error correction L/M (sufficiente per
 * URL brevi). Output: SVG inline pronto per essere embeddato in HTML.
 *
 * Non gestisce tutte le casistiche (alphanumeric mode, ECI). Lavora in modo
 * Byte (8-bit) che è il più universale e copre tutti gli URL.
 */

// ─── Galois Field (GF(256)) tables ──────────────────────────────────────────

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function buildGfTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): number[] {
  const poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly.length = 0;
    poly.push(...next);
  }
  return poly;
}

function rsEncode(data: number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const result = data.concat(new Array(degree).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        result[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return result.slice(data.length);
}

// ─── QR Code data ────────────────────────────────────────────────────────────

interface VersionInfo {
  version: number;
  size: number;
  ec_codewords_per_block: number;
  num_blocks_g1: number;
  data_codewords_g1: number;
  num_blocks_g2: number;
  data_codewords_g2: number;
}

// Solo livello L (più capienza per URL non sensitive)
const VERSIONS_L: VersionInfo[] = [
  { version: 1, size: 21, ec_codewords_per_block: 7, num_blocks_g1: 1, data_codewords_g1: 19, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 2, size: 25, ec_codewords_per_block: 10, num_blocks_g1: 1, data_codewords_g1: 34, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 3, size: 29, ec_codewords_per_block: 15, num_blocks_g1: 1, data_codewords_g1: 55, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 4, size: 33, ec_codewords_per_block: 20, num_blocks_g1: 1, data_codewords_g1: 80, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 5, size: 37, ec_codewords_per_block: 26, num_blocks_g1: 1, data_codewords_g1: 108, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 6, size: 41, ec_codewords_per_block: 18, num_blocks_g1: 2, data_codewords_g1: 68, num_blocks_g2: 0, data_codewords_g2: 0 },
  { version: 7, size: 45, ec_codewords_per_block: 20, num_blocks_g1: 2, data_codewords_g1: 78, num_blocks_g2: 0, data_codewords_g2: 0 },
];

function pickVersion(byteLength: number): VersionInfo {
  for (const v of VERSIONS_L) {
    const totalData = v.num_blocks_g1 * v.data_codewords_g1 + v.num_blocks_g2 * v.data_codewords_g2;
    // 4 bit mode indicator + 8 bit length (v1-9) + data bytes + 4 bit terminator → byte-aligned
    if (byteLength + 2 <= totalData) return v;
  }
  return VERSIONS_L[VERSIONS_L.length - 1];
}

class BitBuffer {
  bits: number[] = [];
  appendBits(value: number, n: number) {
    for (let i = n - 1; i >= 0; i--) {
      this.bits.push((value >> i) & 1);
    }
  }
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | (this.bits[i + j] ?? 0);
      }
      out.push(b);
    }
    return out;
  }
}

function buildDataCodewords(input: string, v: VersionInfo): number[] {
  const totalDataBytes = v.num_blocks_g1 * v.data_codewords_g1 + v.num_blocks_g2 * v.data_codewords_g2;
  const totalDataBits = totalDataBytes * 8;
  const bb = new BitBuffer();
  // Mode = 0b0100 (byte)
  bb.appendBits(0b0100, 4);
  // Length: 8 bit per v1-9
  bb.appendBits(input.length, 8);
  // Data
  const encoder = new TextEncoder();
  const bytes = encoder.encode(input);
  for (const b of bytes) bb.appendBits(b, 8);
  // Terminator + padding
  const remaining = totalDataBits - bb.bits.length;
  bb.appendBits(0, Math.min(4, remaining));
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  // Pad bytes alternating 0xEC, 0x11
  const padded = bb.toBytes();
  let toggle = 0xEC;
  while (padded.length < totalDataBytes) {
    padded.push(toggle);
    toggle = toggle === 0xEC ? 0x11 : 0xEC;
  }
  return padded;
}

function interleave(data: number[], v: VersionInfo): { data: number[]; ec: number[] } {
  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < v.num_blocks_g1; i++) {
    blocks.push(data.slice(offset, offset + v.data_codewords_g1));
    offset += v.data_codewords_g1;
  }
  for (let i = 0; i < v.num_blocks_g2; i++) {
    blocks.push(data.slice(offset, offset + v.data_codewords_g2));
    offset += v.data_codewords_g2;
  }
  const ecs = blocks.map((b) => rsEncode(b, v.ec_codewords_per_block));

  // Interleave data
  const maxData = Math.max(...blocks.map((b) => b.length));
  const dataOut: number[] = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) {
      if (i < b.length) dataOut.push(b[i]);
    }
  }
  // Interleave EC
  const maxEc = v.ec_codewords_per_block;
  const ecOut: number[] = [];
  for (let i = 0; i < maxEc; i++) {
    for (const e of ecs) {
      if (i < e.length) ecOut.push(e[i]);
    }
  }
  return { data: dataOut, ec: ecOut };
}

// ─── Matrix construction ────────────────────────────────────────────────────

function makeMatrix(v: VersionInfo, allBytes: number[]): boolean[][] {
  const size = v.size;
  const matrix: (boolean | null)[][] = [];
  const reserved: boolean[][] = [];
  for (let i = 0; i < size; i++) {
    matrix.push(new Array(size).fill(null));
    reserved.push(new Array(size).fill(false));
  }

  // Finder patterns + separators
  const placeFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const isFinder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          ((dr === 0 || dr === 6) || (dc === 0 || dc === 6) || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        matrix[rr][cc] = isFinder;
        reserved[rr][cc] = true;
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
    reserved[6][i] = true;
    reserved[i][6] = true;
  }

  // Dark module
  matrix[size - 8][8] = true;
  reserved[size - 8][8] = true;

  // Format info reserved area (will fill after mask selection)
  for (let i = 0; i < 9; i++) reserved[8][i] = true;
  for (let i = 0; i < 8; i++) reserved[i][8] = true;
  for (let i = size - 7; i < size; i++) reserved[8][i] = true;
  for (let i = size - 8; i < size; i++) reserved[i][8] = true;

  // Alignment pattern per version 2-7
  const alignPositions: Record<number, number[]> = {
    2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38],
  };
  if (alignPositions[v.version]) {
    const positions = alignPositions[v.version];
    for (const ar of positions) {
      for (const ac of positions) {
        // skip overlap with finders
        if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = ar + dr, cc = ac + dc;
            if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
            const isCenter = dr === 0 && dc === 0;
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            matrix[rr][cc] = isCenter || isBorder;
            reserved[rr][cc] = true;
          }
        }
      }
    }
  }

  // Place data bytes in zigzag
  const bits: number[] = [];
  for (const b of allBytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const cc = col - c;
        if (!reserved[r][cc] && bitIdx < bits.length) {
          matrix[r][cc] = bits[bitIdx] === 1;
          bitIdx++;
        }
      }
    }
    upward = !upward;
  }
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (matrix[i][j] === null) matrix[i][j] = false;
    }
  }

  // Apply best mask (try all 8, pick lowest penalty)
  const masks = [
    (r: number, c: number) => (r + c) % 2 === 0,
    (r: number, _c: number) => r % 2 === 0,
    (_r: number, c: number) => c % 3 === 0,
    (r: number, c: number) => (r + c) % 3 === 0,
    (r: number, c: number) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r: number, c: number) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r: number, c: number) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r: number, c: number) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix: boolean[][] = matrix as boolean[][];

  for (let m = 0; m < 8; m++) {
    const test: boolean[][] = matrix.map((row, r) =>
      row.map((cell, c) => {
        if (reserved[r][c]) return cell as boolean;
        return masks[m](r, c) ? !cell : (cell as boolean);
      }),
    );
    placeFormatInfo(test, m, size);
    const p = penalty(test);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = m;
      bestMatrix = test;
    }
  }

  return bestMatrix;
}

function placeFormatInfo(matrix: boolean[][], maskNum: number, size: number) {
  // Format = EC level L (01) + mask (3 bits)
  const formatBits = 0b01_000 | maskNum;
  // BCH(15,5) + XOR mask
  let bch = formatBits << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if (bch & (1 << i)) bch ^= gen << (i - 10);
  }
  const fullFormat = ((formatBits << 10) | bch) ^ 0b101010000010010;

  const setBit = (r: number, c: number, b: number) => {
    matrix[r][c] = !!b;
  };

  // Top-left
  for (let i = 0; i <= 5; i++) setBit(8, i, (fullFormat >> i) & 1);
  setBit(8, 7, (fullFormat >> 6) & 1);
  setBit(8, 8, (fullFormat >> 7) & 1);
  setBit(7, 8, (fullFormat >> 8) & 1);
  for (let i = 9; i <= 14; i++) setBit(14 - i, 8, (fullFormat >> i) & 1);

  // Top-right / bottom-left
  for (let i = 0; i < 8; i++) setBit(8, size - 1 - i, (fullFormat >> i) & 1);
  for (let i = 0; i < 7; i++) setBit(size - 1 - i, 8, (fullFormat >> (14 - i)) & 1);

  // Dark module
  matrix[size - 8][8] = true;
}

function penalty(matrix: boolean[][]): number {
  const size = matrix.length;
  let p = 0;
  // Rule 1: 5+ in row/col
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        run++;
      } else {
        if (run >= 5) p += run - 2;
        run = 1;
      }
    }
    if (run >= 5) p += run - 2;
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (matrix[r][c] === matrix[r - 1][c]) {
        run++;
      } else {
        if (run >= 5) p += run - 2;
        run = 1;
      }
    }
    if (run >= 5) p += run - 2;
  }
  return p;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function generateQrSvg(text: string, opts: { size?: number; margin?: number; color?: string; background?: string } = {}): string {
  const v = pickVersion(new TextEncoder().encode(text).length);
  const dataBytes = buildDataCodewords(text, v);
  const { data, ec } = interleave(dataBytes, v);
  const allBytes = [...data, ...ec];
  const matrix = makeMatrix(v, allBytes);

  const size = matrix.length;
  const margin = opts.margin ?? 2;
  const pixelSize = opts.size ?? 200;
  const color = opts.color ?? "#000";
  const bg = opts.background ?? "#fff";
  const totalSize = size + margin * 2;
  const cellSize = pixelSize / totalSize;

  let path = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * cellSize;
        const y = (r + margin) * cellSize;
        path += `M${x.toFixed(2)},${y.toFixed(2)} h${cellSize.toFixed(2)} v${cellSize.toFixed(2)} h-${cellSize.toFixed(2)}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelSize} ${pixelSize}" width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges"><rect width="${pixelSize}" height="${pixelSize}" fill="${bg}"/><path d="${path.trim()}" fill="${color}"/></svg>`;
}
