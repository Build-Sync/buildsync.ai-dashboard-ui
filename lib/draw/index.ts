/**
 * lib/draw/index.ts
 *
 * WHAT   The public face of the drawing engine: importing this file loads every tool (tools.ts, tools-site.ts,
 *        tools-mep.ts, modify.ts) into the registry and re-exports what the rest of the app uses (beginTool,
 *        toolClick, toolEnter, toolText, toolPreview, composeScene, sceneOf, snapPoint …).
 * FOR    lib/commands.ts and the viewport import from "@/lib/draw" so the registry is always filled before a
 *        tool starts.
 * DEBUG  - beginTool returns false for a command: its tool file was not imported here, or the name differs from
 *          the registry key (the ribbon passes the command name, e.g. "FIXT LIB").
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import "./tools";
import "./tools-site";
import "./tools-mep";
import "./modify";

export * from "./session";
export { composeScene, isDraftKind, draftOutline, META, BOXES, storeyHeight } from "./compose";
export { sceneOf } from "./scene-of";
export { snapPoint, parseLen, parseTyped } from "./snap";
export { applyChange, deleteChange, type Change } from "./change";
export { planTransform, mergeChange, transformItem, planMove, planGrip, ghostShapes, commitMove, commitGrip } from "./modify";
export type { DrawnItem, ItemKind, MeasureResult, Preview, SavedWork, ToolSession, XForm } from "./types";
