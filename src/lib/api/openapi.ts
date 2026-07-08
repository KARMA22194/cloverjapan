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
  const Project = registry.register("Project", S.projectSchema);
  registry.register("ProjectMeta", S.projectMetaSchema);
  const TimeEntry = registry.register("TimeEntry", S.timeEntrySchema);
  const User = registry.register("User", S.userSchema);
  const Me = registry.register("Me", S.meSchema);
  const MonthReport = registry.register("MonthReport", S.monthReportSchema);
  const YearReport = registry.register("YearReport", S.yearReportSchema);
  const ErrorModel = registry.register("Error", S.errorSchema);

  // Request-Bodies
  const TimeEntryCreate = registry.register("TimeEntryCreate", S.timeEntryCreateBody);
  const TimeEntryUpdate = registry.register("TimeEntryUpdate", S.timeEntryUpdateBody);
  const ProjectCreate = registry.register("ProjectCreate", S.projectCreateBody);
  const ProjectUpdate = registry.register("ProjectUpdate", S.projectUpdateBody);
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

  /* ---------------- Time Entries ---------------- */
  registry.registerPath({
    method: "get",
    path: "/api/v1/time-entries",
    tags: ["Time Entries"],
    summary: "Einträge eines Tages (aktueller Nutzer)",
    security,
    request: { query: z.object({ date: S.dateParamSchema }) },
    responses: {
      200: jsonRes("Liste der Einträge", z.array(TimeEntry)),
      ...common,
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/time-entries",
    tags: ["Time Entries"],
    summary: "Eintrag anlegen",
    security,
    request: { body: jsonBody(TimeEntryCreate) },
    responses: { 201: jsonRes("Angelegter Eintrag", TimeEntry), ...common },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/time-entries/{id}",
    tags: ["Time Entries"],
    summary: "Eigenen Eintrag ändern",
    security,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonBody(TimeEntryUpdate),
    },
    responses: {
      200: jsonRes("Aktualisierter Eintrag", TimeEntry),
      404: err("Eintrag nicht gefunden"),
      ...common,
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/v1/time-entries/{id}",
    tags: ["Time Entries"],
    summary: "Eigenen Eintrag löschen",
    security,
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: jsonRes("Gelöscht", z.object({ id: z.string(), deleted: z.literal(true) })),
      404: err("Eintrag nicht gefunden"),
      ...common,
    },
  });

  /* ---------------- Projects ---------------- */
  registry.registerPath({
    method: "get",
    path: "/api/v1/projects",
    tags: ["Projects"],
    summary: "Projekte auflisten",
    description:
      "scope=bookable (Default): buchbare Projekte des Nutzers. scope=all: alle inkl. archivierter (nur ADMIN).",
    security,
    request: { query: z.object({ scope: z.enum(["bookable", "all"]).optional() }) },
    responses: { 200: jsonRes("Projektliste", z.array(Project)), ...adminOnly },
  });
  registry.registerPath({
    method: "post",
    path: "/api/v1/projects",
    tags: ["Projects"],
    summary: "Projekt anlegen (nur ADMIN)",
    security,
    request: { body: jsonBody(ProjectCreate) },
    responses: {
      201: jsonRes("Angelegtes Projekt", Project),
      409: err("Projekt-Kürzel bereits vergeben"),
      ...adminOnly,
    },
  });
  registry.registerPath({
    method: "patch",
    path: "/api/v1/projects/{id}",
    tags: ["Projects"],
    summary: "Projekt archivieren/reaktivieren (nur ADMIN)",
    security,
    request: {
      params: z.object({ id: z.string() }),
      body: jsonBody(ProjectUpdate),
    },
    responses: {
      200: jsonRes("Aktualisiertes Projekt", Project),
      404: err("Projekt nicht gefunden"),
      ...adminOnly,
    },
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

  /* ---------------- Reports ---------------- */
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/month",
    tags: ["Reports"],
    summary: "Monatsbericht (Tag × Projekt)",
    security,
    request: {
      query: z.object({
        year: z.coerce.number().int().openapi({ example: 2026 }),
        month: z.coerce.number().int().openapi({ example: 7, description: "1–12" }),
      }),
    },
    responses: { 200: jsonRes("Monatsmatrix", MonthReport), ...common },
  });
  registry.registerPath({
    method: "get",
    path: "/api/v1/reports/year",
    tags: ["Reports"],
    summary: "Jahresbericht (Monat × Projekt)",
    security,
    request: {
      query: z.object({ year: z.coerce.number().int().openapi({ example: 2026 }) }),
    },
    responses: { 200: jsonRes("Jahresmatrix", YearReport), ...common },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Time Tracker API",
      version: "1.0.0",
      description:
        "REST-API der Zeiterfassung. Alle Endpunkte sind same-origin und nutzen die " +
        "NextAuth-Session (Cookie). Das Frontend spricht ausschließlich über diese API.",
    },
    servers: [{ url: "", description: "Diese Instanz (relativ zur aktuellen Origin)" }],
    tags: [
      { name: "Session", description: "Angemeldeter Nutzer" },
      { name: "Time Entries", description: "Zeiteinträge erfassen/ändern/löschen" },
      { name: "Projects", description: "Projekte (Lesen für alle, Schreiben nur ADMIN)" },
      { name: "Users", description: "Nutzerverwaltung (nur ADMIN)" },
      { name: "Reports", description: "Monats- und Jahresauswertungen" },
    ],
  });
}
