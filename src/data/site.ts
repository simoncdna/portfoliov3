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
  languages: string[];
  tools: string[];
};

export const works: Work[] = [
  {
    index: "01",
    title: "Pictarine",
    timeline: "2024 — Today",
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
    timeline: "2023 — 2024",
    url: "https://forma.legal/",
    summary:
      "A SaaS platform for legal and accounting professionals — client messaging, document management and activity scheduling in one workspace.",
    languages: ["Next.js", "TypeScript"],
    tools: ["Tailwind", "Zustand", "React-Query", "Zod", "React-Hook-Form", "Figma"],
  },
  {
    index: "03",
    title: "Crazee.B",
    timeline: "Jan 2023 — May 2023",
    url: "https://crazee-burger-ki3o6okfp-simoncdn.vercel.app/",
    summary:
      "An online restaurant ordering dashboard designed to provide a smooth and enjoyable ordering experience.",
    languages: ["React.js"],
    tools: ["Styled-Components", "Firebase", "Jest", "Context", "Figma"],
  },
  {
    index: "04",
    title: "Workshopbya",
    timeline: "Dec 2022 — Jan 2023",
    url: "https://www.workshopbya.com/",
    summary:
      "A showcase website with blog integration, highlighting the community's expertise and creative identity.",
    languages: ["Next.js", "TypeScript"],
    tools: ["Tailwind", "Sanity.io", "Sendgrid", "Framer-Motion", "Figma"],
  },
];
