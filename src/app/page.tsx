import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ChromeStage } from "@/components/chrome/ChromeStage";
import { Hero } from "@/sections/Hero";
import { About } from "@/sections/About";
import { Work } from "@/sections/Work";
import { Contact } from "@/sections/Contact";

export default function Home() {
  return (
    <>
      <a href="#work" className="skip-link">
        Skip to work
      </a>
      <Header />
      <ChromeStage />
      <main>
        <Hero />
        <About />
        <Work />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
