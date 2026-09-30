import { Suspense, type CSSProperties, type ReactNode } from "react";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

import ProjectProductAuto from "@/components/master/project-product-auto";
import { InlineFormValidation } from "@/components/inline-form-validation";
import { GlobalNumberAutoFormat } from "@/components/forms/global-number-auto-format";
import { GlobalActionFeedback } from "@/components/global-action-feedback";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMPT V2 - Kreasi Dinamika",
  description: "Sistem Manajemen Produksi Terpadu",
  manifest: "/manifest.json",
  icons: {
    icon: "/IMG_20261001_015858_661.jpg",
    shortcut: "/IMG_20261001_015858_661.jpg",
    apple: "/IMG_20261001_015858_661.jpg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SMPT V2",
  },
};

const fontVariables = {
  "--font-geist-sans": "Arial, Helvetica, sans-serif",
  "--font-geist-mono": "Consolas, 'Courier New', monospace",
} as CSSProperties;

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="id" style={fontVariables}>
      <body className="antialiased">
        <Suspense fallback={null}>
          <GlobalActionFeedback />
        </Suspense>
        <ProjectProductAuto />
        <InlineFormValidation />
        <GlobalNumberAutoFormat />
        {children}
      </body>
    </html>
  );
}
