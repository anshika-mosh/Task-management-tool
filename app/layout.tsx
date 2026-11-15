import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TaskFlow — team boards & tickets", description: "Jira-style task management for teams" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
