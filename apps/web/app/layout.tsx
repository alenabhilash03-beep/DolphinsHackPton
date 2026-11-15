import type { Metadata } from "next";
import "./globals.css";
import "./glass-background.css";
import "./workspace-editorial.css";
import "./workspace-console.css";
import "./investigation.css";
import "./answer.css";
import "./community.css";
import "./workflow.css";
import { AuthProvider } from "../lib/auth";


export const metadata: Metadata = {
  title: "Hypothesim — scientific workspace",
  description: "Evidence-aware scientific hypothesis exploration and interactive simulation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AuthProvider>{children}</AuthProvider></body></html>;
}
