"use client";

import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="min-h-screen p-6 bg-neutral-900 text-neutral-100">
      <div className="max-w-4xl mx-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <h1 className="text-2xl font-bold mb-3">Profile Settings</h1>
        <p className="text-sm text-neutral-400 mb-4">
          This panel is for user settings. You can store your PDF files using the Document Storage section.
        </p>

        <Link href="/profile/files" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium">
          Go to File Storage
        </Link>
      </div>
    </div>
  );
}
