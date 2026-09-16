"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Download, Trash2, Pencil, Check, X, UploadCloud, RefreshCw, UserPlus,
  FileText, Loader2, HardDrive, Files as FilesIcon, ArrowUpRight, Search,
} from "lucide-react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type DocRecord = {
  _id: string;
  fileName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
  isOwner?: boolean;
  assignedTo?: string[];
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtMB = (bytes: number) => `${((bytes || 0) / 1024 / 1024).toFixed(2)} MB`;

export default function ProfileFileStoragePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");
  const [isError, setIsError] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [isDragActive, setIsDragActive] = useState(false);

  const [assignModalFile, setAssignModalFile] = useState<DocRecord | null>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [search, setSearch] = useState("");

  const notify = (msg: string, err = false) => {
    setMessage(msg);
    setIsError(err);
  };

  // Auto-dismiss the toast
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const loadDocs = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/files`, { headers: { ...authHeaders() } });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setDocs(data.files || []);
    } catch (err) {
      console.error("Could not load documents:", err);
      notify("Could not load files. Please log in and ensure backend is running.", true);
      setDocs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const onUpload = async () => {
    if (!selectedFile) {
      notify("Choose a PDF file first.", true);
      return;
    }
    if (selectedFile.type !== "application/pdf") {
      notify("Only PDF is allowed.", true);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`${API_URL}/api/files/upload`, {
        method: "POST",
        headers: { ...authHeaders() },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Upload failed");
      }

      const data = await res.json();
      notify(`Uploaded: ${data.file.fileName}`);
      setSelectedFile(null);
      window.dispatchEvent(new CustomEvent("fileUploaded", { detail: data.file }));
      await loadDocs();
    } catch (err) {
      console.error(err);
      notify(`Upload failed: ${(err as Error).message}`, true);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (docId: string) => {
    if (!confirm("Delete this file?")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/files/${docId}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Delete failed");
      notify("File deleted");
      await loadDocs();
    } catch (err) {
      console.error(err);
      notify((err as Error).message || "Delete failed", true);
    } finally {
      setIsLoading(false);
    }
  };

  const onRename = async (docId: string, newName: string) => {
    if (!newName.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/files/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ fileName: newName.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setEditId(null);
      setEditName("");
      notify("Renamed");
      window.dispatchEvent(
        new CustomEvent("fileUpdated", { detail: { fileId: docId, fileName: newName.trim() } })
      );
      await loadDocs();
    } catch (err) {
      console.error(err);
      notify((err as Error).message || "Rename failed", true);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadDocument = async (doc: DocRecord) => {
    try {
      const res = await fetch(`${API_URL}/api/files/${doc._id}/download`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Download URL failed");
      const data = await res.json();
      if (!data.url) throw new Error("No URL");
      window.open(data.url, "_blank");
    } catch (err) {
      console.error(err);
      notify((err as Error).message || "Download failed", true);
    }
  };

  const handleAssign = async () => {
    if (!assignEmail.trim() || !assignModalFile) return;
    setIsAssigning(true);
    try {
      const res = await fetch(`${API_URL}/api/files/${assignModalFile._id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ email: assignEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to assign");
      setAssignModalFile({ ...assignModalFile, assignedTo: data.assignedTo });
      setAssignEmail("");
      await loadDocs();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRevoke = async (email: string) => {
    if (!assignModalFile) return;
    try {
      const res = await fetch(`${API_URL}/api/files/${assignModalFile._id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to revoke");
      setAssignModalFile({ ...assignModalFile, assignedTo: data.assignedTo });
      await loadDocs();
    } catch (err) {
      console.error(err);
      alert((err as Error).message);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setIsDragActive(true);
    else if (e.type === "dragleave") setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const totalSize = useMemo(() => docs.reduce((sum, d) => sum + (d.fileSize || 0), 0), [docs]);
  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.fileName.toLowerCase().includes(q));
  }, [docs, search]);

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-neutral-950 via-neutral-950 to-black">
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>

      <div className="mx-auto max-w-5xl px-4 sm:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-900/30">
              <HardDrive className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Document Storage</h1>
              <p className="text-sm text-neutral-400">Upload and manage your PDF files securely</p>
            </div>
          </div>

          {/* Stat tiles */}
          <div className="flex gap-3">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2.5 text-center min-w-[84px]">
              <div className="flex items-center justify-center gap-1.5 text-lg font-bold text-white">
                <FilesIcon size={15} className="text-blue-400" /> {docs.length}
              </div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">Files</p>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-2.5 text-center min-w-[84px]">
              <div className="text-lg font-bold text-white">{(totalSize / 1024 / 1024).toFixed(1)}</div>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500">MB used</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr] lg:items-start">
        {/* Upload card (left) */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5 sm:p-6 lg:sticky lg:top-4">
          <h2 className="mb-4 text-base font-semibold text-white">Upload new document</h2>

          <label
            htmlFor="file-input"
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`relative block cursor-pointer rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition-all ${
              isDragActive
                ? "border-blue-500 bg-blue-500/10"
                : "border-neutral-700 hover:border-blue-500/60 hover:bg-neutral-900"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-colors ${
              isDragActive ? "bg-blue-500/20" : "bg-neutral-800"
            }`}>
              <UploadCloud className={isDragActive ? "text-blue-400" : "text-neutral-400"} size={26} />
            </div>
            <p className="font-medium text-white">
              {isDragActive ? "Drop to upload" : "Drag & drop your PDF here"}
            </p>
            <p className="mt-1 text-sm text-neutral-500">or click anywhere in this box to browse</p>
            <p className="mt-3 text-xs text-neutral-600">PDF only · up to 100 MB</p>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="hidden"
              id="file-input"
              disabled={uploading}
            />
          </label>

          {/* Selected file + upload action */}
          {selectedFile && (
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{selectedFile.name}</p>
                  <p className="text-xs text-neutral-500">{fmtMB(selectedFile.size)}</p>
                </div>
                {!uploading && (
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-red-400"
                    title="Remove"
                  >
                    <X size={18} />
                  </button>
                )}
                <button
                  onClick={onUpload}
                  disabled={uploading || isLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-60"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>

              {/* Indeterminate progress while uploading */}
              {uploading && (
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    style={{ animation: "indeterminate 1.1s ease-in-out infinite" }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Files (right) */}
        <div>
          {/* Search */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 transition-colors focus-within:border-blue-500/60">
            <Search size={16} className="shrink-0 text-neutral-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your documents…"
              className="w-full bg-transparent text-sm text-white placeholder-neutral-600 outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-neutral-500 hover:text-white">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">
              Your files <span className="text-neutral-500">({filteredDocs.length})</span>
            </h2>
            <button
              onClick={loadDocs}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

        {isLoading && docs.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[74px] animate-pulse rounded-xl border border-neutral-800 bg-neutral-900/50" />
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800">
              <FileText className="text-neutral-500" size={26} />
            </div>
            <p className="font-medium text-neutral-300">{search ? "No matching documents" : "No documents yet"}</p>
            <p className="mt-1 text-sm text-neutral-500">{search ? "Try a different search." : "Upload a PDF to get started."}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredDocs.map((doc) => (
              <div
                key={doc._id}
                className="group flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3.5 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                {/* PDF icon tile */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                  <FileText size={20} />
                </div>

                {editId === doc._id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRename(doc._id, editName);
                        if (e.key === "Escape") { setEditId(null); setEditName(""); }
                      }}
                      className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                    />
                    <button onClick={() => onRename(doc._id, editName)} className="p-2 text-green-500 hover:text-green-400" title="Save">
                      <Check size={18} />
                    </button>
                    <button onClick={() => { setEditId(null); setEditName(""); }} className="p-2 text-neutral-500 hover:text-neutral-300" title="Cancel">
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Link href={`/dashboard/${doc._id}`} className="min-w-0 flex-1 cursor-pointer">
                      <p className="flex items-center gap-1 truncate font-medium text-white transition-colors group-hover:text-blue-400">
                        {doc.fileName}
                        <ArrowUpRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {new Date(doc.uploadedAt).toLocaleDateString()} · {fmtMB(doc.fileSize || 0)}
                      </p>
                    </Link>

                    <div className="flex items-center gap-0.5">
                      {doc.isOwner === false ? (
                        <span className="rounded-full border border-orange-800/60 bg-orange-900/30 px-2.5 py-1 text-xs text-orange-300">
                          Shared with you
                        </span>
                      ) : (
                        <>
                          <button onClick={() => setAssignModalFile(doc)} className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-purple-400" title="Share / Assign">
                            <UserPlus size={17} />
                          </button>
                          <button onClick={() => downloadDocument(doc)} className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-blue-400" title="Download">
                            <Download size={17} />
                          </button>
                          <button onClick={() => { setEditId(doc._id); setEditName(doc.fileName); }} className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200" title="Rename">
                            <Pencil size={17} />
                          </button>
                          <button onClick={() => onDelete(doc._id)} className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-red-500/15 hover:text-red-400" title="Delete">
                            <Trash2 size={17} />
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4">
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${
            isError
              ? "border-red-800/60 bg-red-950/90 text-red-200"
              : "border-emerald-800/60 bg-emerald-950/90 text-emerald-200"
          }`}>
            {isError ? <X size={16} /> : <Check size={16} />}
            <span className="max-w-xs truncate">{message}</span>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignModalFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAssignModalFile(null)}>
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Share / Assign PDF</h3>
              <button onClick={() => setAssignModalFile(null)} className="text-neutral-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <p className="mb-4 text-sm text-neutral-400">
              Assign <strong className="text-white">{assignModalFile.fileName}</strong> to another user.
              They receive an email and can chat with the topics you approve (they cannot view the raw file).
              <br />
              <span className="text-xs text-purple-400">Tip: add multiple emails separated by commas or spaces.</span>
            </p>

            <div className="mb-6 flex gap-2">
              <input
                type="email"
                placeholder="User's email address"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAssign()}
                className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
              />
              <button
                onClick={handleAssign}
                disabled={isAssigning || !assignEmail.trim()}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isAssigning ? "Assigning…" : "Assign"}
              </button>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium text-neutral-300">Assigned users</h4>
              {(!assignModalFile.assignedTo || assignModalFile.assignedTo.length === 0) ? (
                <p className="text-xs text-neutral-500">Not assigned to anyone yet.</p>
              ) : (
                <ul className="space-y-2">
                  {assignModalFile.assignedTo.map((email) => (
                    <li key={email} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                      <span className="text-sm text-neutral-300">{email}</span>
                      <button onClick={() => handleRevoke(email)} className="text-xs text-red-400 transition-colors hover:text-red-300">
                        Revoke
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
