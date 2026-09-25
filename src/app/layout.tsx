import { Suspense, type CSSProperties, type ReactNode } from "react";
import type { Metadata } from "next";
import ProjectProductAuto from "@/components/master/project-product-auto";
import { InlineFormValidation } from "@/components/inline-form-validation";
import { GlobalNumberAutoFormat } from "@/components/forms/global-number-auto-format";
import { GlobalActionFeedback } from "@/components/global-action-feedback";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMPT V2",
  description: "Sistem Manajemen Produksi Terpadu",
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
