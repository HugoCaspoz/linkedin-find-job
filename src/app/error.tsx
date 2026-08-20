"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-20">
      <h1 className="mb-2 text-2xl font-semibold">Algo ha fallado</h1>
      <p className="mb-6 text-sm text-tinta-2">
        Ha habido un error inesperado. Puedes reintentar.
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
  );
}
