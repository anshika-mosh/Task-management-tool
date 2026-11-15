import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TaskFlow — team boards & tickets", description: "Jira-style task management for teams" };

// Runs before first paint so there is no light/dark flash. Saved choice wins, else the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem("tf-theme");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
