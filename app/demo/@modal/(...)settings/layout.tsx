/**
 * app/demo/@modal/(...)settings/layout.tsx
 *
 * WHAT   Layout of the intercepted settings route over /demo. Re-exports SettingsModalLayout, which wraps every
 *        settings screen in the modal frame.
 * FOR    The (...) prefix means "intercept from the app root", so /settings/* opened from the demo appears in
 *        this slot. The frame lives in a layout so it stays mounted while you move between settings pages.
 * DEBUG  - Closing returns to the wrong place: the Close handler is router.back() in
 *          components/settings/SettingsFrame.tsx.
 *        - The spec's (.) prefix would intercept /demo/settings instead, which is why (...) is used; see README
 *          "Differences from the spec".
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
export { SettingsModalLayout as default } from "@/components/settings/route-parts";
