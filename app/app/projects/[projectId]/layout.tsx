/**
 * app/app/projects/[projectId]/layout.tsx
 *
 * WHAT   Layout for /app/projects/[projectId]: renders the workspace page (children) and the parallel `modal`
 *        slot with the intercepted settings modal.
 * FOR    Same arrangement as app/demo/layout.tsx so settings opens over the project the same way in both
 *        places.
 * DEBUG  - Settings opens as a full page instead of a modal: the `modal` prop must be rendered here and
 *          @modal/default.tsx must exist.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { ReactNode } from "react";

/** Renders the project workspace and, on top of it, the intercepted settings modal when one is open. */
export default function ProjectLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
