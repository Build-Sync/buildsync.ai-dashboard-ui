"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Pill, Select, Switch } from "@/components/ui/controls";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { selectVerified } from "@/lib/store/app-store";
import type { Seat } from "@/lib/types";
import { cn, fmtMoney, initials } from "@/lib/utils";
import { Group, Row } from "../rows";

const SEATS: { id: Seat; name: string; price: string; blurb: string; perks: string[] }[] = [
  { id: "student", name: "Student", price: "Free base · $5–$15 full", blurb: "Limited project scope on the free tier", perks: ["Sample and personal projects", "All AI connectors", "Advisory output only"] },
  { id: "engineer", name: "Engineer / Professional", price: "$150–$400 / seat / month", blurb: "Replaces scheduling, compliance research, estimating and GIS tools", perks: ["Unlimited projects", "Code checks per jurisdiction", "PE sign-off workflow"] },
  { id: "government", name: "Government", price: "$15K–$500K / year", blurb: "Annual contract: city digital twin and permit pre-checks", perks: ["City-scale 3D model", "Permit pre-checks", "Emergency and fire-route planning"] },
];

/** Government pricing: Price ≈ $7.90 × Population^0.7, floor $15K, ceiling ~$500K (appendix). */
export function governmentPrice(pop: number): number {
  return Math.min(500_000, Math.max(15_000, 7.9 * Math.pow(Math.max(pop, 0), 0.7)));
}

