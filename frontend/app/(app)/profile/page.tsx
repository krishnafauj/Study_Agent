"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, Trash2, Pencil, Check, X, Upload, RefreshCw, UserPlus, User as UserIcon, FileText, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

type UserProfile = {
  name?: string;
  email?: string;
  profilePicture?: string;
};

const authHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function ProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");

  const [assignModalFile, setAssignModalFile] = useState<DocRecord | null>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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
    try {
      const userStr = localStorage.getItem("user");
      if (userStr) {
        setUserProfile(JSON.parse(userStr));
      }
    } catch (e) {
      console.error("Failed to parse user profile from local storage", e);
    }
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
      window.dispatchEvent(new CustomEvent("fileUploaded", { detail: data.file }));
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
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const myDocs = docs.filter(d => d.isOwner !== false);
  const assignedDocs = docs.filter(d => d.isOwner === false);
  const totalSize = useMemo(() => myDocs.reduce((sum, d) => sum + (d.fileSize || 0), 0), [myDocs]);

  return (
    <div className="h-screen overflow-y-auto bg-black p-4 sm:p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Profile Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">My Profile</h1>
            <p className="text-gray-400">Manage your account and uploaded PDFs</p>
          </div>
          <button
            onClick={loadDocs}
            disabled={isLoading}
            className="p-3 bg-gray-900 hover:bg-gray-800 text-white rounded-full transition-colors"
            title="Refresh Files"
          >
            <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Profile Card */}
        {userProfile && (
          <div className="rounded-xl border border-gray-800 bg-gradient-to-br from-gray-950 to-gray-900 p-6 sm:p-8 flex items-center gap-6 shadow-xl">
            {userProfile.profilePicture ? (
              <img 
                src={userProfile.profilePicture} 
                alt="Profile" 
                className="w-20 h-20 rounded-full border-2 border-purple-500 shadow-lg object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                }} 
              />
            ) : null}
            <div className={`w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center border-2 border-purple-500 ${userProfile.profilePicture ? 'hidden' : ''}`}>
              <UserIcon size={40} className="text-gray-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{userProfile.name || "Student"}</h2>
              <p className="text-gray-400 mt-1">{userProfile.email || "No email linked"}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-3 py-1 bg-purple-900/30 text-purple-400 border border-purple-800/50 rounded-full text-xs font-medium">
                  {myDocs.length} PDFs Uploaded
                </span>
                {assignedDocs.length > 0 && (
                  <span className="px-3 py-1 bg-teal-900/30 text-teal-400 border border-teal-800/50 rounded-full text-xs font-medium">
                    {assignedDocs.length} Assigned to you
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* My PDFs Section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2">
              <FileText className="text-purple-400" />
              My PDFs
            </h2>
            <span className="text-sm text-gray-400">{(totalSize / 1024 / 1024).toFixed(2)} MB used</span>
          </div>

          {isLoading && docs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Loading your documents...</div>
          ) : myDocs.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-950 p-12 text-center">
              <p className="text-gray-400">You haven't uploaded any PDFs yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="rounded-lg border border-gray-800 bg-gray-950 p-4 hover:border-purple-500/50 transition-all flex items-center justify-between gap-3 shadow-sm"
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
                        className="flex-1 px-3 py-2 bg-gray-900 border border-purple-500/50 rounded-lg text-white text-sm focus:outline-none"
                      />
                      <button onClick={() => onRename(doc._id, editName)} className="p-2 text-green-500 hover:text-green-400 transition-colors bg-green-500/10 rounded">
                        <Check size={18} />
                      </button>
                      <button onClick={() => { setEditId(null); setEditName(""); }} className="p-2 text-gray-500 hover:text-gray-300 transition-colors bg-gray-800 rounded">
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-900/20 flex items-center justify-center shrink-0">
                        <FileText className="text-purple-400" size={20} />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/dashboard/${doc._id}`} className="block text-white font-medium truncate hover:text-purple-400 transition-colors">
                          {doc.fileName}
                        </Link>
                        <p className="text-gray-500 text-xs mt-1">
                          {new Date(doc.uploadedAt).toLocaleDateString()} • {((doc.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                          {doc.assignedTo && doc.assignedTo.length > 0 && (
                            <span className="ml-2 text-teal-400">• Shared with {doc.assignedTo.length} users</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                  {editId !== doc._id && (
                    <div className="flex items-center gap-1 sm:gap-2">
                      <button
                        onClick={() => setAssignModalFile(doc)}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-900/20 text-teal-400 hover:bg-teal-900/40 transition-colors text-sm font-medium"
                        title="Share / Assign"
                      >
                        <UserPlus size={16} />
                        <span className="hidden sm:inline">Assign</span>
                      </button>
                      <button
                        onClick={() => downloadDocument(doc)}
                        className="p-2 rounded-lg bg-gray-900 text-gray-400 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      <button
                        onClick={() => {
                          setEditId(doc._id);
                          setEditName(doc.fileName);
                        }}
                        className="p-2 rounded-lg bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                        title="Rename"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => onDelete(doc._id)}
                        className="p-2 rounded-lg bg-red-900/10 text-red-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
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

        {/* Assigned PDFs Section */}
        {assignedDocs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold text-white flex items-center gap-2 mb-4">
              <Share2 className="text-teal-400" />
              Assigned to Me
            </h2>
            <div className="space-y-3">
              {assignedDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="rounded-lg border border-teal-900/30 bg-gray-950 p-4 hover:border-teal-500/50 transition-all flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex-1 min-w-0 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-teal-900/20 flex items-center justify-center shrink-0">
                      <Share2 className="text-teal-400" size={20} />
                    </div>
                    <div className="min-w-0">
                      <Link href={`/dashboard/${doc._id}`} className="block text-white font-medium truncate hover:text-teal-400 transition-colors">
                        {doc.fileName}
                      </Link>
                      <p className="text-gray-500 text-xs mt-1">
                        Added {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div>
                    <span className="px-3 py-1 bg-teal-900/20 text-teal-400 border border-teal-800/30 rounded-full text-xs font-medium uppercase tracking-wide">
                      View Only
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Assignment Modal */}
      {assignModalFile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-white">Share / Assign PDF</h3>
              <button onClick={() => setAssignModalFile(null)} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-gray-400 text-sm mb-4">
              Assign <strong className="text-white">{assignModalFile.fileName}</strong> to another user. 
              They will receive an email and can chat with the PDF topics (but cannot view the raw file). 
              <br/><br/>
              <span className="text-xs text-teal-400 bg-teal-900/20 px-2 py-1 rounded inline-block">Tip: You can add multiple emails separated by commas or spaces.</span>
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <input
                type="text"
                placeholder="user1@email.com, user2@email.com"
                value={assignEmail}
                onChange={e => setAssignEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAssign()}
                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-teal-500 text-sm"
              />
              <button 
                onClick={handleAssign}
                disabled={isAssigning || !assignEmail.trim()}
                className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {isAssigning ? "Assigning..." : "Assign"}
              </button>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-300 mb-2">Assigned Users</h4>
              {(!assignModalFile.assignedTo || assignModalFile.assignedTo.length === 0) ? (
                <p className="text-xs text-gray-500 p-3 bg-gray-950 rounded border border-gray-800">Not assigned to anyone yet.</p>
              ) : (
                <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {assignModalFile.assignedTo.map(email => (
                    <li key={email} className="flex items-center justify-between bg-gray-950 px-3 py-2 rounded-lg border border-gray-800">
                      <span className="text-sm text-gray-300 font-medium">{email}</span>
                      <button 
                        onClick={() => handleRevoke(email)}
                        className="text-xs px-2 py-1 bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 rounded transition-colors"
                      >
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
