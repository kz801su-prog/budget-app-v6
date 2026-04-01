import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Budget Performance Manager V6",
  description: "Advanced Budget and Financial Analysis Tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
