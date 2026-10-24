import type { ReactNode } from "react";

export default function ProjectLayout({ children, modal }: { children: ReactNode; modal: ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
