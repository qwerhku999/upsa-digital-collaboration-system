import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UPSA Project Hub",
  description: "Digital Collaboration and Supervisor Tracking System for UPSA",
};

const themeInitialization = `(()=>{try{const t=localStorage.getItem("upsa-project-hub-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;else if(window.matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark"}catch{}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitialization }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}