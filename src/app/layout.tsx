import { ToastHost } from "@/components/toast";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mosaic Labs Admin", template: "%s · Mosaic Labs Admin" },
  icons: { icon: "/brand/icon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="antialiased">
      <body className="min-h-screen font-sans">
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
