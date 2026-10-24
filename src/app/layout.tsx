import type { Metadata } from "next";
import { Geist_Mono, Jost } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/app-shell/AppProvider";
import { MotionRoot } from "@/components/ui/MotionRoot";
import { AppShell } from "@/components/app-shell/AppShell";

const jost = Jost({ variable: "--font-jost", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Heavy Brains — Find the talent your usual search misses",
  description: "Discover the companies behind relevant experience. Find the people worth looking at. Understand why they fit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jost.variable} ${geistMono.variable} h-full antialiased`}>
      <body>
        <AppProvider>
          <MotionRoot><AppShell>{children}</AppShell></MotionRoot>
        </AppProvider>
      </body>
    </html>
  );
}
