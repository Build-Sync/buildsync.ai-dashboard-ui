"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/controls";
import { useAppApi } from "@/lib/store/app-provider";
import type { Role } from "@/lib/types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  engineer: "Engineer",
  "pe-reviewer": "PE Reviewer",
  contributor: "Contributor",
  viewer: "Viewer",
};
export const ROLE_OPTIONS = (["engineer", "pe-reviewer", "contributor", "viewer"] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Invite a member. PE Reviewer requires a license number + jurisdiction (spec §11.10). */
export function InviteDialog({ onClose, z = 70 }: { onClose: () => void; z?: number }) {
  const app = useAppApi();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("engineer");
  const [license, setLicense] = useState("");
  const [jur, setJur] = useState("Florida");
  const [tried, setTried] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const needsPe = role === "pe-reviewer";
  const peOk = !needsPe || license.trim().length >= 4;
  const valid = emailOk && peOk && name.trim().length > 0;

  const submit = () => {
    setTried(true);
    if (!valid) return;
    app.getState().addMember({ name: name.trim(), email: email.trim(), role, ...(needsPe ? { license: license.trim(), jurisdiction: jur } : {}) });
    app.getState().toast(`Invitation sent to ${email.trim()}`);
    app.getState().log("ok", `✓ Invited ${email.trim()} as ${ROLE_LABEL[role]}`);
    onClose();
  };

  return (
    <Modal
      title="Invite a member"
      subtitle="They'll get an email with a link to this workspace."
      onClose={onClose}
      z={z}
      width="28rem"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit}>
            Send invite
          </button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="block">
          <span className="label-xs">Name</span>
          <input data-autofocus className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          {tried && !name.trim() && <span className="mt-1 block text-[0.6875rem] text-bad">Enter a name.</span>}
        </label>
        <label className="block">
          <span className="label-xs">Email</span>
          <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          {tried && !emailOk && <span className="mt-1 block text-[0.6875rem] text-bad">Enter a valid email address.</span>}
        </label>
        <div>
          <span className="label-xs">Role</span>
          <div className="mt-1">
            <Select<Role> label="Role" className="w-full" value={role} onChange={setRole} options={ROLE_OPTIONS} />
          </div>
        </div>
        {needsPe && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-warn/40 bg-warn/5 p-3">
            <p className="col-span-2 text-[0.6875rem] text-t2">PE Reviewers must supply a license number and jurisdiction so sign-offs can be verified.</p>
            <label className="block">
              <span className="label-xs">License number</span>
              <input className="input mono mt-1" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="PE-12345" />
              {tried && !peOk && <span className="mt-1 block text-[0.6875rem] text-bad">License number required.</span>}
            </label>
            <div>
              <span className="label-xs">Jurisdiction</span>
              <div className="mt-1">
                <Select<string> label="License jurisdiction" className="w-full" value={jur} onChange={setJur} options={["Florida", "Antigua & Barbuda", "Bahamas", "Jamaica", "Puerto Rico"].map((j) => ({ value: j, label: j }))} />
              </div>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
