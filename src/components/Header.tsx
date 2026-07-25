"use client";

import { useEffect, useState } from "react";
import { MagneticLink } from "./MagneticLink";
import { ScrambleText } from "./ScrambleText";

const NAV = [
	{ label: "Index", href: "#top" },
	{ label: "About", href: "#about" },
	{ label: "Work", href: "#work" },
	{ label: "Contact", href: "#contact" },
];

export function Header() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 40);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className="fixed inset-x-0 top-0 z-50 transition-colors duration-500"
		>
			<nav className="shell flex items-center justify-between py-4">
				<MagneticLink href="#top" ariaLabel="Back to top" strength={4}>
					<span className="flex flex-col leading-none">
						<span className="text-[0.95rem] font-extrabold uppercase tracking-tight text-chrome">
							Simon Cardona
						</span>
						<span className="font-mono-label mt-1">// Frontend Developer</span>
					</span>
				</MagneticLink>

				<ul className="hidden items-center gap-5 sm:flex">
					{NAV.slice(1).map((item) => (
						<li key={item.href}>
							<MagneticLink href={item.href} strength={4}>
								<ScrambleText
									text={item.label}
									prefix="[ "
									suffix=" ]"
									className="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-silver transition-colors duration-200 hover:text-chrome"
								/>
							</MagneticLink>
						</li>
					))}
				</ul>
			</nav>
		</header>
	);
}
