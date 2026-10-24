/**
 * components/workspace/Modals/ReviewModals.tsx
 *
 * WHAT   Review and collaboration dialogs: PE sign-off (review queue → sign → audit trail), Approvals, Door /
 *        window schedule, Quantity take-off, Prompt to Plan and Share.
 * FOR    Opened through the workspace modal state (Modals/index.tsx). PE sign-off keeps AI output advisory
 *        until a licensed PE signs (spec section 6). The schedule and take-off tables can be saved as CSV
 *        (lib/save-file.ts); Prompt to Plan creates a new project from a text description (mock generator in
 *        lib/services/analysis.ts).
 * DEBUG  - Sign digitally is disabled: the agreement box must be ticked and the licence number needs at least 4
 *          characters.
 *        - The audit trail is empty: entries are added by peAdvance in the workspace store.
 *        - Prompt to Plan does nothing in the demo: it opens the Start-free dialog instead of creating a
 *          project.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { InviteDialog, ROLE_LABEL, ROLE_OPTIONS } from "@/components/shared/InviteDialog";
import { Modal } from "@/components/ui/Modal";
import { Pill, Select, Spinner } from "@/components/ui/controls";
import { saveCsv } from "@/lib/save-file";
import { elementDetails } from "@/lib/scene";
import { generatePlan, type GeneratedPlan } from "@/lib/services/analysis";
import { planProjectId } from "@/lib/services/projects";
import { useApp, useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, fmtMoney } from "@/lib/utils";
import { useScene } from "../hooks";

/* ── PE sign-off ──────────────────────────────────────────────────────── */
/* Workflow (spec §6): review queue → PE edits and notes → digital signature (license number,
 * jurisdiction, date) → full audit trail (AI draft → PE edits → signed final). */
