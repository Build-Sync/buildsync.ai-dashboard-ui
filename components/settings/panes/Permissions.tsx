/**
 * components/settings/panes/Permissions.tsx
 *
 * WHAT   Settings → Permissions: a read-only roles × capabilities matrix, and the members list with invite
 *        (InviteDialog), role change and two-step remove.
 * FOR    Role-based access in the mock team data (`members` in the app store). The Owner row has no controls,
 *        by design.
 * DEBUG  - The matrix is static: edit MATRIX and CAPS at the top of the file.
 *        - An invited PE Reviewer needs a licence number and jurisdiction (validated in
 *          components/shared/InviteDialog.tsx).
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { InviteDialog, ROLE_LABEL, ROLE_OPTIONS } from "@/components/shared/InviteDialog";
import { Pill, Select } from "@/components/ui/controls";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import type { Role } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { Group } from "../rows";

const CAPS = ["Edit model", "Run analyses", "Approve / sign", "Manage connectors", "Share", "Billing"] as const;
const MATRIX: Record<Role, boolean[]> = {
  owner: [true, true, true, true, true, true],
  engineer: [true, true, false, true, true, false],
  "pe-reviewer": [false, true, true, false, false, false],
  contributor: [true, true, false, false, false, false],
  viewer: [false, false, false, false, false, false],
};
const ROLES: Role[] = ["owner", "engineer", "pe-reviewer", "contributor", "viewer"];

/** The Settings → Permissions pane. */
export function PermissionsPane() {
  const app = useAppApi();
  const members = useApp((s) => s.members);
  const [invite, setInvite] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  return (
    <div data-testid="pane-permissions">
      <Group title="Roles">
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[0.75rem]" data-testid="roles-table">
            <thead className="bg-panel-alt">
              <tr className="label-xs text-left">
                <th className="px-4 py-2.5 font-semibold">Role</th>
                {CAPS.map((c) => (
                  <th key={c} className="px-3 py-2.5 text-center font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r} className="border-t border-soft">
                  <td className="px-4 py-2.5 font-medium text-t1">{ROLE_LABEL[r]}</td>
                  {MATRIX[r].map((on, i) => (
                    <td key={i} className="px-3 py-2.5 text-center">
                      {on ? <Icon name="check" size={14} className="mx-auto text-ok" /> : <span className="text-t3">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group title={`Members (${members.length})`} aside={<button className="btn btn-primary !h-7" onClick={() => setInvite(true)} data-testid="invite-btn"><Icon name="userPlus" size={13} /> Invite</button>}>
        <ul className="divide-y divide-soft overflow-hidden rounded-lg border border-line" data-testid="members-list">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 bg-panel-alt px-4 py-2.5">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold text-white", m.role === "pe-reviewer" ? "bg-warn" : "bg-accent")}>{initials(m.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-medium text-t1">{m.name}</div>
                <div className="truncate text-[0.6875rem] text-t3">
                  {m.email}
                  {m.role === "pe-reviewer" && m.license && (
                    <span className="mono ml-2 text-warn">
                      {m.license} · {m.jurisdiction}
                    </span>
                  )}
                </div>
              </div>
              {m.role === "owner" ? (
                <Pill tone="info">Owner</Pill>
              ) : (
                <>
                  <Select<Role> label={`Role for ${m.name}`} className="!min-w-[8.5rem]" value={m.role} onChange={(v) => app.getState().setMemberRole(m.id, v)} options={ROLE_OPTIONS} />
                  {removing === m.id ? (
                    <span className="flex items-center gap-1.5">
                      <button className="btn btn-danger !h-7" onClick={() => { app.getState().removeMember(m.id); app.getState().toast(`${m.name} removed`, "info"); setRemoving(null); }}>
                        Remove
                      </button>
                      <button className="btn !h-7" onClick={() => setRemoving(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button aria-label={`Remove ${m.name}`} className="grid size-7 place-items-center rounded text-t3 hover:bg-bad/10 hover:text-bad" onClick={() => setRemoving(m.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.75rem] text-t3">PE Reviewers need a license number and jurisdiction on invite so sign-offs can be verified.</p>
      </Group>
      {invite && <InviteDialog onClose={() => setInvite(false)} z={80} />}
    </div>
  );
}
