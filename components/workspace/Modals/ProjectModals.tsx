"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Pill, Select, Spinner } from "@/components/ui/controls";
import { JURISDICTIONS, TEMPLATES } from "@/lib/mock-data";
import { useAppApi } from "@/lib/store/app-provider";
import { useWs, useWsApi } from "@/lib/store/workspace-provider";
import { cn, sleep } from "@/lib/utils";

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
          <div className="col-span-2">{field("name", "Project name")}</div>
          <div className="col-span-2">{field("address", "Address", "Street, city, region")}</div>
          {field("client", "Client")}
          {field("architect", "Architect")}
          {field("engineer", "Engineer of record")}
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
            ["Layer standard", "AIA CAD Layer Guidelines"],
            ["Dimension style", "Architectural, 1/8\" text"],
            ["Annotation scale", "1/4\" = 1'-0\""],
            ["Sheet size", "ARCH D (24 × 36 in)"],
            ["Title block", "BuildSync standard"],
            ["Code citation style", "Section + edition"],
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
      title="Change jurisdiction"
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
      <input data-autofocus className="input mb-2" placeholder="Search jurisdictions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jurisdictions" />
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
      title="New project"
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
            Create project
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

/* ── Versions / History ───────────────────────────────────────────────── */
export function VersionsModal({ tab: initial }: { tab?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const versions = useWs((s) => s.project.versions);
  const undo = useWs((s) => s.undoStack);
  const [tab, setTab] = useState<"versions" | "history">(initial === "history" ? "history" : "versions");
  const close = () => ws.getState().closeModal();
  return (
    <Modal title={tab === "versions" ? "Project versions" : "Project history"} subtitle="View and restore earlier versions, or read the activity log." onClose={close} width="32rem">
      <div role="tablist" className="mb-3 flex gap-4 border-b border-soft">
        {(["versions", "history"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 pb-1.5 text-[0.75rem] font-medium capitalize", tab === t ? "border-accent text-t1" : "border-transparent text-t2 hover:text-t1")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "versions" ? (
        <ul className="space-y-1.5">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
              <Icon name="versions" size={15} className="text-t3" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] text-t1">{v.label}</div>
                <div className="text-[0.6875rem] text-t3">
                  {v.by} · {v.at}
                </div>
              </div>
              {i === 0 ? (
                <Pill tone="info">Current</Pill>
              ) : (
                <button
                  className="btn !h-6 px-2 text-[0.6875rem]"
                  onClick={() => {
                    ws.getState().edit(`Restore ${v.id}`, () => ({}));
                    app.getState().toast(`Restored ${v.id} (mock)`);
                    app.getState().log("ok", `✓ Restored ${v.label}`);
                    close();
                  }}
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <ol className="space-y-1.5 text-[0.75rem]">
          {[...undo].reverse().map((u, i) => (
            <li key={i} className="flex gap-2 border-b border-soft/60 pb-1.5">
              <span className="mono text-t3">You</span>
              <span className="text-t1">{u.label}</span>
              <span className="ml-auto text-t3">this session</span>
            </li>
          ))}
          {["Imported concept plan v1.0", "Ran compliance pass (FBC 8th Ed.)", "Added stair and L2 partitions", "Foundation revised for soil report"].map((t) => (
            <li key={t} className="flex gap-2 border-b border-soft/60 pb-1.5">
              <span className="mono text-t3">Team</span>
              <span className="text-t1">{t}</span>
              <span className="ml-auto text-t3">earlier</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/* ── Export ───────────────────────────────────────────────────────────── */
export function ExportModal({ format: initial }: { format?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const name = useWs((s) => s.project.name);
  const [fmt, setFmt] = useState((initial ?? "pdf").toLowerCase());
  const [busy, setBusy] = useState(false);
  const close = () => ws.getState().closeModal();
  const ext: Record<string, string> = { pdf: "pdf", ifc: "ifc", dwg: "dwg", report: "pdf", render: "png" };
  return (
    <Modal
      title="Export"
      subtitle="PDF · IFC · DWG · report · render"
      onClose={close}
      width="28rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await sleep(900);
              app.getState().toast(`Exported ${name}.${ext[fmt]} (mock)`);
              app.getState().log("ok", `✓ Exported ${name}.${ext[fmt]} · AI-generated, unstamped`);
              close();
            }}
          >
            {busy && <Spinner size={13} />} Export
          </button>
        </>
      }
    >
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Export format">
        {["pdf", "ifc", "dwg", "report", "render"].map((f) => (
          <button key={f} role="radio" aria-checked={fmt === f} onClick={() => setFmt(f)} className={cn("rounded-lg border py-2 text-[0.75rem] font-medium uppercase transition-colors", fmt === f ? "border-accent bg-accent/10 text-t1" : "border-line text-t2 hover:border-t3")}>
            {f}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.75rem] text-t2">
        The export carries the “AI-generated, unstamped” advisory mark. Life-safety and load-bearing sheets are flagged <b className="text-warn">Requires PE Review</b> until a licensed PE signs.
      </p>
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
    <Modal title="Start free to save your work" subtitle="You're in the demo. Edits aren't saved." onClose={close} width="26rem">
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
        <button className="btn btn-primary shrink-0">Start free</button>
      </form>
      <p className="mt-2 text-[0.6875rem] text-t3">Authentication and payments are out of scope for this front-end build and are stubbed.</p>
    </Modal>
  );
}

/* ── Import ───────────────────────────────────────────────────────────── */
const IMPORT_META: Record<string, { title: string; accept: string; hint: string; result: string[] }> = {
  dwg: { title: "Attach DWG / DXF", accept: ".dwg,.dxf", hint: "Overlay an AutoCAD / Civil 3D plan or survey", result: ["214 entities", "12 layers", "units: feet", "origin matched to project base point"] },
  dxf: { title: "Attach DWG / DXF", accept: ".dwg,.dxf", hint: "Overlay an AutoCAD / Civil 3D plan or survey", result: ["198 entities", "9 layers", "units: feet"] },
  ifc: { title: "Import IFC", accept: ".ifc", hint: "Building model from another BIM tool", result: ["1,204 elements", "IFC4", "4 storeys mapped to levels"] },
  pdf: { title: "Attach PDF / image underlay", accept: ".pdf,image/*", hint: "Underlay to trace", result: ["1 page", "scale not detected: set with ALIGN"] },
  image: { title: "Attach image underlay", accept: "image/*", hint: "Underlay to trace", result: ["3024 × 2016 px", "scale not detected: set with ALIGN"] },
  landxml: { title: "Import survey / LandXML", accept: ".xml,.landxml", hint: "Civil 3D surface, survey points", result: ["1 TIN surface", "3,481 points", "contour interval 0.5 ft"] },
  terrain: { title: "Import terrain / topography", accept: ".xml,.tif,.csv", hint: "Contours and grading surface", result: ["grid 5 ft", "elevation −4.1 to +3.8 ft"] },
  drone: { title: "Import drone data", accept: ".tif,.las,.laz", hint: "DroneDeploy orthomosaic or point cloud", result: ["orthomosaic 2.1 cm/px", "point cloud 18 M points", "georeferenced"] },
  soil: { title: "Attach soil test report", accept: ".pdf,.csv", hint: "Geotechnical report → bearing capacity and soil class", result: ["3 borings", "Site Class D", "allowable bearing 2,500 psf"] },
  xref: { title: "Xref another project", accept: "", hint: "Link another BuildSync project as a reference", result: ["linked: Clinic_Phase1_Antigua", "read-only reference"] },
};

export function ImportModal({ kind }: { kind?: string }) {
  const ws = useWsApi();
  const app = useAppApi();
  const meta = IMPORT_META[kind ?? "dwg"] ?? IMPORT_META.dwg;
  const [file, setFile] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "parsing" | "done">("idle");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => ws.getState().closeModal();

  const pick = async (name: string) => {
    setFile(name);
    setPhase("parsing");
    await sleep(1100);
    setPhase("done");
  };

  return (
    <Modal
      title={meta.title}
      subtitle={`${meta.hint}. File parsing is mocked in this build.`}
      onClose={close}
      width="30rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={phase !== "done"}
            onClick={() => {
              ws.getState().edit(`Import ${file}`, () => ({}));
              app.getState().toast(`${file} attached`);
              app.getState().log("ok", `✓ Attached ${file}: ${meta.result.join(" · ")}`);
              close();
            }}
          >
            Insert
          </button>
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void pick(f.name);
        }}
        className={cn("grid place-items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors", over ? "border-accent bg-accent/10" : "border-line")}
      >
        <Icon name="upload" size={24} className="text-t3" />
        <p className="mt-2 text-[0.8125rem] text-t1">{file ?? "Drop a file here"}</p>
        {meta.accept && <p className="mono mt-0.5 text-[0.6875rem] text-t3">{meta.accept.replaceAll(",", " · ")}</p>}
        <button className="btn mt-3" onClick={() => (kind === "xref" ? void pick("Clinic_Phase1_Antigua.bsd") : input.current?.click())}>
          {kind === "xref" ? "Choose a project" : "Choose file"}
        </button>
        <input ref={input} type="file" accept={meta.accept} className="sr-only" aria-label="Choose file" onChange={(e) => e.target.files?.[0] && void pick(e.target.files[0].name)} />
      </div>
      {phase === "parsing" && (
        <p className="mt-3 flex items-center gap-2 text-[0.75rem] text-t2">
          <Spinner size={13} /> Parsing {file}…
        </p>
      )}
      {phase === "done" && (
        <ul className="anim-fade mt-3 space-y-1 rounded-lg border border-ok/30 bg-ok/5 p-3 text-[0.75rem] text-t1">
          {meta.result.map((r) => (
            <li key={r} className="flex gap-2">
              <Icon name="check" size={13} className="mt-px text-ok" /> {r}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ── Place on map ─────────────────────────────────────────────────────── */
export function GeolocateModal() {
  const ws = useWsApi();
  const app = useAppApi();
  const address = useWs((s) => s.project.address);
  const [q, setQ] = useState(address || "1420 SW 27th Ave, Miami, FL");
  const [terrain, setTerrain] = useState(true);
  const close = () => ws.getState().closeModal();
  return (
    <Modal
      title="Place on map"
      subtitle="Google Maps location and 3D terrain (mock map)"
      onClose={close}
      width="34rem"
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              ws.getState().edit("Geolocate", () => ({}));
              app.getState().toast("Plan placed at 25.7617° N, 80.1918° W");
              app.getState().log("ok", `✓ Placed on map: ${q}${terrain ? " with 3D terrain" : ""}`);
              close();
            }}
          >
            Place plan
          </button>
        </>
      }
    >
      <input data-autofocus className="input" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Address" />
      <div className="relative mt-3 h-52 overflow-hidden rounded-xl border border-line bg-[#1c2a24]" role="img" aria-label="Map preview">
        <svg viewBox="0 0 400 210" className="size-full">
          <rect width="400" height="210" fill="#1d2b25" />
          {[40, 95, 150, 205, 260, 330].map((x) => (
            <path key={x} d={`M${x} 0 L${x + 24} 210`} stroke="#2e4338" strokeWidth="9" />
          ))}
          {[30, 80, 140, 180].map((y) => (
            <path key={y} d={`M0 ${y} L400 ${y + 10}`} stroke="#2e4338" strokeWidth="9" />
          ))}
          <path d="M0 120 C100 90 200 160 400 100" stroke="#355a6a" strokeWidth="16" fill="none" opacity=".7" />
          {terrain && [1, 2, 3].map((i) => <ellipse key={i} cx="205" cy="105" rx={30 + i * 30} ry={18 + i * 18} fill="none" stroke="#6a8f78" strokeOpacity=".4" strokeDasharray="3 3" />)}
          <g transform="translate(205 98)">
            <path d="M0 0c-9-14-14-19-14-27a14 14 0 0 1 28 0c0 8-5 13-14 27z" fill="#ef5b5b" stroke="#fff" strokeWidth="1.5" />
            <circle cy="-27" r="5" fill="#fff" />
          </g>
        </svg>
        <span className="mono absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[0.625rem] text-white">25.7617° N, 80.1918° W</span>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[0.75rem] text-t1">
        <input type="checkbox" checked={terrain} onChange={(e) => setTerrain(e.target.checked)} className="accent-[var(--accent)]" /> Include 3D terrain and contours
      </label>
    </Modal>
  );
}