function ChangePlan({ onClose }: { onClose: () => void }) {
  const app = useAppApi();
  const seat = useApp((s) => s.seat);
  const [pick, setPick] = useState<Seat>(seat);
  const [pop, setPop] = useState("120000");
  const price = governmentPrice(Number(pop.replace(/\D/g, "")) || 0);
  return (
    <Modal
      title="Change plan"
      subtitle="Prices are not final."
      onClose={onClose}
      z={80}
      width="44rem"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pick === seat}
            onClick={() => {
              app.getState().setSeat(pick);
              app.getState().toast(`Switched to the ${SEATS.find((x) => x.id === pick)!.name} seat`);
              onClose();
            }}
          >
            Switch plan
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Plans">
        {SEATS.map((p) => (
          <button key={p.id} role="radio" aria-checked={pick === p.id} onClick={() => setPick(p.id)} className={cn("flex flex-col rounded-xl border p-3.5 text-left transition-colors", pick === p.id ? "border-accent bg-accent/10" : "border-line hover:border-t3")}>
            <span className="flex items-center gap-2">
              <span className="text-[0.875rem] font-semibold text-t1">{p.name}</span>
              {seat === p.id && <Pill tone="info">Current</Pill>}
            </span>
            <span className="mono mt-1 text-[0.75rem] text-accent">{p.price}</span>
            <span className="mt-2 text-[0.75rem] text-t2">{p.blurb}</span>
            <ul className="mt-2.5 space-y-1">
              {p.perks.map((k) => (
                <li key={k} className="flex gap-1.5 text-[0.75rem] text-t2">
                  <Icon name="check" size={12} className="mt-0.5 shrink-0 text-ok" />
                  {k}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {pick === "government" && (
        <div className="anim-fade mt-4 rounded-lg border border-line bg-panel-alt p-3">
          <div className="label-xs">Estimate your annual contract</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[0.75rem] text-t2">
              Population
              <input className="input mono !w-32" value={pop} onChange={(e) => setPop(e.target.value)} inputMode="numeric" aria-label="Population" />
            </label>
            <span className="mono text-[0.8125rem] text-t1" data-testid="gov-price">
              ≈ {fmtMoney(Math.round(price / 100) * 100)} / year
            </span>
          </div>
          <p className="mt-1.5 text-[0.6875rem] text-t3">Price ≈ $7.90 × Population^0.7, with a $15K floor and a ~$500K ceiling. Fragmented markets are priced as N sub-units × formula(average population).</p>
        </div>
      )}
    </Modal>
  );
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountPane() {
  const app = useAppApi();
  const profile = useApp((s) => s.profile);
  const seat = useApp((s) => s.seat);
  const verified = useApp(selectVerified);
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [lic, setLic] = useState(profile.peLicense);
  const [jur, setJur] = useState(profile.peJurisdiction);
  const [exp, setExp] = useState(profile.peExpiry);
  const [plan, setPlan] = useState(false);
  const [pw, setPw] = useState({ cur: "", next: "", again: "" });
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [sessions, setSessions] = useState([
    { id: "s1", label: "Chrome on macOS · Miami, US", current: true, at: "Active now" },
    { id: "s2", label: "BuildSync mobile · iPhone", current: false, at: "2 days ago" },
    { id: "s3", label: "Firefox on Windows · Nassau, BS", current: false, at: "Last week" },
  ]);
  const [del, setDel] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (avatar) URL.revokeObjectURL(avatar); }, [avatar]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const seatInfo = SEATS.find((s) => s.id === seat)!;

  const changePw = () => {
    if (pw.next.length < 10) return setPwErr("Use at least 10 characters.");
    if (pw.next !== pw.again) return setPwErr("The new passwords don't match.");
    if (!pw.cur) return setPwErr("Enter your current password.");
    setPwErr(null);
    setPw({ cur: "", next: "", again: "" });
    app.getState().toast("Password changed (mock)");
  };

  return (
    <div data-testid="pane-account">
      <Group title="Profile">
        <div className="flex items-start gap-5 border-b border-soft py-4">
          <div className="text-center">
            <div className="grid size-16 place-items-center overflow-hidden rounded-full bg-accent text-[1.25rem] font-bold text-on-accent">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar ? <img src={avatar} alt="Your avatar" className="size-full object-cover" /> : initials(name)}
            </div>
            <button className="mt-1.5 text-[0.6875rem] text-accent hover:underline" onClick={() => fileRef.current?.click()}>
              Change
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Upload avatar" onChange={(e) => { const f = e.target.files?.[0]; if (f) setAvatar(URL.createObjectURL(f)); }} />
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label-xs">Name</span>
              <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="label-xs">Email</span>
              <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!emailOk} />
              {!emailOk && <span className="mt-1 block text-[0.6875rem] text-bad">Enter a valid email.</span>}
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-primary" disabled={!emailOk || !name.trim()} onClick={() => { app.getState().setProfile({ name: name.trim(), email: email.trim() }); app.getState().toast("Profile saved"); }}>
                Save profile
              </button>
            </div>
          </div>
        </div>
      </Group>

      <Group title="Seat">
        <div className="flex items-center gap-4 rounded-lg border border-line bg-panel-alt px-4 py-3" data-testid="seat-card">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-[0.875rem] font-semibold text-t1">
              {seatInfo.name} seat <span className="text-t3">·</span> <span className="font-normal text-t2">Monthly</span> <Pill tone="ok">Active</Pill>
            </div>
            <div className="mono mt-0.5 text-[0.75rem] text-t3">{seatInfo.price}</div>
          </div>
          <button className="btn" onClick={() => setPlan(true)} data-testid="change-plan">
            Change plan
          </button>
        </div>
      </Group>

      <Group title="PE credentials" aside={verified ? <Pill tone="ok">Verified</Pill> : <Pill tone="warn">Not verified</Pill>}>
        <p className="mb-3 text-[0.75rem] text-t2">Optional, but needed to sign. A license number unlocks the PE sign-off workflow and lets you hide the advisory banner.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label-xs">License number</span>
            <input className="input mono mt-1" value={lic} onChange={(e) => setLic(e.target.value)} placeholder="PE-12345" />
          </label>
          <div>
            <span className="label-xs">Jurisdiction</span>
            <div className="mt-1">
              <Select<string> label="License jurisdiction" className="w-full" value={jur} onChange={setJur} options={["Florida", "Antigua & Barbuda", "Bahamas", "Jamaica", "Puerto Rico"].map((j) => ({ value: j, label: j }))} />
            </div>
          </div>
          <label className="block">
            <span className="label-xs">Expiry</span>
            <input type="date" className="input mono mt-1" value={exp} onChange={(e) => setExp(e.target.value)} />
          </label>
        </div>
        <button className="btn mt-3" onClick={() => { app.getState().setProfile({ peLicense: lic.trim(), peJurisdiction: jur, peExpiry: exp }); app.getState().toast(lic.trim().length >= 4 ? "PE credentials saved" : "PE credentials cleared", "info"); }}>
          Save credentials
        </button>
      </Group>

      <Group title="Billing">
        <Row label="Payment method" help="Mock card. No payments are processed in this build.">
          <div className="flex items-center gap-3">
            <span className="mono flex items-center gap-2 text-[0.8125rem] text-t1">
              <Icon name="card" size={16} className="text-t3" /> Visa •••• 4242 <span className="text-t3">08/28</span>
            </span>
            <button className="btn" onClick={() => app.getState().toast("Payment updates are stubbed", "info")}>
              Update
            </button>
          </div>
        </Row>
        <div className="mt-3 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-[0.75rem]">
            <thead className="bg-panel-alt">
              <tr className="label-xs text-left">
                <th className="px-4 py-2 font-semibold">Invoice</th>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[["INV-2026-010", "Oct 1, 2026"], ["INV-2026-009", "Sep 1, 2026"], ["INV-2026-008", "Aug 1, 2026"]].map(([n, d]) => (
                <tr key={n} className="border-t border-soft">
                  <td className="mono px-4 py-2 text-t1">{n}</td>
                  <td className="px-4 py-2 text-t2">{d}</td>
                  <td className="mono px-4 py-2 text-right text-t1">{fmtMoney(seat === "student" ? 9 : seat === "government" ? 1250 : 249)}</td>
                  <td className="px-4 py-2">
                    <Pill tone="ok">Paid</Pill>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button className="text-accent hover:underline" onClick={() => app.getState().toast(`${n} downloaded (mock)`, "info")}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group title="Security">
        <Row label="Password" help="Use at least 10 characters." stack>
          <div className="grid w-full gap-2 sm:grid-cols-3">
            <input type="password" autoComplete="current-password" className="input" placeholder="Current password" aria-label="Current password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} />
            <input type="password" autoComplete="new-password" className="input" placeholder="New password" aria-label="New password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            <input type="password" autoComplete="new-password" className="input" placeholder="Repeat new password" aria-label="Repeat new password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
          </div>
          {pwErr && (
            <p role="alert" className="mt-1.5 w-full text-[0.75rem] text-bad">
              {pwErr}
            </p>
          )}
          <button className="btn mt-2" onClick={changePw}>
            Change password
          </button>
        </Row>
        <Row label="Two-factor authentication" help="Require a code from an authenticator app at sign-in.">
          <Switch label="Two-factor authentication" checked={profile.twoFactor} onChange={(v) => { app.getState().setProfile({ twoFactor: v }); app.getState().toast(v ? "Two-factor enabled" : "Two-factor disabled", "info"); }} />
        </Row>
        <div className="py-3.5">
          <div className="text-[0.8125rem] font-medium text-t1">Active sessions</div>
          <ul className="mt-2 divide-y divide-soft overflow-hidden rounded-lg border border-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 bg-panel-alt px-4 py-2.5 text-[0.75rem]">
                <Icon name={s.label.includes("mobile") ? "phone" : "monitor"} size={15} className="text-t3" />
                <span className="flex-1 text-t1">{s.label}</span>
                <span className="text-t3">{s.at}</span>
                {s.current ? <Pill tone="info">This device</Pill> : <button className="text-bad hover:underline" onClick={() => { setSessions((l) => l.filter((x) => x.id !== s.id)); app.getState().toast("Session revoked", "info"); }}>Revoke</button>}
              </li>
            ))}
          </ul>
        </div>
      </Group>

      <Group title="Danger zone">
        <div className="rounded-xl border border-bad/40 p-4">
          <Row label="Export my data" help="Download your profile, settings and project list as JSON.">
            <button className="btn" onClick={() => { download("buildsync-my-data.json", { profile: { name: profile.name, email: profile.email }, seat, settings: app.getState().settings, tabs: app.getState().tabs }); app.getState().toast("Data exported"); }}>
              <Icon name="download" size={13} /> Export
            </button>
          </Row>
          <div className="flex items-center justify-between gap-4 pt-3.5">
            <div>
              <div className="text-[0.8125rem] font-medium text-bad">Delete account</div>
              <p className="mt-0.5 text-[0.75rem] text-t3">Permanently removes your account and projects. This can&apos;t be undone.</p>
            </div>
            <button className="btn btn-danger" onClick={() => setDel(true)}>
              Delete account
            </button>
          </div>
        </div>
      </Group>

      {plan && <ChangePlan onClose={() => setPlan(false)} />}
      {del && (
        <Modal
          title="Delete your account?"
          subtitle="This permanently deletes your account and all projects."
          onClose={() => { setDel(false); setConfirmText(""); }}
          z={80}
          width="26rem"
          footer={
            <>
              <button className="btn" onClick={() => { setDel(false); setConfirmText(""); }}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={confirmText !== "DELETE"} onClick={() => { setDel(false); setConfirmText(""); app.getState().toast("Account deletion is stubbed in this build", "info"); }}>
                Delete forever
              </button>
            </>
          }
        >
          <label className="block text-[0.75rem] text-t2">
            Type <span className="mono font-semibold text-t1">DELETE</span> to confirm
            <input data-autofocus className="input mono mt-1.5" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
        </Modal>
      )}
    </div>
  );
}
