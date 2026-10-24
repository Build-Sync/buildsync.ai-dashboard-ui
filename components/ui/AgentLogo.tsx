/**
 * components/ui/AgentLogo.tsx
 *
 * WHAT   A rounded colour tile with an AI agent's letter in the agent's brand colour (from AGENT_META).
 * FOR    Agent selector, integration cards, proposal cards, Council role cards and the Connect dialog. It is a
 *        neutral tile, not a vendor trademark.
 * DEBUG  - Wrong colour or letter: the colour and glyph come from AGENT_META in lib/agents.ts.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import { AGENT_META } from "@/lib/agents";
import type { AgentId } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Colour tile with the agent's glyph (spec §12 agent colours). Not a vendor trademark. */
export function AgentLogo({ id, size = 28, className, name }: { id: AgentId; size?: number; className?: string; name?: string }) {
  const m = AGENT_META[id];
  return (
    <span
      role="img"
      aria-label={name ?? m.name}
      className={cn("inline-grid shrink-0 place-items-center rounded-lg font-semibold text-white", className)}
      style={{ width: size, height: size, background: m.color, fontSize: size * 0.42 }}
    >
      {m.glyph}
    </span>
  );
}
