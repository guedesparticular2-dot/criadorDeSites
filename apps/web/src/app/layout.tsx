import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baixada FC",
  description: "Portal oficial e plataforma de gestão esportiva.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
