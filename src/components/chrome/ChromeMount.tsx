"use client";

import dynamic from "next/dynamic";

const ChromeCanvas = dynamic(
  () => import("./ChromeCanvas").then((m) => m.ChromeCanvas),
  {
    ssr: false,
    loading: () => null,
  }
);

type Props = {
  className?: string;
  style?: React.CSSProperties;
  distort?: number;
  speed?: number;
  scale?: number;
  reactToScroll?: boolean;
  /** intensity of the CSS silver halo behind the form, 0 to disable */
  glow?: number;
};

export function ChromeMount({ className, style, glow = 0.24, ...rest }: Props) {
  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {glow > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "20%",
            borderRadius: "50%",
            background: `radial-gradient(closest-side, rgba(214,216,222,${glow}), rgba(160,163,172,${
              glow * 0.4
            }) 46%, transparent 72%)`,
            filter: "blur(26px)",
          }}
        />
      )}
      <div style={{ position: "absolute", inset: 0 }}>
        <ChromeCanvas {...rest} />
      </div>
    </div>
  );
}
