/**
 * Real EAN-13 barcode (the retail standard: 13 digits, the last being a
 * computed check digit). Renders genuine, scannable bar modules plus the
 * digits underneath in the classic 1 + 6 + 6 layout.
 *
 * Pass 12 meaningful digits via `code`; the 13th (check) digit is computed.
 */

// 7-module encodings
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
// parity of the 6 left digits, selected by the first digit
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function checkDigit(d12: number[]): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d12[i] * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function normalize(code: string): number[] {
  const only = code.replace(/\D/g, "").slice(0, 12).padStart(12, "0");
  const d = only.split("").map(Number);
  return [...d, checkDigit(d)];
}

function modules(d: number[]): string {
  const parity = PARITY[d[0]];
  let s = "101"; // start guard
  for (let i = 0; i < 6; i++) s += (parity[i] === "L" ? L : G)[d[i + 1]];
  s += "01010"; // center guard
  for (let i = 0; i < 6; i++) s += R[d[i + 7]];
  s += "101"; // end guard
  return s;
}

export function BarcodeEAN13({
  code,
  className = "",
  gaps = [3, 6, 9],
}: {
  code: string;
  className?: string;
  /** 0-based digit positions to blank out (leaves a hole in the number row) */
  gaps?: number[];
}) {
  const hidden = new Set(gaps);
  const d = normalize(code);
  const mods = modules(d);
  const digits = d.join("");

  let x = 0;
  const rects = mods.split("").map((m, i) => {
    const rect =
      m === "1" ? (
        <rect key={i} x={x} y={0} width={1} height={40} fill="var(--silver-bright)" />
      ) : null;
    x += 1;
    return rect;
  });

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <svg
        aria-hidden
        viewBox={`0 0 ${mods.length} 40`}
        preserveAspectRatio="none"
        role="presentation"
        className="h-7 w-full"
      >
        {rects}
      </svg>
      {/* 13 digits spread edge-to-edge so they span the full barcode width */}
      <span
        aria-label={`Barcode ${digits}`}
        className="flex w-full justify-between font-mono text-[0.58rem] leading-none text-silver-muted"
      >
        {digits.split("").map((c, i) => (
          <span key={i}>{hidden.has(i) ? " " : c}</span>
        ))}
      </span>
    </span>
  );
}
