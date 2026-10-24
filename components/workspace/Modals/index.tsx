/**
 * components/workspace/Modals/index.tsx
 *
 * WHAT   Renders whichever workspace dialog is open: it reads the workspace `modal` ({ id, data }) and shows
 *        the matching dialog (project info, jurisdiction, new project, versions, export, start free, import,
 *        geolocate, PE sign-off, approvals, schedule, quantity take-off, Prompt to Plan, share, invite).
 * FOR    Any code opens a dialog with ws.getState().openModal(id, data) and closes it with closeModal(). The
 *        Settings window is not here: it is a route (components/settings).
 * DEBUG  - A dialog does not open: its id must have a case in the switch below and be spelt the same where
 *          openModal is called.
 *        - Dialog data is ignored: each case casts modal.data fields (tab, format, kind, prompt) to the
 *          dialog's props.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
"use client";

import { useWs } from "@/lib/store/workspace-provider";
import { ApprovalsModal, PeSignoffModal, PromptToPlanModal, QtoModal, ScheduleModal, ShareModal } from "./ReviewModals";
import { ExportModal, GeolocateModal, ImportModal, JurisdictionModal, NewProjectModal, ProjectInfoModal, StartFreeModal, VersionsModal } from "./ProjectModals";
import { InviteDialog } from "@/components/shared/InviteDialog";
import { useWsApi } from "@/lib/store/workspace-provider";

/** Renders whichever workspace modal is open (spec §10.12: Settings, Connect Agent, PE Sign-off, Project Information, Import). */
export function Modals() {
  const modal = useWs((s) => s.modal);
  const ws = useWsApi();
  if (!modal) return null;
  const d = modal.data ?? {};
  switch (modal.id) {
    case "project-info":
      return <ProjectInfoModal tab={d.tab as string | undefined} />;
    case "jurisdiction":
      return <JurisdictionModal />;
    case "new-project":
      return <NewProjectModal />;
    case "versions":
      return <VersionsModal tab={d.tab as string | undefined} />;
    case "export":
      return <ExportModal format={d.format as string | undefined} />;
    case "start-free":
      return <StartFreeModal />;
    case "import":
      return <ImportModal kind={d.kind as string | undefined} />;
    case "geolocate":
      return <GeolocateModal />;
    case "pe-signoff":
      return <PeSignoffModal />;
    case "approvals":
      return <ApprovalsModal />;
    case "schedule":
      return <ScheduleModal />;
    case "qto":
      return <QtoModal />;
    case "p2p":
      return <PromptToPlanModal prompt={d.prompt as string | undefined} />;
    case "share":
      return <ShareModal />;
    case "invite":
      return <InviteDialog onClose={() => ws.getState().closeModal()} />;
    default:
      return null;
  }
}
