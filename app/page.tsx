/**
 * app/page.tsx
 *
 * WHAT   The landing page at /: a placeholder with the product name, a one-paragraph pitch and two links (the
 *        demo and the workspace).
 * FOR    A stand-in until the separately specified marketing site replaces this route. Nothing here is part of
 *        the workspace.
 * DEBUG  - The links are plain <Link>s to /demo and /app; if one 404s, check the matching route folder under
 *          app/.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import Link from "next/link";

/* Placeholder entry. The marketing site and homepage are specced separately
 * (buildsync-website.md) and will replace this route. */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-accent text-base font-semibold text-on-accent">B</span>
        <span className="text-xl font-semibold">BuildSync AI</span>
      </div>
      <p className="text-[0.9375rem] leading-relaxed text-t2">
        An AI workspace for engineering plans. Upload or draw a plan, check it against your local building code, then turn it into a schedule, budget, material list and
        crew plan, and stress-test it against real disasters.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/demo" className="btn btn-primary h-9 px-4 text-[0.8125rem]">
          Try the Demo, No Signup Needed
        </Link>
        <Link href="/app" className="btn h-9 px-4 text-[0.8125rem]">
          Open Workspace
        </Link>
      </div>
      <p className="text-[0.75rem] text-t3">This page is a placeholder. The marketing site is specced separately.</p>
    </main>
  );
}
