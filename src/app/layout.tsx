import type { Metadata } from "next";
import { Anton, Archivo, IBM_Plex_Mono, Space_Mono } from "next/font/google";
import "./globals.css";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Cursor } from "@/components/Cursor";
// Commented out with its call below — left here so re-enabling is one uncomment, not two.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Preloader } from "@/components/Preloader";

const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const sans = Archivo({
  variable: "--font-sans",
  weight: ["400", "500", "600", "800", "900"],
  subsets: ["latin"],
  display: "swap",
});

const mono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

/**
 * A second mono, at ONE weight, for the preloader's counter and nothing else.
 *
 * Space Mono is a two-weight family — 400 and 700 — so "thin" does not exist in it; there is
 * no lighter cut to ask for and CSS cannot synthesise one. IBM Plex Mono 200 is the closest
 * thing to the page's voice that ships an extra-light: same engineered, instrument-like
 * register, a fraction of the stroke.
 *
 * Scoped deliberately. It is a variable rather than a change to --font-mono because every
 * other mono thing on this page — labels, the address, the barcode digits — is Space Mono and
 * should stay Space Mono; introducing a second family across the system to thin one number
 * would be the tail wagging the dog.
 */
const monoThin = IBM_Plex_Mono({
  variable: "--font-mono-thin",
  weight: "200",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://simoncardona.dev"),
  title: "Simon Cardona — Frontend Developer",
  description:
    "Frontend developer based in France. Crafting modern, responsive user interfaces with technical expertise and a creative approach.",
  openGraph: {
    title: "Simon Cardona — Frontend Developer",
    description:
      "Frontend developer based in France. Crafting modern, responsive user interfaces.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} ${monoThin.variable} antialiased`}
    >
      <head>
        {/* The two assets the chrome form cannot appear without, fetched from the first byte
            of HTML rather than after hydration + the three.js chunk. Both are read with
            fetch() (three's FileLoader), hence as="fetch" + crossOrigin to match its request
            mode — a mismatch and the browser downloads them twice. */}
        <link rel="preload" href="/env/studio_small_03_1k.hdr" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/models/skull.glb" as="fetch" crossOrigin="anonymous" />
        <link rel="preload" href="/models/frame.glb" as="fetch" crossOrigin="anonymous" />
      </head>
      <body>
        {/* Off while the plates are being worked on. In dev the session guard is bypassed on
            purpose, so it replays on every reload — four seconds of floor plus the lift, in
            front of whatever you are trying to look at. Uncomment to ship. */}
        {/* <Preloader /> */}
        <Cursor />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
