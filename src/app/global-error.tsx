"use client"; // Error boundaries must be Client Components

import "./globals.css";

// Replaces the root layout when active, so it has to bring its own html/body.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <title>Error — JobMatch</title>
        <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
          <h1 className="mb-2 text-2xl font-semibold">Algo ha fallado</h1>
          <p className="mb-6 text-sm text-tinta-2">
            La aplicación no ha podido cargarse.
            {error.digest && (
              <>
                {" "}
                Referencia: <code className="font-mono text-xs">{error.digest}</code>
              </>
            )}
          </p>
          <button
            onClick={() => unstable_retry()}
            className="rounded-sm bg-tinta px-4 py-3 text-sm text-papel transition-opacity hover:opacity-90"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
