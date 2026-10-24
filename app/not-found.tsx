/**
 * app/not-found.tsx
 *
 * WHAT   The 404 page shown for unknown URLs, unknown project ids (/app/projects/<unknown>) and unknown
 *        settings pages. Offers links back to /app and /demo.
 * FOR    Next.js not-found convention: pages call notFound() to render this.
 * DEBUG  - The browser console shows one "404" resource message when this page is the document itself; that is
 *          expected.
 *        - In `next dev` only, React also logs a script-tag warning here because the root layout re-renders on
 *          the client; production is clean.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import Link from "next/link";

/** The 404 page: says the link may be out of date and links to /app and /demo. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <p className="mono text-[0.75rem] text-t3">404</p>
      <h1 className="text-xl font-semibold">We can&apos;t find that project or page</h1>
      <p className="text-[0.8125rem] text-t2">The link may be out of date, or the project hasn&apos;t been created yet.</p>
      <div className="flex gap-2">
        <Link href="/app" className="btn btn-primary">
          Open the workspace
        </Link>
        <Link href="/demo" className="btn">
          Try the demo
        </Link>
      </div>
    </main>
  );
}
