"use client";

import { useEffect, useRef } from "react";
import "swagger-ui-dist/swagger-ui.css";

/**
 * Bettet die (self-hosted) Swagger-UI ein. Der schwere Browser-Bundle wird
 * dynamisch nur im Client geladen — daher kein SSR-Problem mit `window`.
 * `withCredentials` sorgt dafür, dass „Try it out“ das Session-Cookie mitsendet.
 */
export function SwaggerView({ specUrl }: { specUrl: string }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let cancelled = false;
    (async () => {
      const { default: SwaggerUIBundle } = await import("swagger-ui-dist/swagger-ui-bundle.js");
      if (cancelled) return;
      SwaggerUIBundle({
        url: specUrl,
        domNode: document.getElementById("swagger-ui"),
        deepLinking: true,
        withCredentials: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        docExpansion: "list",
        tryItOutEnabled: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return <div id="swagger-ui" />;
}
