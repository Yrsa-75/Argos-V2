import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Editor — AI-powered video editing",
  description:
    "Éditeur vidéo web avec sous-titres IA, chapitrage automatique et génération de clips viraux.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500&family=Montserrat:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface-0 text-txt-1 antialiased">{children}</body>
    </html>
  );
}
