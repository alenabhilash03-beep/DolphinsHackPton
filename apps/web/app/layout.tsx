import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hypothesim — scientific workspace",
  description: "Evidence-aware scientific hypothesis exploration. Foundation preview.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
