import React from "react";

export const metadata = {
  title: "Skyra Tech App Router Fixture",
  description: "Next.js App Router Integration Test Fixture"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
