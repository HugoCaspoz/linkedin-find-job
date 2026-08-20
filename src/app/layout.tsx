import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/**
 * One family in two widths rather than two unrelated faces: the width axis
 * gives the display voice its own character while staying related to the body
 * text, and it is one fewer file to download.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  // Without this the loader ships weights only and `font-variation-settings:
  // "wdth"` silently does nothing.
  axes: ["wdth"],
});

/** Plex was drawn for technical documentation, which is exactly the register
 * every measured value on this sheet is written in. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Job Matcher",
  description:
    "Sube tu CV y encuentra ofertas de empleo que encajan con tus skills.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      // The boot script writes data-theme onto this element before React
      // hydrates, so the server markup and the live DOM differ by design.
      // Without this, React logs a hydration mismatch on every page load.
      suppressHydrationWarning
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        {/* Inline and synchronous, ahead of everything else: an external or
            deferred script would run after the browser has already painted,
            and the light palette would flash before the dark one applied. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
