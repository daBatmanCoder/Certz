import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://certz.example"),
  title: {
    default: "Certz — A confidential, on-chain certificate authority",
    template: "%s — Certz",
  },
  description:
    "Certz is a confidential, on-chain certificate authority built on Oasis Sapphire. The CA key lives inside a TEE, domain ownership is proven with DNS-01, and every issuance is anchored in a public on-chain transparency log.",
  applicationName: "Certz",
  openGraph: {
    title: "Certz — A confidential, on-chain certificate authority",
    description:
      "A confidential CA whose signing key never leaves a TEE, with a public on-chain transparency log. Research demo on Oasis Sapphire testnet.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="relative z-10 flex min-h-screen flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
