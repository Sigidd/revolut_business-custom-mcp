import type { Metadata } from "next";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "https://revolut-mcp.vercel.app";

export const metadata: Metadata = {
  title: "Revolut Business MCP",
  description: "MCP server connecting Claude to Revolut Business API",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    images: [`${BASE_URL}/icon.png`],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
