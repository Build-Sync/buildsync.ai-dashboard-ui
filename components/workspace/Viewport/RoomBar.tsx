/**
 * components/workspace/Viewport/RoomBar.tsx
 *
 * WHAT   The bar at the foot of the 3D view while you stand inside a room (the room view): the building you are in
 *        (a picker, when the project has more than one: a community of houses), the previous and next rooms of that
 *        building, a list of its rooms (by storey when it has more than one) to jump to, how to look and walk, and
 *        Leave.
 * FOR    Getting round the house the way Street View gets round a street. The room view itself is the camera's
 *        `eye` (lib/scene/camera.ts); entering and moving use enterRoom / NEXTROOM / PREVROOM / LEAVEROOM in
 *        lib/commands.ts.
 * DEBUG  - The bar does not show: it needs the 3D view and `insideRoom` set (enterRoom sets both).
 *        - The list is short: it lists the rooms of the building you are in (roomGroups in lib/draw/interior.ts); the
 *          other buildings are in the building picker, and in the top bar's Room to Room menu.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo } from "react";
import { Icon } from "@/components/icons";
import { tip } from "@/components/ui/Tooltip";
import { enterRoom } from "@/lib/commands";
import { roomGroups } from "@/lib/draw/interior";
import { useWs } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";
import { levelName } from "@/lib/views";
import { useRunner, useScene } from "../hooks";

/** The room view's bar: previous / next room, a room list, the controls and Leave. */
export function RoomBar({ raised }: { raised?: boolean }) {
  const { run, ctx } = useRunner();
  const scene = useScene();
  const here = useWs((s) => s.insideRoom);
  const project = useWs((s) => s.project);
  const groups = useMemo(() => roomGroups(scene, project.name), [scene, project.name]);
  const room = scene.rooms.find((r) => r.id === here);
  const group = groups.find((g) => g.levels.some((l) => l.rooms.some((r) => r.id === here)));
  if (!room || !group) return null;
  const btn = "grid size-7 place-items-center rounded-md text-t2 hover:bg-t1/10 hover:text-t1";
  return (
    <div className={cn("absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-chrome/92 px-1.5 py-1 shadow-pop backdrop-blur", raised ? "bottom-10" : "bottom-3")} data-testid="room-bar">
      <button className={btn} onClick={() => run("PREVROOM")} aria-label="Previous Room" {...tip("Previous Room", "Go to the previous room of this building", "PREVROOM")}>
        <Icon name="chevLeft" size={15} />
      </button>
      {groups.length > 1 && (
        <select className="input !h-7 !w-40 text-t2" value={group.building.id} onChange={(e) => enterRoom(ctx, groups.find((g) => g.building.id === e.target.value)!.levels[0].rooms[0].id)} aria-label="Building" data-testid="building-select">
          {groups.map((g) => (
            <option key={g.building.id} value={g.building.id}>
              {g.building.name}
            </option>
          ))}
        </select>
      )}
      <select className="input !h-7 !w-44 font-semibold" value={room.id} onChange={(e) => enterRoom(ctx, e.target.value)} aria-label="Room" data-testid="room-select">
        {group.levels.map((l) => {
          const options = l.rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ));
          return group.levels.length > 1 ? (
            <optgroup key={l.level} label={levelName({ project }, l.level)}>
              {options}
            </optgroup>
          ) : (
            options
          );
        })}
      </select>
      <button className={btn} onClick={() => run("NEXTROOM")} aria-label="Next Room" {...tip("Next Room", "Go to the next room of this building", "NEXTROOM")}>
        <Icon name="chevRight" size={15} />
      </button>
      <span className="mx-1.5 hidden w-[20.5rem] text-[0.6875rem] leading-tight text-t3 lg:block">
        Drag to look around · scroll to zoom · ↑ ↓ walk · ← → turn
        <br />
        Click a room&apos;s marker to go in; double-click the floor to walk there
      </span>
      <button className="flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[0.75rem] text-t1 hover:border-accent hover:text-accent" onClick={() => run("LEAVEROOM")} data-testid="room-leave" {...tip("Leave the Room", "Back to the 3D view you were in (or press Esc)", "LEAVEROOM")}>
        <Icon name="logout" size={13} /> Leave
      </button>
    </div>
  );
}
