export const site = {
  name: "Simon Cardona",
  role: "Frontend Developer",
  location: "France",
  email: "cdna.simon@gmail.com",
  edition: "20.24 — SCRAPBOOK",
  // Read in order by the About section's pinned reveal: each entry is one
  // paragraph, unveiled after the one before it. The first is styled as the lead.
  bio: [
    "Frontend developer based in France.",
    "Passionate about crafting modern and responsive user interfaces, I bring technical expertise and a creative approach to each project.",
    "With years of experience, I collaborate with businesses and startups to turn their ideas into high-performing, user-friendly web applications.",
    "What I care about most is how an interface feels — the timing of a transition, the weight of a hover, the detail you only catch on a second visit. It's the part I keep refining long after everything already works.",
  ],
  languages: [
    "JavaScript",
    "TypeScript",
    "React.js",
    "Next.js",
    "Vue.js",
    "Nuxt.js",
  ],
  tools: [
    "Tailwind",
    "Styled-Components",
    "Zustand",
    "Zod",
    "React-Query",
    "Jest",
    "React Testing Library",
    "Git",
    "Figma",
    "Nvim",
  ],
  socials: [
    { label: "Email", href: "mailto:cdna.simon@gmail.com" },
    { label: "GitHub", href: "https://github.com/simoncdna" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/simon-cardona/" },
  ],
} as const;

export type Work = {
  index: string;
  title: string;
  timeline: string;
  url: string;
  summary: string;
  /**
   * Kept, and deliberately NOT rendered in the Work rows.
   *
   * A stack list is a résumé convention — it is there to be matched by a keyword
   * search, not read. On a site whose own reason for existing is to demonstrate
   * front-end craft, printing "Next.js, TypeScript" next to the proof of it says
   * less than the proof does. If it ever needs to be visible, the place for it is a
   * case-study page or a CV, where someone has come looking for it.
   */
  languages: string[];
  tools: string[];
};

/*
 * Dates use the universe's own notation, not calendar prose: `20.24`, the split
 * year MASTER.md sets out for meta lines ("// SCRAPBOOK 20.01") and that the footer
 * already carries ("20.24 — SCRAPBOOK / N°003"). It reads as an edition number
 * rather than as a CV entry, which is the whole register of the section — numbered
 * plates in a catalogue.
 *
 * Conventions: a bare `20.YY` for a single edition, `20.YY — YY` for a range (the
 * second year shortened, as print does), and an OPEN range — a trailing dash with
 * nothing after it — for work still running. An arrow would have read better on its
 * own, but the row already grows an arrow on hover for the outbound link, and two
 * arrows a few centimetres apart meaning different things is one too many.
 * Months are dropped: at this scale they were noise, and they broke the column.
 */
export const works: Work[] = [
  {
    index: "01",
    title: "Pictarine",
    timeline: "20.24 —",
    // TODO(simon): your own words. Left empty rather than invented — the row and
    // its fold render fine without them, and a portfolio should not describe work
    // in a sentence you did not write. The URL is the company's; swap it if the
    // row should point somewhere more specific.
    url: "https://www.pictarine.com/",
    summary: "",
    languages: [],
    tools: [],
  },
  {
    index: "02",
    title: "Forma",
    timeline: "20.23 — 24",
    url: "https://forma.legal/",
    summary:
      "A SaaS platform for legal and accounting professionals — client messaging, document management and activity scheduling in one workspace.",
    languages: ["Next.js", "TypeScript"],
    tools: ["Tailwind", "Zustand", "React-Query", "Zod", "React-Hook-Form", "Figma"],
  },
  {
    index: "03",
    title: "Crazee.B",
    timeline: "20.23",
    url: "https://crazee-burger-ki3o6okfp-simoncdn.vercel.app/",
    summary:
      "An online restaurant ordering dashboard designed to provide a smooth and enjoyable ordering experience.",
    languages: ["React.js"],
    tools: ["Styled-Components", "Firebase", "Jest", "Context", "Figma"],
  },
  {
    index: "04",
    title: "Klay",
    timeline: "20.24",
    url: "https://klay-craft.netlify.app",
    summary:
      "Klay merges the craft of pottery with a modern touch — selling ceramics and opening workshop registration through an accessible online platform.",
    languages: ["Nuxt.js", "TypeScript"],
    tools: ["Tailwind", "Pinia", "Figma"],
  },
];
