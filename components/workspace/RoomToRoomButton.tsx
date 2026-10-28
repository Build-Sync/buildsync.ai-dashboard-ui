/**
 * components/workspace/RoomToRoomButton.tsx
 *
 * WHAT   The Room to Room button of the top bar, and its menu: every room of the project sorted by building (the
 *        project's own house first, then each linked or merged house of a community) and, in a building with more than
 *        one storey, by storey from the ground up. A click on a room stands you inside it (the room view); while you
 *        are inside, the room you are in is ticked and the menu starts with Leave the Room. The button is lit while
 *        you are inside a room.
 * FOR    Getting into the room view, and from one building to another, without hunting for a room's name in the plan.
 *        The room view itself is the camera's `eye` (lib/scene/camera.ts); entering goes through enterRoom in
 *        lib/commands.ts, the list comes from roomGroups in lib/draw/interior.ts, and the bar at the foot of the 3D
 *        view (Viewport/RoomBar.tsx) offers the same list once you are in.
 * DEBUG  - The button is greyed out: the project has no rooms yet (name them with ROOM, Home → Building).
 *        - A building shows twice: a project linked twice has two blocks (LK1, LK2) with the same name; they are
 *          separate buildings.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { anchorOf, Menu, MenuItem, MenuLabel, MenuSep, type Anchor } from "@/components/ui/Menu";
import { tip } from "@/components/ui/Tooltip";
import { enterRoom } from "@/lib/commands";
import { roomGroups } from "@/lib/draw/interior";
import { useWs } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { levelName } from "@/lib/views";
import { useRunner, useScene } from "./hooks";

/** The Room to Room button: opens the list of buildings and rooms to stand in. */
export function RoomToRoomButton() {
  const { run, ctx } = useRunner();
  const scene = useScene();
  const project = useWs((s) => s.project);
  const inside = useWs((s) => s.insideRoom);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const groups = useMemo(() => roomGroups(scene, project.name), [scene, project.name]);
  const none = groups.length === 0;
  const many = groups.length > 1;
  return (
    <>
      <button
        aria-label="Room to Room View"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        disabled={none}
        data-testid="room-to-room"
        data-inside={inside ? "true" : "false"}
        onClick={(e) => setAnchor(anchor ? null : anchorOf(e.currentTarget))}
        className={cn(
          "ml-1 flex h-6 items-center gap-1.5 rounded-md border px-1.5 text-[0.6875rem] transition-colors disabled:opacity-35",
          inside ? "border-accent bg-accent/15 text-t1" : "border-line text-t2 hover:border-accent hover:text-t1",
        )}
        {...tip("Room to Room View", none ? "This project has no rooms yet: name them with ROOM (Home → Building)" : "Stand inside any room and go from room to room, building to building, like Street View", "WALKIN")}
      >
        <Icon name="walk" size={14} />
        <span className="hidden xl:inline">Room to Room</span>
      </button>
      <Menu anchor={anchor} onClose={close} label="Room to Room" width="16.5rem">
        <div className="max-h-[70vh] overflow-y-auto" data-testid="room-to-room-menu">
          {inside && (
            <>
              <MenuItem icon="logout" label="Leave the Room" onClick={() => run("LEAVEROOM")} onClose={close} />
              <MenuSep />
            </>
          )}
          {groups.map((g, gi) => (
            <Fragment key={g.building.id}>
              {gi > 0 && <MenuSep />}
              <MenuLabel>{many || g.levels.length > 1 ? g.building.name : "Rooms"}</MenuLabel>
              {g.levels.map((l) => (
                <Fragment key={l.level}>
                  {g.levels.length > 1 && <div className="px-2.5 pb-0.5 pt-1 text-[0.625rem] font-semibold uppercase tracking-wide text-t3">{levelName({ project }, l.level)}</div>}
                  {l.rooms.map((r) => (
                    <MenuItem key={r.id} label={r.name} hint={`${r.area} sf`} checked={r.id === inside} onClick={() => enterRoom(ctx, r.id)} onClose={close} />
                  ))}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </Menu>
    </>
  );
}
