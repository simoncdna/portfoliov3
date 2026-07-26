"use client";

import { useEffect, useState } from "react";
import { MagneticLink } from "./MagneticLink";

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
					</span>
				</MagneticLink>
			</nav>
		</header>
	);
}
