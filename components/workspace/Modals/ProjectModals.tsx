/**
 * components/workspace/Modals/ProjectModals.tsx
 *
 * WHAT   Project-level dialogs: Project Information, Jurisdiction, New project and Start free (demo). Import and
 *        Export are real and live in ImportModal.tsx and ExportModal.tsx; where the site is on the map lives in the
 *        Site palette (Palettes/Site.tsx).
 * FOR    Opened through the workspace modal state (Modals/index.tsx).
 * DEBUG  - Sign-up (Start free) is outside this front-end build: it says so and opens the workspace.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Pill, Select } from "@/components/ui/controls";
import { JURISDICTIONS, TEMPLATES } from "@/lib/mock-data";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn } from "@/lib/utils";

/* ── Project Information ──────────────────────────────────────────────── */
export function ProjectInfoModal({ tab: initial }: { tab?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const p = useWs((s) => s.project);
  const [tab, setTab] = useState<"info" | "standards">(initial === "standards" ? "standards" : "info");
  const [f, setF] = useState({ name: p.name, address: p.address, client: p.client, architect: p.architect, engineer: p.engineer });
  const [jur, setJur] = useState(p.jurisdiction.name);
  const close = () => ws.getState().closeModal();

  const save = () => {
    const j = JURISDICTIONS.find((x) => x.name === jur);
    ws.getState().updateProject({ ...f, ...(j ? { jurisdiction: j } : {}) });
    app.getState().toast("Project information saved");
    close();
  };

  const field = (k: keyof typeof f, label: string, ph = "") => (
    <label className="block" key={k}>
      <span className="label-xs">{label}</span>
      <input className="input mt-1" value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );

  return (
    <Modal
      title="Project Information"
      subtitle={p.fileName}
      onClose={close}
      width="34rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div role="tablist" className="mb-3 flex gap-4 border-b border-soft">
        {(["info", "standards"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-1.5 text-[0.75rem] font-medium capitalize", tab === t ? "border-accent text-t1" : "border-transparent text-t2 hover:text-t1")}>
            {t === "info" ? "Information" : "Standards"}
          </button>
        ))}
      </div>
      {tab === "info" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">{field("name", "Project Name")}</div>
          <div className="col-span-2">{field("address", "Address", "Street, city, region")}</div>
          {field("client", "Client")}
          {field("architect", "Architect")}
          {field("engineer", "Engineer of Record")}
          <div>
            <span className="label-xs">Jurisdiction</span>
            <div className="mt-1">
              <Select<string> label="Jurisdiction" className="w-full" value={jur} onChange={setJur} options={JURISDICTIONS.map((j) => ({ value: j.name, label: `${j.name} · ${j.codeSet}` }))} />
            </div>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-[0.75rem]">
          {[
            ["Layer Standard", "AIA CAD Layer Guidelines"],
            ["Dimension Style", "Architectural, 1/8\" text"],
            ["Annotation Scale", "1/4\" = 1'-0\""],
            ["Sheet Size", "ARCH D (24 × 36 in)"],
            ["Title Block", "BuildSync standard"],
            ["Code Citation Style", "Section + edition"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label-xs">{k}</dt>
              <dd className="mt-0.5 text-t1">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Modal>
  );
}

/* ── Jurisdiction ─────────────────────────────────────────────────────── */
export function JurisdictionModal() {
  const ws = useWsApi();
  const cur = useWs((s) => s.project.jurisdiction.name);
  const [sel, setSel] = useState(cur);
  const [q, setQ] = useState("");
  const close = () => ws.getState().closeModal();
  const list = JURISDICTIONS.filter((j) => j.name.toLowerCase().includes(q.toLowerCase()) || j.codeSet.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal
      title="Change Jurisdiction"
      subtitle="Codes are resolved per jurisdiction. Shared code bases (e.g. Caribbean referencing Florida) are flagged."
      onClose={close}
      width="30rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={sel === cur}
            onClick={() => {
              const j = JURISDICTIONS.find((x) => x.name === sel)!;
              ws.getState().setJurisdiction(j.name, j.codeSet);
              close();
            }}
          >
            Apply
          </button>
        </>
      }
    >
      <input data-autofocus className="input mb-2" placeholder="Search jurisdictions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Jurisdictions" />
      <ul role="radiogroup" aria-label="Jurisdictions" className="space-y-1">
        {list.map((j) => (
          <li key={j.name}>
            <button
              role="radio"
              aria-checked={sel === j.name}
              onClick={() => setSel(j.name)}
              className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors", sel === j.name ? "border-accent bg-accent/10" : "border-line hover:border-t3")}
            >
              <Icon name="landmark" size={16} className={sel === j.name ? "text-accent" : "text-t3"} />
              <span className="flex-1">
                <span className="block text-[0.8125rem] font-medium text-t1">{j.name}</span>
                <span className="mono block text-[0.6875rem] text-t3">{j.codeSet}</span>
              </span>
              {j.name === cur && <Pill tone="info">Current</Pill>}
              {j.name === "Antigua & Barbuda" && <Pill tone="warn">Pilot</Pill>}
              {j.name === "Antigua & Barbuda" && <span className="sr-only">references the Florida building code</span>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-[0.75rem] text-t3">No jurisdiction matches “{q}”.</li>}
      </ul>
    </Modal>
  );
}

/* ── New project ──────────────────────────────────────────────────────── */
export function NewProjectModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  const [tpl, setTpl] = useState(TEMPLATES[3].id);
  const [jur, setJur] = useState(JURISDICTIONS[0].name);
  const close = () => ws.getState().closeModal();
  return (
    <Modal
      title="New Project"
      subtitle="Starts a blank model tab. Use Prompt to Plan for a generated starter plan."
      onClose={close}
      width="30rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              const id = app.getState().newUntitled();
              close();
              app.getState().toast("New project created");
              app.getState().log("ok", `✓ Created ${id}`);
              router.push(`/app/projects/${id}`);
            }}
          >
            Create Project
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <span className="label-xs">Template</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} aria-pressed={tpl === t.id} onClick={() => setTpl(t.id)} className={cn("rounded-lg border px-3 py-2 text-left transition-colors", tpl === t.id ? "border-accent bg-accent/10" : "border-line hover:border-t3")}>
                <span className="block text-[0.75rem] font-medium text-t1">{t.name}</span>
                <span className="block text-[0.6875rem] text-t3">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label-xs">Jurisdiction</span>
          <div className="mt-1">
            <Select<string> label="Jurisdiction" className="w-full" value={jur} onChange={setJur} options={JURISDICTIONS.map((j) => ({ value: j.name, label: `${j.name} · ${j.codeSet}` }))} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Start free (demo) ────────────────────────────────────────────────── */
export function StartFreeModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const close = () => ws.getState().closeModal();
  return (
    <Modal title="Start Free to Save Your Work" subtitle="You're in the demo. Your work is saved in this browser only." onClose={close} width="26rem">
      <ul className="mb-3 space-y-1.5 text-[0.75rem] text-t2">
        {["Save and version your projects", "Connect Claude, ChatGPT, Kimi and more", "Free for engineering students"].map((t) => (
          <li key={t} className="flex gap-2">
            <Icon name="check" size={13} className="mt-px text-ok" /> {t}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          app.getState().toast("Sign-up isn't part of this build. Opening the workspace.", "info");
          close();
          router.push("/app");
        }}
      >
        <input type="email" required className="input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" data-autofocus />
        <button className="btn btn-primary shrink-0">Start Free</button>
      </form>
      <p className="mt-2 text-[0.6875rem] text-t3">Authentication and payments are out of scope for this front-end build and are stubbed.</p>
    </Modal>
  );
}
