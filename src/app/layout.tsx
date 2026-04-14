import type { Metadata } from "next";
import { DM_Sans, Roboto_Mono } from "next/font/google";
import { SidebarController } from "@/components/app/SidebarController";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const mono = Roboto_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Partner Management Bonus Statement",
  description: "Partner management bonus statement automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SidebarController>{children}</SidebarController>
      </body>
    </html>
  );
}
