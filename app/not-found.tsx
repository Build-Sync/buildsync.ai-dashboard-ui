import Link from "next/link";

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
