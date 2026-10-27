import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/app-shell/AppProvider";
import { MotionRoot } from "@/components/ui/MotionRoot";
import { AppShell } from "@/components/app-shell/AppShell";

// Fraunces carries headlines, the wordmark and big numbers; its optical-size axis keeps small display text crisp.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz", "SOFT", "WONK"] });
// Lora is the reading face for everything else: dense candidate text at 14px on a dark panel.
const lora = Lora({ variable: "--font-lora", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Heavy Brains — Find the talent your usual search misses",
  description: "Discover the companies behind relevant experience. Find the people worth looking at. Understand why they fit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${lora.variable} ${geistMono.variable} h-full antialiased`}>
      <body>
        <AppProvider>
          <MotionRoot><AppShell>{children}</AppShell></MotionRoot>
        </AppProvider>
      </body>
    </html>
  );
}
