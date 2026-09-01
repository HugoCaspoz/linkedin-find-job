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
      <h1 className="mb-2 text-2xl font-bold tracking-[-0.025em]">Algo ha fallado</h1>
      <p className="mb-6 text-sm text-tx2">
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
        className="min-h-11 rounded-[10px] bg-acc px-5 text-[15px] font-semibold text-acc-tx transition hover:opacity-[0.88]"
      >
        Reintentar
      </button>
    </div>
  );
}
