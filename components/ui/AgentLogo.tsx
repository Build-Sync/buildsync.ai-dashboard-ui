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
