import { ReactNode } from "react";

export const metadata = {
  title: "WorkCaptain Runtime",
  description: "Governed execution runtime shell"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>{children}</body>
    </html>
  );
}
