"use client";

import { useParams } from "next/navigation";
import { useDashboard } from "@/src/dashboard/[fileId]/hooks";
import {
  DashboardHeader,
  SectionsPanel,
  ChatsPanel,
  PageSkeleton,
} from "@/src/dashboard/[fileId]/components";

export default function FileDashboardPage() {
  const params = useParams();
  const fileId = params?.fileId as string;
  const d = useDashboard(fileId);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 flex flex-col">
      <DashboardHeader
        fileName={d.fileName}
        isOwner={d.isOwner}
        onBack={() => history.back()}
        onAssign={d.goToAccess}
        onNewChat={() => d.createNewChat()}
      />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {d.initialLoading ? (
          <PageSkeleton />
        ) : (
          <>
            <SectionsPanel
              sections={d.sections}
              isOwner={d.isOwner}
              onManage={d.goToAccess}
              onChat={(s) => d.createNewChat(s)}
            />
            <ChatsPanel
              chats={d.chats}
              renamingId={d.renamingId}
              renameValue={d.renameValue}
              setRenameValue={d.setRenameValue}
              onOpen={d.openChat}
              onStartRename={d.startRename}
              onSubmitRename={d.submitRename}
              onCancelRename={d.cancelRename}
              onDelete={d.removeChat}
              onCreate={() => d.createNewChat()}
            />
          </>
        )}
      </main>
    </div>
  );
}
