import type { Metadata } from "next";
import "./globals.css";
import "./glass-background.css";
import "./workspace-editorial.css";
import { GlassEnvironment } from "../components/GlassEnvironment";

export const metadata: Metadata = {
  title: "Hypothesim — scientific workspace",
  description: "Evidence-aware scientific hypothesis exploration. Foundation preview.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><GlassEnvironment>{children}</GlassEnvironment></body></html>;
}
