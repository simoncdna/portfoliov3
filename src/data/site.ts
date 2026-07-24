export const site = {
  name: "Simon Cardona",
  role: "Frontend Developer",
  location: "France",
  email: "cdna.simon@gmail.com",
  edition: "20.24 — SCRAPBOOK",
  bio: [
    "Frontend developer based in France.",
    "Passionate about crafting modern and responsive user interfaces, I bring technical expertise and a creative approach to each project.",
    "With years of experience, I collaborate with businesses and startups to turn their ideas into high-performing, user-friendly web applications.",
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
    title: "Klay",
    timeline: "2024",
    url: "https://klay-craft.netlify.app",
    summary:
      "Klay merges the craft of pottery with a modern touch — selling ceramics and opening workshop registration through an accessible online platform.",
    languages: ["Nuxt.js", "TypeScript"],
    tools: ["Tailwind", "Pinia", "Figma"],
  },
  {
    index: "02",
    title: "Forma",
    timeline: "May 2023 — Today",
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
