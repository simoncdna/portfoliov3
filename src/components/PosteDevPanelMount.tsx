"use client";

import dynamic from "next/dynamic";

/**
 * LE PANNEAU NE DOIT PAS ENTRER DANS LE BUNDLE DE PROD. Même doctrine que le studio
 * Theatre (voir cameraStage) : `dynamic()` au TOP-LEVEL du module — les docs Next sont
 * explicites, il ne peut pas vivre dans le rendu — et la garde NODE_ENV rend la branche
 * morte au build, donc le chunk existe mais n'est jamais demandé.
 *
 * `ssr: false` doit vivre dans un Client Component ; en Server Component, Next lève. D'où
 * ce fichier, dont c'est la seule raison d'être : page.tsx est un composant serveur.
 *
 * Le panneau touche `document` et `navigator.clipboard` au montage, et son état d'ouverture
 * n'a aucun équivalent serveur — rien à préhydrater, donc ssr: false plutôt qu'un garde
 * `typeof window` de plus.
 */
const Panel = dynamic(() => import("./PosteDevPanel").then((m) => m.PosteDevPanel), {
  ssr: false,
});

export function PosteDevPanelMount() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Panel />;
}