export function PeSignoffModal() {
  const ws = useWsApi();
  const checks = useWs((s) => s.project.checks);
  const status = useWs((s) => s.peStatus);
  const log = useWs((s) => s.peLog);
  const members = useApp((s) => s.members);
  const pe = members.find((m) => m.role === "pe-reviewer");
  const flagged = useMemo(() => checks.filter((c) => c.peReview && c.status !== "pass"), [checks]);
  const [tab, setTab] = useState<"queue" | "sign" | "audit">("queue");
  const [picked, setPicked] = useState<string[]>(() => flagged.filter((c) => !status[c.id]).map((c) => c.id));
  const [note, setNote] = useState("");
  const [license, setLicense] = useState(pe?.license ?? "");
  const [jur, setJur] = useState(pe?.jurisdiction ?? "Florida");
  const [agree, setAgree] = useState(false);
  const close = () => ws.getState().closeModal();
  const queued = flagged.filter((c) => status[c.id] === "queued" || status[c.id] === "reviewed");

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const stateOf = (id: string) => status[id];

  return (
    <Modal title="PE sign-off" subtitle="Life-safety and load-bearing items need a licensed Professional Engineer. All AI output stays advisory until signed." onClose={close} width="40rem">
      <div role="tablist" className="mb-3 flex gap-4 border-b border-soft">
        {([["queue", "Review queue"], ["sign", "Sign"], ["audit", "Audit trail"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("-mb-px border-b-2 pb-1.5 text-[0.75rem] font-medium", tab === id ? "border-accent text-t1" : "border-transparent text-t2 hover:text-t1")}>
            {label}
            {id === "queue" && flagged.length > 0 && <span className="mono ml-1.5 rounded-full bg-warn/20 px-1.5 text-[0.625rem] text-warn">{flagged.length}</span>}
          </button>
        ))}
      </div>

      {tab === "queue" && (
        <div data-testid="pe-queue">
          {flagged.length === 0 ? (
            <p className="py-8 text-center text-[0.8125rem] text-t2">Nothing is flagged “Requires PE Review”. Items appear here when a check touches life-safety or a load-bearing element.</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {flagged.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2">
                    <input type="checkbox" aria-label={`Select ${c.id}`} className="mt-1 accent-[var(--accent)]" checked={picked.includes(c.id)} disabled={!!stateOf(c.id)} onChange={() => toggle(c.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.8125rem] text-t1">{c.rule}</div>
                      <div className="mono text-[0.6875rem] text-t3">
                        {c.id} · {c.section}
                      </div>
                    </div>
                    <Pill tone={stateOf(c.id) === "signed" ? "ok" : stateOf(c.id) === "reviewed" ? "info" : stateOf(c.id) === "queued" ? "warn" : "neutral"}>
                      {stateOf(c.id) === "signed" ? "Signed" : stateOf(c.id) === "reviewed" ? "Reviewed" : stateOf(c.id) === "queued" ? "Awaiting PE" : "Not sent"}
                    </Pill>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className="mr-auto text-[0.6875rem] text-t3">{pe ? `Reviewer: ${pe.name}, ${pe.license}` : "No PE reviewer on this project yet"}</span>
                <button className="btn btn-primary" disabled={!picked.length} onClick={() => { ws.getState().sendToPe(picked); setPicked([]); }}>
                  <Icon name="send" size={13} /> Send {picked.length || ""} to PE review
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "sign" && (
        <div className="space-y-3" data-testid="pe-sign">
          {queued.length === 0 ? (
            <p className="py-8 text-center text-[0.8125rem] text-t2">Send items to the review queue first, then the PE can edit, add notes and sign here.</p>
          ) : (
            <>
              <label className="block">
                <span className="label-xs">PE notes and edits</span>
                <textarea className="input mt-1 h-auto resize-none py-1.5" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Increase beam depth to 10″. Clip schedule approved with 24″ o.c. spacing." />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="label-xs">License number</span>
                  <input className="input mono mt-1" value={license} onChange={(e) => setLicense(e.target.value)} />
                </label>
                <div>
                  <span className="label-xs">Jurisdiction</span>
                  <div className="mt-1">
                    <Select<string> label="License jurisdiction" className="w-full" value={jur} onChange={setJur} options={["Florida", "Antigua & Barbuda", "Bahamas", "Jamaica"].map((j) => ({ value: j, label: j }))} />
                  </div>
                </div>
                <div>
                  <span className="label-xs">Date</span>
                  <input className="input mono mt-1" readOnly value={new Date().toISOString().slice(0, 10)} aria-label="Signature date" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-[0.75rem] text-t2">
                <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I have reviewed the {queued.length} queued item(s) and accept professional responsibility for the signed result.
              </label>
              <div className="flex justify-end gap-2">
                <button className="btn" disabled={!note.trim()} onClick={() => { ws.getState().peAdvance(queued.map((c) => c.id), "reviewed", note.trim(), pe?.name ?? "PE reviewer"); setNote(""); }}>
                  Save review
                </button>
                <button className="btn btn-primary" disabled={!agree || license.trim().length < 4} onClick={() => { ws.getState().peAdvance(queued.map((c) => c.id), "signed", `${license} · ${jur}`, pe?.name ?? "PE reviewer"); setTab("audit"); }}>
                  <Icon name="pesign" size={13} /> Sign digitally
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "audit" && (
        <ol className="space-y-2" data-testid="pe-audit">
          {log.map((l, i) => (
            <li key={i} className="flex gap-3 text-[0.75rem]">
              <span className="mono w-20 shrink-0 text-t3">{l.at}</span>
              <span className={cn("w-24 shrink-0 font-medium", l.actor === "BuildSync AI" ? "text-accent" : "text-t1")}>{l.actor}</span>
              <span className="text-t2">{l.text}</span>
            </li>
          ))}
          <li className="pt-1 text-[0.6875rem] text-t3">AI draft → PE edits → signed final. Every step is retained.</li>
        </ol>
      )}
    </Modal>
  );
}

/* ── Approvals ────────────────────────────────────────────────────────── */
export function ApprovalsModal() {
  const ws = useWsApi();
  const status = useWs((s) => s.peStatus);
  const anySigned = Object.values(status).includes("signed");
  const rows = [
    { name: "PE seal: structural", by: "R. Okafor, PE", tone: anySigned ? "ok" : "warn", label: anySigned ? "Signed" : "Awaiting PE" },
    { name: "Zoning and setbacks", by: "City of Miami Planning", tone: "ok", label: "Approved" },
    { name: "Building permit", by: "Miami-Dade Building Dept.", tone: "neutral", label: "Not submitted" },
    { name: "Fire marshal review", by: "Miami-Dade Fire Rescue", tone: "neutral", label: "Not submitted" },
    { name: "Owner sign-off", by: "Alvarez Family Trust", tone: "warn", label: "Pending" },
  ] as const;
  return (
    <Modal title="Approvals" subtitle="Everything required before construction" onClose={() => ws.getState().closeModal()} width="30rem">
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <div className="flex-1">
              <div className="text-[0.8125rem] text-t1">{r.name}</div>
              <div className="text-[0.6875rem] text-t3">{r.by}</div>
            </div>
            <Pill tone={r.tone}>{r.label}</Pill>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ── generated tables ─────────────────────────────────────────────────── */
export function ScheduleModal() {
  const ws = useWsApi();
  const scene = useScene();
  const [tab, setTab] = useState<"Door" | "Window">("Door");
  const rows = useMemo(
    () =>
      scene.elements
        .filter((e) => e.category === tab)
        .map((e) => {
          const w = Math.max(e.max[0] - e.min[0], e.max[1] - e.min[1]);
          const h = e.max[2] - e.min[2] + 0.1;
          return [e.id, e.name, `${(w + 0.1).toFixed(1)}' × ${h.toFixed(1)}'`, e.level === "level1" ? "Level 1" : e.level === "level2" ? "Level 2" : e.level, e.material];
        })
        .sort((a, b) => a[0].localeCompare(b[0])),
    [scene, tab],
  );
  const head = ["Mark", "Type", "Size (W × H)", "Level", "Material / rating"];
  return (
    <Modal
      title="Door / window schedule"
      subtitle="Generated from the model. It updates when elements change."
      onClose={() => ws.getState().closeModal()}
      width="44rem"
      footer={
        <button className="btn" onClick={() => saveCsv(`${tab.toLowerCase()}-schedule.csv`, [head, ...rows])}>
          <Icon name="download" size={13} /> Export CSV
        </button>
      }
    >
      <div role="tablist" className="mb-3 flex gap-4 border-b border-soft">
        {(["Door", "Window"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-1.5 text-[0.75rem] font-medium", tab === t ? "border-accent text-t1" : "border-transparent text-t2 hover:text-t1")}>
            {t}s ({scene.elements.filter((e) => e.category === t).length})
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[0.8125rem] text-t3">No {tab.toLowerCase()}s in this model yet.</p>
      ) : (
        <table className="w-full text-left text-[0.75rem]">
          <thead>
            <tr className="label-xs border-b border-soft">
              {head.map((h) => (
                <th key={h} className="pb-1.5 pr-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-soft/60 hover:bg-t1/5">
                <td className="mono py-1.5 pr-3 text-accent">{r[0]}</td>
                <td className="pr-3 text-t1">{r[1]}</td>
                <td className="mono pr-3 text-t2">{r[2]}</td>
                <td className="pr-3 text-t2">{r[3]}</td>
                <td className="text-t3">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/** Quantity take-off table, with CSV download. */
export function QtoModal() {
  const ws = useWsApi();
  const scene = useScene();
  const currency = useApp((s) => s.settings.units.currency);
  const data = useMemo(() => {
    const groups = new Map<string, { n: number; qty: number; unit: string; cost: number }>();
    for (const e of scene.elements) {
      if (e.category === "Topography") continue;
      const d = elementDetails(scene, e);
      const g = groups.get(e.category) ?? { n: 0, qty: 0, unit: "", cost: 0 };
      const dx = e.max[0] - e.min[0];
      const dy = e.max[1] - e.min[1];
      const dz = e.max[2] - e.min[2];
      g.n += 1;
      if (["Wall", "Partition"].includes(e.category)) {
        g.qty += Math.max(dx, dy) * dz;
        g.unit = "sf";
      } else if (["Slab", "Roof", "Paving"].includes(e.category)) {
        g.qty += dx * dy;
        g.unit = "sf";
      } else if (["Beam", "Foundation", "Footing"].includes(e.category)) {
        g.qty += Math.max(dx, dy);
        g.unit = "lf";
      } else {
        g.qty += 1;
        g.unit = "ea";
      }
      g.cost += d.cost.total;
      groups.set(e.category, g);
    }
    return [...groups.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [scene]);
  const total = data.reduce((a, [, g]) => a + g.cost, 0);
  const head = ["Category", "Elements", "Quantity", "Unit", "Cost"];
  const rows = data.map(([k, g]) => [k, String(g.n), String(Math.round(g.qty)), g.unit, fmtMoney(g.cost, currency)]);
  return (
    <Modal
      title="Quantity take-off"
      subtitle="Material quantities from the model. Unit rates are mock data."
      onClose={() => ws.getState().closeModal()}
      width="40rem"
      footer={
        <button className="btn" onClick={() => saveCsv("quantity-takeoff.csv", [head, ...rows])}>
          <Icon name="download" size={13} /> Export CSV
        </button>
      }
    >
      {data.length === 0 ? (
        <p className="py-8 text-center text-[0.8125rem] text-t3">Add elements to the model to take off quantities.</p>
      ) : (
        <table className="w-full text-left text-[0.75rem]">
          <thead>
            <tr className="label-xs border-b border-soft">
              {head.map((h, i) => (
                <th key={h} className={cn("pb-1.5 pr-3 font-semibold", i > 0 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-soft/60 hover:bg-t1/5">
                <td className="py-1.5 pr-3 text-t1">{r[0]}</td>
                <td className="mono pr-3 text-right text-t2">{r[1]}</td>
                <td className="mono pr-3 text-right text-t2">{Number(r[2]).toLocaleString("en-US")}</td>
                <td className="pr-3 text-right text-t3">{r[3]}</td>
                <td className="mono text-right text-t1">{r[4]}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="pt-2 text-right font-semibold text-t2">
                Total (element take-off)
              </td>
              <td className="mono pt-2 text-right font-semibold text-t1">{fmtMoney(total, currency)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ── Prompt to Plan ───────────────────────────────────────────────────── */
export function PromptToPlanModal({ prompt: initial }: { prompt?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  const mode = useWs((s) => s.mode);
  const currency = useApp((s) => s.settings.units.currency);
  const [prompt, setPrompt] = useState(initial ?? "Affordable 800 sq ft 2-bed 1-bath");
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const close = () => ws.getState().closeModal();

  const run = async () => {
    setBusy(true);
    app.getState().log("cmd", `› P2P ${prompt}`);
    const p = await generatePlan(prompt);
    setPlan(p);
    setBusy(false);
    app.getState().log("ai", `→ Prompt-to-Plan drafted ${p.title}: ${p.checksPassed}/${p.checksTotal} code checks pass`);
  };

  const open = () => {
    if (!plan) return;
    if (mode === "demo") {
      ws.getState().openModal("start-free");
      return;
    }
    const id = planProjectId(plan.sqft, plan.beds, plan.baths);
    app.getState().openTab(id);
    close();
    app.getState().toast("Starter plan opened as a new project");
    router.push(`/app/projects/${id}`);
  };

  return (
    <Modal
      title="Prompt to Plan"
      subtitle="Describe a building. BuildSync drafts a starter plan that already passes the code, cost and structural checks."
      onClose={close}
      width="36rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Close
          </button>
          <button className="btn btn-primary" disabled={!plan} onClick={open}>
            Open as new project
          </button>
        </>
      }
    >
      <div className="flex gap-2">
        <input data-autofocus className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && void run()} aria-label="Describe the building" />
        <button className="btn btn-primary shrink-0" disabled={busy || !prompt.trim()} onClick={() => void run()}>
          {busy ? <Spinner size={13} /> : <Icon name="p2p" size={13} />} Generate
        </button>
      </div>
      {plan && (
        <div className="anim-fade mt-4" data-testid="plan-result">
          <div className="flex items-center gap-2">
            <h3 className="text-[0.9375rem] font-semibold text-t1">{plan.title}</h3>
            <Pill tone="ok">{plan.checksPassed}/{plan.checksTotal} code checks pass</Pill>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[["Est. cost", fmtMoney(plan.cost, currency, true)], ["Schedule", `${plan.months} months`], ["Structural", "Pre-check OK"]].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-panel-alt px-3 py-2">
                <div className="label-xs">{k}</div>
                <div className="mono text-[0.9375rem] font-semibold text-t1">{v}</div>
              </div>
            ))}
          </div>
          <table className="mt-3 w-full text-[0.75rem]">
            <tbody>
              {plan.rooms.map((r) => (
                <tr key={r.name} className="border-b border-soft/60">
                  <td className="py-1 text-t1">{r.name}</td>
                  <td className="mono py-1 text-right text-t2">{r.area} sf</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 space-y-1 text-[0.6875rem] text-t3">
            {plan.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ── Share ────────────────────────────────────────────────────────────── */
export function ShareModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const project = useWs((s) => s.project);
  const members = useApp((s) => s.members);
  const [invite, setInvite] = useState(false);
  const slug = project.id;
  const link = `https://app.buildsync.ai/p/${slug}`;
  if (invite) return <InviteDialog onClose={() => setInvite(false)} z={70} />;
  return (
    <Modal title={`Share ${project.name}`} subtitle="Invite people and set roles" onClose={() => ws.getState().closeModal()} width="32rem" footer={<button className="btn btn-primary" onClick={() => setInvite(true)}><Icon name="userPlus" size={13} /> Invite</button>}>
      <div className="flex gap-2">
        <input readOnly className="input mono" value={link} aria-label="Share link" />
        <button className="btn shrink-0" onClick={() => { void navigator.clipboard?.writeText(link).catch(() => {}); app.getState().toast("Link copied"); }}>
          <Icon name="copy" size={13} /> Copy
        </button>
      </div>
      <p className="mt-1 text-[0.6875rem] text-t3">Anyone with the link can view. Editing needs a role below.</p>
      <ul className="mt-4 space-y-1.5">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <span className="grid size-7 place-items-center rounded-full bg-accent/80 text-[0.6875rem] font-bold text-on-accent">{m.name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] text-t1">{m.name}</div>
              <div className="truncate text-[0.6875rem] text-t3">{m.email}</div>
            </div>
            {m.role === "owner" ? (
              <Pill tone="info">{ROLE_LABEL[m.role]}</Pill>
            ) : (
              <Select<Member["role"]> label={`Role for ${m.name}`} className="!h-6 !min-w-[7rem] !text-[0.6875rem]" value={m.role} onChange={(v) => app.getState().setMemberRole(m.id, v)} options={ROLE_OPTIONS} />
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
type Member = import("@/lib/types").Member;
