import { emitFrontendPageView } from '@/lib/analytics/frontendEmitter'
import { ReactNode } from "react";

export const dynamic = 'force-dynamic'

export const metadata = {
  title: "WorkCaptain Runtime",
  description: "Governed execution runtime shell"
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await emitFrontendPageView({ route: '/', sessionId: null, actorId: null }).catch((err) => {
    console.error('[analytics] emitFrontendPageView failed:', JSON.stringify(err, Object.getOwnPropertyNames(err)))
  })
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif" }}>{children}</body>
    </html>
  );
}
