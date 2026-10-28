/**
 * components/workspace/Modals/ButtonGuideModal.tsx
 *
 * WHAT   The Button Guide as a dialog over the workspace (Home → Help → Button Guide, the ? menu, BUTTONGUIDE):
 *        components/shared/ButtonGuide.tsx inside a modal. "Show me where" closes the dialog and lights the button.
 * FOR    Learning what a button does and finding it without leaving the drawing. The same guide is a page in
 *        Settings → Button Guide.
 * DEBUG  - The spotlight does not appear: it is drawn by TourLayer (components/workspace/Tour.tsx) from the app
 *          store's `spotlight`.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { ButtonGuide } from "@/components/shared/ButtonGuide";
import { Modal } from "@/components/ui/Modal";
import { useAppApi } from "@/lib/store/app-provider";
import { useWsApi } from "@/lib/store/workspace-provider";

/** The Button Guide dialog. */
export function ButtonGuideModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const close = () => ws.getState().closeModal();
  return (
    <Modal title="Button Guide" subtitle="Every button by tab: how it looks, what it does and where it is. The eye shows it on screen." onClose={close} width="52rem">
      <ButtonGuide
        compact
        onShow={(sp) => {
          close();
          app.getState().setSpotlight(sp);
        }}
      />
    </Modal>
  );
}
