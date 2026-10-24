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
