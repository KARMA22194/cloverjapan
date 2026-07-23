import { handle, ok } from "@/lib/api/http";
import { requireAdmin } from "@/lib/api/session";
import { buildOpenApiDocument } from "@/lib/api/openapi";

// OpenAPI-3.1-Dokument — nur für ADMIN (die interaktive Doku ist Admin-only).
export function GET() {
  return handle(async () => {
    await requireAdmin();
    return ok(buildOpenApiDocument());
  });
}
