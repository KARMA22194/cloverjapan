import { NextResponse } from "next/server";

import { buildOpenApiDocument } from "@/lib/api/openapi";

// OpenAPI-3.1-Dokument. Öffentlich (kein Auth) — beschreibt nur die Schnittstelle.
export function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
