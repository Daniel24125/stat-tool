import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: "StatTool",
  description: "Automatic statistical analysis, multivariate methods and design of experiments.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${hanken.variable} ${newsreader.variable}`}>
      <body>
        {children}
        <Toaster position="bottom-right" toastOptions={{ className: "!font-sans !rounded-[10px] !border-rule" }} />
      </body>
    </html>
  );
}
