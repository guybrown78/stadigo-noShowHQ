import type { Metadata } from "next";
import { Source_Sans_3 } from "next/font/google";
import { readColorScheme } from "@/lib/color-scheme";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: {
    default: "NoShowHQ",
    template: "%s · NoShowHQ",
  },
  description: "Multi-tenant platform for event-staffing businesses.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const colorScheme = await readColorScheme();

  return (
    <html
      lang="en"
      data-theme={colorScheme}
      className={`${sourceSans.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
