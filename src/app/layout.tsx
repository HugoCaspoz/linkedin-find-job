import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/** The whole interface, prose and controls alike. */
const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

/** Numbers only: scores, fractions, counts, years. Never a sentence. */
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "JobMatch",
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
      className={`${instrument.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* Inline and synchronous, ahead of everything else: an external or
            deferred script would run after the browser has already painted,
            and the dark palette would flash before the light one applied. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
