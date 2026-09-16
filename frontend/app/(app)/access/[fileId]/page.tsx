"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useManageAccess } from "@/src/access/[fileId]/hooks";
import { AccessSkeleton, StudentView, OwnerView } from "@/src/access/[fileId]/components";

export default function ManageAccessPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const router = useRouter();
  const a = useManageAccess(fileId);

  return (
    <div className="h-full overflow-y-auto bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
        <button
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="text-indigo-400" size={22} />
          <h1 className="text-2xl font-semibold">Manage Access</h1>
        </div>
        <p className="mb-6 text-sm text-gray-400">{a.fileName}</p>

        {a.error && (
          <div className="mb-4 rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">{a.error}</div>
        )}

        {a.loading ? (
          <AccessSkeleton />
        ) : a.isOwner === false ? (
          <StudentView sections={a.mySections} />
        ) : (
          <OwnerView
            fileId={fileId}
            tab={a.tab}
            setTab={a.setTab}
            assignedTo={a.assignedTo}
            sections={a.sections}
            grantByEmail={a.grantByEmail}
            reload={a.reload}
            setError={a.setError}
          />
        )}
      </div>
    </div>
  );
}
