import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { NONCE_HEADER } from "@/lib/csp";
import { PwaRegister } from "@/components/PwaRegister";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "Clover Japan",
  description: "Kollaborativer Japan-Reiseplaner",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Clover Japan" },
  // Icons kommen aus den Datei-Konventionen (src/app/{favicon.ico,icon.png,apple-icon.png}).
};

export const viewport: Viewport = {
  themeColor: "#009bc9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Setzt das Theme synchron vor dem ersten Paint → kein Flash (FOUC).
const themeInit = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Nonce aus der Middleware (siehe src/lib/csp.ts) — ohne ihn würde das
  // Theme-Script von der CSP blockiert und die Seite flackerte beim Laden hell auf.
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {children}
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
