// Typen für die self-hosted Swagger-UI (Subpath-Importe ohne mitgelieferte Typen).
declare module "swagger-ui-dist/swagger-ui.css";

declare module "swagger-ui-dist/swagger-ui-bundle.js" {
  interface SwaggerUIBundleType {
    (options: Record<string, unknown>): unknown;
    presets: { apis: unknown };
  }
  const SwaggerUIBundle: SwaggerUIBundleType;
  export default SwaggerUIBundle;
}
