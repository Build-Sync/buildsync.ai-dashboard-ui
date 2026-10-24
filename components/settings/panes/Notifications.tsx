"use client";

import { Checkbox } from "@/components/ui/controls";
import { NOTIF_EVENTS } from "@/lib/settings";
import { useDraft } from "../rows";

/* Event × In-app / Email. The weekly digest is email-only (in-app is "—"). */
export function NotificationsPane() {
  const { s, set } = useDraft();
  return (
    <div data-testid="pane-notifications">
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-[0.8125rem]">
          <thead className="bg-panel-alt">
            <tr className="label-xs text-left">
              <th className="px-4 py-2.5 font-semibold">Event</th>
              <th className="w-24 px-4 py-2.5 text-center font-semibold">In-app</th>
              <th className="w-24 px-4 py-2.5 text-center font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {NOTIF_EVENTS.map((e) => {
              const v = s.notifications[e.id];
              return (
                <tr key={e.id} className="border-t border-soft">
                  <td className="px-4 py-3 text-t1">{e.label}</td>
                  <td className="px-4 py-3 text-center">
                    {e.id === "weekly-digest" ? (
                      <span className="text-t3" aria-label="Not available">
                        —
                      </span>
                    ) : (
                      <span className="inline-flex">
                        <Checkbox label={`${e.label}: in-app`} checked={v.inApp} onChange={(c) => set((d) => (d.notifications[e.id].inApp = c))} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex">
                      <Checkbox label={`${e.label}: email`} checked={v.email} onChange={(c) => set((d) => (d.notifications[e.id].email = c))} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[0.75rem] text-t3">Email goes to the address on your account. In-app notifications appear as toasts and in the command-line log.</p>
    </div>
  );
}
