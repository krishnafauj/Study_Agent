"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, Trash2, Pencil, Check, X, Upload, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type DocRecord = {
  _id: string;
  fileName: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
};

// Fixed: Explicitly returning Record<string, string> to satisfy TypeScript's HeadersInit requirement
const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ProfileFileStoragePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");

  const loadDocs = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_URL}/api/files`, {
        headers: { ...authHeaders() },
      });
      if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
      const data = await resp.json();
      setDocs(data.files || []);
    } catch (err) {
      console.error("Could not load documents:", err);
      setMessage("Could not load files. Please log in and ensure backend is running.");
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
      setMessage("Choose a PDF file first.");
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      setMessage("Only PDF is allowed.");
      return;
    }

    setUploading(true);
    setMessage("");

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
      setMessage(`Uploaded: ${data.file.fileName}`);
      setSelectedFile(null);
      await loadDocs();
    } catch (err) {
      console.error(err);
      setMessage(`Upload failed: ${(err as Error).message}`);
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
      setMessage("File deleted");
      await loadDocs();
    } catch (err) {
      console.error(err);
      setMessage((err as Error).message || "Delete failed");
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
      setMessage("Renamed");
      await loadDocs();
    } catch (err) {
      console.error(err);
      setMessage((err as Error).message || "Rename failed");
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
      setMessage((err as Error).message || "Download failed");
    }
  };

  const totalSize = useMemo(() => docs.reduce((sum, d) => sum + (d.fileSize || 0), 0), [docs]);

  return (
    <div className="min-h-screen p-6 bg-neutral-900 text-neutral-100">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h1 className="text-2xl font-bold">Document Storage</h1>
            <button onClick={loadDocs} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-sm text-white hover:bg-slate-700">
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
          <p className="text-sm text-neutral-400 mb-3">Store your PDF files in S3 through backend and manage them here.</p>
          <div className="flex flex-wrap gap-3 items-center">
            <input type="file" accept="application/pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)} className="text-sm" />
            <button onClick={onUpload} disabled={!selectedFile || uploading || isLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40">
              <Upload size={16} /> {uploading ? "Uploading..." : "Upload PDF"}
            </button>
          </div>
          {message && <p className="mt-2 text-sm text-yellow-300">{message}</p>}
        </div>

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Saved Files ({docs.length})</h2>
            <span className="text-xs text-neutral-400">Total size: {(totalSize / (1024 * 1024)).toFixed(2)} MB</span>
          </div>

          {isLoading ? (
            <p className="text-sm text-neutral-400">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="text-sm text-neutral-500">No files uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div key={doc._id} className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3">
                  <div className="flex-1 min-w-0">
                    {editId === doc._id ? (
                      <div className="flex items-center gap-2">
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-2 py-1 text-sm" />
                        <button onClick={() => onRename(doc._id, editName)} className="p-1 text-green-300 hover:text-green-200"><Check size={16} /></button>
                        <button onClick={() => { setEditId(null); setEditName(""); }} className="p-1 text-neutral-500 hover:text-neutral-400"><X size={16} /></button>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-sm text-white truncate">{doc.fileName}</p>
                        <p className="text-xs text-neutral-500">{new Date(doc.uploadedAt).toLocaleString()} • {((doc.fileSize || 0) / 1024 / 1024).toFixed(2)} MB</p>
                      </>
                    )}
                  </div>

                  <button onClick={() => downloadDocument(doc)} title="Download" className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"><Download size={16} /></button>
                  <button onClick={() => { setEditId(doc._id); setEditName(doc.fileName); }} title="Rename" className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white"><Pencil size={16} /></button>
                  <button onClick={() => onDelete(doc._id)} title="Delete" className="p-1 rounded hover:bg-red-500/20 text-neutral-400 hover:text-red-300"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}