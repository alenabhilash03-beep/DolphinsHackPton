import type { Metadata } from "next";
import "./globals.css";
import "./glass-background.css";
import "./workspace-editorial.css";
import "./workspace-console.css";


export const metadata: Metadata = {
  title: "Hypothesim — scientific workspace",
  description: "Evidence-aware scientific hypothesis exploration and interactive simulation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
