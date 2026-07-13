import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import * as S from "./schemas";

/**
 * Baut das OpenAPI-3.1-Dokument aus den Zod-Schemas (schemas.ts).
 * Die Schemas sind damit die einzige Quelle für Validierung UND Doku.
 */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerComponent("securitySchemes", "sessionCookie", {
    type: "apiKey",
    in: "cookie",
    name: "authjs.session-token",
    description:
      "NextAuth-JWT-Session-Cookie. Wird durch den Login auf /login gesetzt und vom " +
      "Browser automatisch mitgesendet. Für „Try it out“ genügt es, in einem Tab " +
      "angemeldet zu sein.",
  });

  // Response-DTOs
  const User = registry.register("User", S.userSchema);
  const Me = registry.register("Me", S.meSchema);
  const ErrorModel = registry.register("Error", S.errorSchema);

  // Request-Bodies
  const UserCreate = registry.register("UserCreate", S.userCreateBody);
  const UserUpdate = registry.register("UserUpdate", S.userUpdateBody);

  const security = [{ sessionCookie: [] }];
  const errContent = { "application/json": { schema: ErrorModel } };

  const err = (description: string) => ({ description, content: errContent });
  const jsonBody = (schema: Parameters<typeof registry.register>[1]) => ({
    content: { "application/json": { schema } },
    required: true,
  });
  const jsonRes = (
    description: string,
    schema: Parameters<typeof registry.register>[1],
  ) => ({ description, content: { "application/json": { schema } } });

  const common = { 400: err("Ungültige Eingabe"), 401: err("Nicht angemeldet") };
  const adminOnly = { ...common, 403: err("Keine Berechtigung (nur ADMIN)") };

  /* ---------------- Session ---------------- */
  registry.registerPath({
    method: "get",
    path: "/api/v1/me",
    tags: ["Session"],
    summary: "Aktueller Nutzer",
    security,
    responses: { 200: jsonRes("Der angemeldete Nutzer", Me), 401: err("Nicht angemeldet") },
  });

  /* ---------------- Users ---------------- */
  registry.registerPath({
    method: "get",
    path: "/api/v1/users",
    tags: ["Users"],
    summary: "Nutzer auflisten (nur ADMIN)",
    security,
    responses: { 200: jsonRes("Nutzerliste", z.array(User)), ...adminOnly },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/users",
    tags: ["Users"],
    summary: "Nutzer anlegen (nur ADMIN)",
    security,
    request: { body: jsonBody(UserCreate) },
    responses: {
      201: jsonRes("Angelegter Nutzer", User),
      409: err("E-Mail-Adresse bereits vergeben"),
      ...adminOnly,
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/users/{id}",
    tags: ["Users"],
    summary: "Nutzer aktivieren/deaktivieren (nur ADMIN)",
    security,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonBody(UserUpdate),
    },
    responses: {
      200: jsonRes("Aktualisierter Nutzer", User),
      403: err("Keine Berechtigung / eigenes Konto"),
      404: err("Nutzer nicht gefunden"),
      ...common,
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Clover Japan API",
      version: "1.0.0",
      description:
        "REST-API. Alle Endpunkte sind same-origin und nutzen die NextAuth-Session " +
        "(Cookie). Das Frontend spricht ausschließlich über diese API.",
    },
    servers: [{ url: "", description: "Diese Instanz (relativ zur aktuellen Origin)" }],
    tags: [
      { name: "Session", description: "Angemeldeter Nutzer" },
      { name: "Users", description: "Nutzerverwaltung (nur ADMIN)" },
    ],
  });
}
