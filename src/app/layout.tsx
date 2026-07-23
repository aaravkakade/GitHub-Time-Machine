import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CodeChronicle — watch any codebase evolve",
    template: "%s",
  },
  description:
    "Paste a GitHub repository and travel through its architecture, decisions, dependencies, and technical debt.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  openGraph: {
    title: "CodeChronicle",
    description: "An interactive time machine for GitHub repositories.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b10",
};

const themeInit = `
try {
  if (localStorage.getItem('cc-theme') === 'light') {
    document.documentElement.classList.add('cc-light');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
