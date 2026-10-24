import type { ReactNode } from "react";

/* /demo and /app/projects/[projectId] both render the workspace in `children` and the
 * intercepted settings modal in the parallel `modal` slot (spec §8.1, routing rule 1). */
export default function DemoLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
