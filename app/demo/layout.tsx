/**
 * app/demo/layout.tsx
 *
 * WHAT   Layout for /demo: renders the workspace page (children) and the parallel `modal` slot, which holds the
 *        intercepted settings modal.
 * FOR    Parallel routes (spec section 8.1, rule 1): opening /settings/* from the demo workspace is intercepted
 *        by app/demo/@modal/(...)settings and shown over the workspace instead of replacing it.
 * DEBUG  - Settings opens as a full page instead of a modal: the `modal` prop must be rendered here, and
 *          @modal/default.tsx must exist.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
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
