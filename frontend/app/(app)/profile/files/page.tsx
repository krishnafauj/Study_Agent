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
      // Emit event for sidebar to update
      window.dispatchEvent(
        new CustomEvent("fileUploaded", { detail: data.file })
      );
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
      // Emit event for sidebar to update
      window.dispatchEvent(
        new CustomEvent("fileUpdated", { detail: { fileId: docId, fileName: newName.trim() } })
      );
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

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      // Empty for now, can add drag-active state later
    } else if (e.type === "dragleave") {
      // Empty for now
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const totalSize = useMemo(() => docs.reduce((sum, d) => sum + (d.fileSize || 0), 0), [docs]);

  return (
    <div className="min-h-screen bg-black p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Document Storage</h1>
          <p className="text-gray-400">Upload and manage your PDF files securely</p>
        </div>

        {/* Upload Section */}
        <div className="mb-8">
          <div className="rounded-xl border border-gray-800 bg-gray-950 p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-white mb-4">Upload New Document</h2>
            
            {/* File Input Area */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer"
            >
              <Upload className="mx-auto mb-3 text-gray-500" size={32} />
              <p className="text-white font-medium mb-1">Drop your PDF here or click to select</p>
              <p className="text-gray-500 text-sm mb-4">PDF files only, up to 100MB</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className="hidden"
                id="file-input"
              />
              <label 
                htmlFor="file-input"
                className="inline-block cursor-pointer"
              >
                <span
                  className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Select File
                </span>
              </label>
            </div>

            {/* Selected File Preview */}
            {selectedFile && (
              <div className="mt-4 p-4 bg-gray-900 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-white font-medium truncate">{selectedFile.name}</p>
                  <p className="text-gray-500 text-sm">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-gray-500 hover:text-red-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={onUpload}
                disabled={!selectedFile || uploading || isLoading}
                className="flex-1 sm:flex-initial px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <Upload size={18} />
                {uploading ? "Uploading..." : "Upload PDF"}
              </button>
              <button
                onClick={loadDocs}
                disabled={isLoading}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {/* Messages */}
            {message && (
              <div className={`mt-4 p-3 rounded-lg ${message.includes("Upload failed") || message.includes("failed") ? "bg-red-900/20 text-red-300" : "bg-green-900/20 text-green-300"}`}>
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Files List Section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Your Files ({docs.length})</h2>
            <span className="text-sm text-gray-400">Total: {(totalSize / 1024 / 1024).toFixed(2)} MB</span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Loading documents...</div>
          ) : docs.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
              <Upload className="mx-auto mb-3 text-gray-600" size={40} />
              <p className="text-gray-400">No files uploaded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <div
                  key={doc._id}
                  className="rounded-lg border border-gray-800 bg-gray-950 p-4 hover:bg-gray-900 transition-colors flex items-center justify-between gap-3"
                >
                  {editId === doc._id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onRename(doc._id, editName);
                          if (e.key === "Escape") {
                            setEditId(null);
                            setEditName("");
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => onRename(doc._id, editName)}
                        className="p-2 text-green-500 hover:text-green-400 transition-colors"
                        title="Save"
                      >
                        <Check size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setEditId(null);
                          setEditName("");
                        }}
                        className="p-2 text-gray-500 hover:text-gray-400 transition-colors"
                        title="Cancel"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{doc.fileName}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(doc.uploadedAt).toLocaleDateString()} • {((doc.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  )}

                  {editId !== doc._id && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadDocument(doc)}
                        className="p-2 text-gray-500 hover:text-blue-400 transition-colors"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setEditId(doc._id);
                          setEditName(doc.fileName);
                        }}
                        className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
                        title="Rename"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => onDelete(doc._id)}
                        className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}