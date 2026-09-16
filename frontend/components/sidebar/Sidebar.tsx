'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { LogOut, Pencil, Trash2, Check, X as XIcon, Sparkles } from 'lucide-react'
import {
  Plus,
  ChevronLeft,
  Search,
  History,
  FileText,
  Lightbulb,
  User,
  MessageSquare,
  Menu,
  X,
  Loader2,
  RefreshCw,
  ChevronDown,
  File,
} from 'lucide-react'

type ChatSession = {
  chatId: string
  title: string
  updatedAt: string
  fileId?: string
  folderId?: string
  fileName?: string
}

type FileRecord = {
  _id: string
  fileName: string
  s3Key: string
  uploadedAt: string
  isOwner?: boolean
}

const API_URL = process.env.NEXT_PUBLIC_API_URL

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : ''
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

export default function Sidebar() {
  const params = useParams()
  const router = useRouter()
  const activeChatId = params?.id as string | undefined

  const [isExpanded, setIsExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const [chats, setChats] = useState<ChatSession[]>([])
  const [files, setFiles] = useState<FileRecord[]>([])
  const [isLoadingChats, setIsLoadingChats] = useState(false)
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Fetch all chat sessions for the user
  const fetchChats = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    if (!token) return
    setIsLoadingChats(true)
    try {
      const res = await fetch(`${API_URL}/api/chats`, {
        headers: authHeaders(),
      })
      const data = await res.json()
      if (data.success) setChats(data.chats)
    } catch (err) {
      console.error('Failed to load chats:', err)
    } finally {
      setIsLoadingChats(false)
    }
  }

  // Fetch all files for the user
  const fetchFiles = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    if (!token) return
    setIsLoadingFiles(true)
    try {
      const res = await fetch(`${API_URL}/api/files`, {
        headers: authHeaders(),
      })
      const data = await res.json()
      if (data.files) setFiles(data.files)
    } catch (err) {
      console.error('Failed to load files:', err)
    } finally {
      setIsLoadingFiles(false)
    }
  }

  // Stable refs so event listeners always call the latest fetch functions
  const fetchChatsRef = useRef(fetchChats)
  const fetchFilesRef = useRef(fetchFiles)
  useEffect(() => { fetchChatsRef.current = fetchChats }, [fetchChats])
  useEffect(() => { fetchFilesRef.current = fetchFiles }, [fetchFiles])

  useEffect(() => {
    fetchChats()
    fetchFiles()
  }, [activeChatId])

  // Listen for optimistic events from the chat page
  useEffect(() => {
    const handleChatOpened = (e: Event) => {
      const detail = (e as CustomEvent).detail as ChatSession & { fileId?: string; fileName?: string }
      const { chatId, title, fileId, fileName } = detail

      setChats(prev => {
        if (prev.some(c => c.chatId === chatId)) return prev
        return [{ chatId, title, fileId, updatedAt: new Date().toISOString() }, ...prev]
      })

      // If the chat belongs to a file, make sure the file exists in our list
      // and auto-expand its folder in the sidebar
      if (fileId) {
        setFiles(prev => {
          if (prev.some(f => f._id === fileId)) {
            // File already exists, just expand it
            setExpandedFiles(s => new Set([...s, fileId]))
            return prev
          }
          // File not in list yet (e.g. newly assigned) — add a placeholder and refresh
          setExpandedFiles(s => new Set([...s, fileId]))
          return prev
        })
      }
    }

    const handleTitleUpdated = (e: Event) => {
      const { chatId, title } = (e as CustomEvent).detail as ChatSession
      setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, title } : c))
    }

    const handleFileUpdated = (e: Event) => {
      const { fileId, fileName } = (e as CustomEvent).detail
      setFiles(prev => prev.map(f => f._id === fileId ? { ...f, fileName } : f))
    }

    const handleFileUploaded = (e: Event) => {
      const file = (e as CustomEvent).detail as FileRecord
      setFiles(prev => [file, ...prev])
    }

    // Full refresh triggered when a new chat starts (catches assigned files)
    const handleSidebarRefresh = () => {
      fetchChatsRef.current()
      fetchFilesRef.current()
    }

    window.addEventListener('chatOpened', handleChatOpened)
    window.addEventListener('chatTitleUpdated', handleTitleUpdated)
    window.addEventListener('fileUpdated', handleFileUpdated)
    window.addEventListener('fileUploaded', handleFileUploaded)
    window.addEventListener('sidebarRefresh', handleSidebarRefresh)
    return () => {
      window.removeEventListener('chatOpened', handleChatOpened)
      window.removeEventListener('chatTitleUpdated', handleTitleUpdated)
      window.removeEventListener('fileUpdated', handleFileUpdated)
      window.removeEventListener('fileUploaded', handleFileUploaded)
      window.removeEventListener('sidebarRefresh', handleSidebarRefresh)
    }
  }, [])

  // Focus rename input when it opens
  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  // Filter chats by search query
  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats
    const lower = searchQuery.toLowerCase()
    return chats.filter((c) => c.title.toLowerCase().includes(lower))
  }, [chats, searchQuery])

  // Organize chats by file/folder
  const organizedChats = useMemo(() => {
    const byFileOwner: Record<string, { file: FileRecord; chats: ChatSession[] }> = {}
    const byFileAssigned: Record<string, { file: FileRecord; chats: ChatSession[] }> = {}
    const globalChats: ChatSession[] = []

    // First, initialize all files
    files.forEach((file) => {
      if (file.isOwner !== false) {
        byFileOwner[file._id] = { file, chats: [] }
      } else {
        byFileAssigned[file._id] = { file, chats: [] }
      }
    })

    // Then add chats to their files
    const filteredChats = searchQuery.trim()
      ? chats.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : chats

    filteredChats.forEach((chat) => {
      if (chat.fileId) {
        if (byFileOwner[chat.fileId]) {
          byFileOwner[chat.fileId].chats.push(chat)
        } else if (byFileAssigned[chat.fileId]) {
          byFileAssigned[chat.fileId].chats.push(chat)
        }
      } else {
        globalChats.push(chat)
      }
    })

    return { byFileOwner, byFileAssigned, globalChats }
  }, [chats, files, searchQuery])

  // Toggle file expansion
  const toggleFileExpanded = (fileId: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) newSet.delete(fileId)
      else newSet.add(fileId)
      return newSet
    })
  }

  // ─── Rename ────────────────────────────────────────────────────────────────
  const startRename = (chat: ChatSession) => {
    setRenamingId(chat.chatId)
    setRenameValue(chat.title)
  }

  const submitRename = async (chatId: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) { cancelRename(); return }
    try {
      const res = await fetch(`${API_URL}/api/chat/${chatId}/title`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ title: trimmed }),
      })
      const data = await res.json()
      if (data.success) {
        setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, title: data.title } : c))
      }
    } catch (err) {
      console.error('Rename failed:', err)
    }
    cancelRename()
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameValue('')
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (chatId: string) => {
    if (!confirm('Delete this chat and all its messages?')) return
    try {
      const res = await fetch(`${API_URL}/api/chat/${chatId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      })
      const data = await res.json()
      if (data.success) {
        setChats(prev => prev.filter(c => c.chatId !== chatId))
        // If the deleted chat was active, go home
        if (chatId === activeChatId) router.push('/home')
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  // ─── Section picker modal (choose which section a new chat is about) ─────────
  type ModalSection = {
    _id: string
    title: string
    pageStart: number
    pageEnd: number
    parseStatus?: 'unparsed' | 'parsing' | 'parsed' | 'failed'
    topicsCreated?: number
    mode?: 'assign' | 'see'
  }
  const [sectionModal, setSectionModal] = useState<{ fileId: string; fileName: string } | null>(null)
  const [modalSections, setModalSections] = useState<ModalSection[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  const openSectionModal = async (fileId: string, fileName: string) => {
    setSectionModal({ fileId, fileName })
    setModalSections([])
    setModalLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/access/${fileId}/overview`, { headers: authHeaders() })
      const data = await res.json()
      if (data.success) {
        setModalSections(data.isOwner ? (data.sections || []) : (data.mySections || []))
      }
    } catch (err) {
      console.error('Failed to load sections:', err)
    } finally {
      setModalLoading(false)
    }
  }

  // A section can be chatted with when its pages are parsed (owner) or it was
  // granted in "assign" mode (invited user).
  const isSectionChatReady = (s: ModalSection) =>
    s.mode ? s.mode === 'assign' : s.parseStatus === 'parsed'

  const startSectionChat = (s: ModalSection) => {
    if (!sectionModal || !isSectionChatReady(s)) return
    const newChatId = `chat-${Date.now()}`
    const q = new URLSearchParams({ fileId: sectionModal.fileId, fileName: sectionModal.fileName })
    q.set('sectionId', s._id)
    if (s.title) q.set('sectionTitle', s.title)
    if (s.pageStart) q.set('pageStart', String(s.pageStart))
    if (s.pageEnd) q.set('pageEnd', String(s.pageEnd))
    setSectionModal(null)
    setMobileOpen(false)
    router.push(`/chat/${newChatId}?${q.toString()}`)
  }

  const menuItems = [
    { icon: History, label: 'Past Exam History', color: 'text-pink-400', path: '/history' },
    { icon: FileText, label: 'Records', color: 'text-indigo-400', path: '/records' },
    { icon: Sparkles, label: 'AI Suggestions', color: 'text-purple-400', path: '/suggestions' },
    { icon: User, label: 'Profile Settings', color: 'text-emerald-400', path: '/profile' },
    { icon: FileText, label: 'My Files', color: 'text-cyan-400', path: '/profile/files' },
  ]

  return (
    <>
      {/* MOBILE TOGGLE BUTTON */}
      <button
        onClick={() => setMobileOpen(prev => !prev)}
        className="md:hidden fixed top-4 left-4 z-50 bg-neutral-900 border border-neutral-700 p-2 rounded-lg text-white"
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* BACKDROP */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`
          fixed md:relative
          top-0 left-0 z-40
          h-screen
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          ${isExpanded ? 'w-[260px]' : 'w-[80px]'}
          bg-gradient-to-b from-neutral-950 to-neutral-900
          border-r border-neutral-800
          flex flex-col
          transition-all duration-300
        `}
      >

        {/* CLOSE BUTTON (mobile only) */}
        <div className="md:hidden flex justify-end p-3">
          <button onClick={() => setMobileOpen(false)}>
            <X size={18} className="text-neutral-400 hover:text-white" />
          </button>
        </div>

        {/* DESKTOP EXPAND TOGGLE */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hidden md:block absolute -right-3 top-9 bg-neutral-900 border border-neutral-700 text-neutral-400 hover:text-white p-1 rounded-full backdrop-blur-md"
        >
          <ChevronLeft
            size={14}
            className={`transition-transform duration-300 ${!isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* NEW CHAT */}
        <div className="px-4 mt-2">
          <button
            onClick={() => { router.push('/home'); setMobileOpen(false) }}
            className={`group flex items-center justify-center gap-3 w-full rounded-xl transition-all duration-300 shadow-lg
            bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:scale-[1.02]
            ${isExpanded ? 'h-11 px-4' : 'h-11 w-11'}`}
          >
            <Plus size={20} className="text-white group-hover:rotate-90 transition-transform" />
            <span className={`text-sm font-semibold text-white transition-all ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
              New Chat
            </span>
          </button>
        </div>

        {/* SEARCH */}
        {isExpanded && (
          <div className="mt-4 px-4">
            <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 focus-within:border-purple-500 rounded-xl px-3 py-2 transition-all">
              <Search size={14} className="text-neutral-500 shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="bg-transparent outline-none text-sm text-neutral-300 placeholder-neutral-600 w-full"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X size={13} className="text-neutral-500 hover:text-white" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* MENU ITEMS */}
        <nav className="mt-4 px-3 flex flex-col gap-1">
          {menuItems.map((item, i) => (
            <button
              key={i}
              onClick={() => {
                if (item.path) {
                  router.push(item.path)
                  setMobileOpen(false)
                }
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900/70 transition-all ${!isExpanded ? 'justify-center' : ''}`}
            >
              <item.icon size={20} className={item.color} />
              <span className={`text-sm transition-all ${isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        {/* DIVIDER */}
        <div className="px-4 my-3">
          <div className="h-px bg-gradient-to-r from-transparent via-neutral-700 to-transparent w-full" />
        </div>

        {/* CHAT HISTORY LIST */}
        <div className="flex-1 px-3 overflow-y-auto">
          {isExpanded && (
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-xs text-neutral-500 uppercase tracking-wider">
                {searchQuery ? `Results for "${searchQuery}"` : 'Your Chats'}
              </p>
              <button
                onClick={fetchChats}
                disabled={isLoadingChats}
                className="text-neutral-500 hover:text-purple-400 transition-colors disabled:opacity-50 cursor-not-allowed hover:cursor-pointer"
                title="Refresh chats"
              >
                <RefreshCw size={14} className={`${isLoadingChats ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}

          {isLoadingChats ? (
            <div className={`flex ${isExpanded ? 'justify-start px-3' : 'justify-center'} py-2`}>
              <Loader2 size={16} className="animate-spin text-purple-400 opacity-60" />
            </div>
          ) : filteredChats.length === 0 ? (
            isExpanded && (
              <p className="text-xs text-neutral-600 px-3">
                {searchQuery ? 'No matching chats.' : 'No chats yet.'}
              </p>
            )
          ) : (
            <>
              {/* Global chats (no file context) */}
              {organizedChats.globalChats.length > 0 && (
                <div className="mb-3">
                  {isExpanded && (
                    <p className="text-xs text-neutral-600 px-3 mb-1 uppercase tracking-wider">General</p>
                  )}
                  {organizedChats.globalChats.map((chat) => {
                    const isActive = chat.chatId === activeChatId
                    const isRenaming = renamingId === chat.chatId

                    return (
                      <div
                        key={chat.chatId}
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all mb-0.5
                          ${isActive ? 'bg-purple-600/20 border border-purple-700/40' : 'hover:bg-neutral-900'}
                          ${!isExpanded ? 'justify-center' : ''}
                        `}
                      >
                        <MessageSquare
                          size={16}
                          className={`shrink-0 ${isActive ? 'text-purple-400' : 'text-neutral-500 group-hover:text-purple-400'}`}
                        />

                        {isExpanded && (
                          isRenaming ? (
                            <div className="flex items-center gap-1 flex-1 min-w-0">
                              <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') submitRename(chat.chatId)
                                  if (e.key === 'Escape') cancelRename()
                                }}
                                className="flex-1 min-w-0 bg-neutral-950 border border-purple-500 rounded-lg px-2 py-0.5 text-xs text-white outline-none"
                              />
                              <button onClick={() => submitRename(chat.chatId)} className="text-green-400 hover:text-green-300 shrink-0">
                                <Check size={13} />
                              </button>
                              <button onClick={cancelRename} className="text-neutral-500 hover:text-white shrink-0">
                                <XIcon size={13} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <Link
                                href={`/chat/${chat.chatId}`}
                                onClick={() => setMobileOpen(false)}
                                className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'text-purple-300' : 'text-neutral-400 group-hover:text-white'}`}
                                title={chat.title}
                              >
                                {chat.title}
                              </Link>

                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button
                                  onClick={(e) => { e.preventDefault(); startRename(chat) }}
                                  className="p-1 rounded hover:bg-neutral-700 text-neutral-500 hover:text-purple-400 transition-colors"
                                  title="Rename"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.preventDefault(); handleDelete(chat.chatId) }}
                                  className="p-1 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* My Files */}
              {Object.keys(organizedChats.byFileOwner).length > 0 && isExpanded && (
                <p className="text-xs text-neutral-600 px-3 mt-4 mb-1 uppercase tracking-wider">My Files</p>
              )}
              {Object.entries(organizedChats.byFileOwner).map(([fileId, fileData]) => {
                const isExpanding = expandedFiles.has(fileId)
                const { file, chats: fileChats } = fileData
                return (
                  <div key={fileId} className="mb-2 group">
                    {/* File header */}
                    <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/50 transition-all">
                      <button
                        onClick={() => toggleFileExpanded(fileId)}
                        className="p-0 text-neutral-400 hover:text-white"
                        title="Expand/collapse"
                      >
                        <ChevronDown
                          size={16}
                          className={`shrink-0 transition-transform ${isExpanding ? '' : '-rotate-90'}`}
                        />
                      </button>
                      <File size={14} className="shrink-0 text-cyan-400" />
                      
                      <button
                        onClick={() => {
                          router.push(`/dashboard/${fileId}`)
                          setMobileOpen(false)
                        }}
                        className={`flex-1 text-left text-sm truncate text-neutral-400 hover:text-white transition-colors ${isExpanded ? '' : 'hidden'}`}
                        title={file.fileName}
                      >
                        {file.fileName}
                      </button>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openSectionModal(fileId, file.fileName)
                          }}
                          className="p-1.5 rounded hover:bg-purple-600/20 text-neutral-400 hover:text-purple-400 transition-colors"
                          title="New chat in a section"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {isExpanding && isExpanded && (
                      <div className="ml-4 border-l border-neutral-700/50 pl-2">
                        {fileChats.length === 0 ? (
                          <p className="text-xs text-neutral-600 px-2 py-1.5">No chats yet</p>
                        ) : (
                          fileChats.map((chat) => {
                            const isActive = chat.chatId === activeChatId
                            const isRenaming = renamingId === chat.chatId
                            return (
                              <div
                                key={chat.chatId}
                                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all mb-0.5
                                  ${isActive ? 'bg-purple-600/20 border border-purple-700/40' : 'hover:bg-neutral-900/50'}
                                `}
                              >
                                <MessageSquare
                                  size={14}
                                  className={`shrink-0 ${isActive ? 'text-purple-400' : 'text-neutral-600 group-hover:text-purple-400'}`}
                                />
                                {isRenaming ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                      ref={renameInputRef}
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') submitRename(chat.chatId)
                                        if (e.key === 'Escape') cancelRename()
                                      }}
                                      className="flex-1 min-w-0 bg-neutral-950 border border-purple-500 rounded-lg px-2 py-0.5 text-xs text-white outline-none"
                                    />
                                    <button onClick={() => submitRename(chat.chatId)} className="text-green-400 hover:text-green-300 shrink-0">
                                      <Check size={13} />
                                    </button>
                                    <button onClick={cancelRename} className="text-neutral-500 hover:text-white shrink-0">
                                      <XIcon size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <Link
                                      href={`/chat/${chat.chatId}?fileId=${file._id}&fileName=${encodeURIComponent(file.fileName)}`}
                                      onClick={() => setMobileOpen(false)}
                                      className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'text-purple-300' : 'text-neutral-500 group-hover:text-white'}`}
                                      title={chat.title}
                                    >
                                      {chat.title}
                                    </Link>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button
                                        onClick={(e) => { e.preventDefault(); startRename(chat) }}
                                        className="p-1 rounded hover:bg-neutral-700 text-neutral-600 hover:text-purple-400 transition-colors"
                                        title="Rename"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(chat.chatId) }}
                                        className="p-1 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Assigned to Me */}
              {Object.keys(organizedChats.byFileAssigned).length > 0 && isExpanded && (
                <p className="text-xs text-neutral-600 px-3 mt-4 mb-1 uppercase tracking-wider">Assigned to Me</p>
              )}
              {Object.entries(organizedChats.byFileAssigned).map(([fileId, fileData]) => {
                const isExpanding = expandedFiles.has(fileId)
                const { file, chats: fileChats } = fileData
                return (
                  <div key={fileId} className="mb-2 group">
                    <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-neutral-800/50 transition-all">
                      <button
                        onClick={() => toggleFileExpanded(fileId)}
                        className="p-0 text-neutral-400 hover:text-white"
                        title="Expand/collapse"
                      >
                        <ChevronDown
                          size={16}
                          className={`shrink-0 transition-transform ${isExpanding ? '' : '-rotate-90'}`}
                        />
                      </button>
                      <File size={14} className="shrink-0 text-orange-400" />
                      
                      <button
                        onClick={() => {
                          router.push(`/dashboard/${fileId}`)
                          setMobileOpen(false)
                        }}
                        className={`flex-1 text-left text-sm truncate text-neutral-400 hover:text-white transition-colors ${isExpanded ? '' : 'hidden'}`}
                        title={file.fileName}
                      >
                        {file.fileName}
                      </button>

                      {/* No delete option for assigned files */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openSectionModal(fileId, file.fileName)
                          }}
                          className="p-1.5 rounded hover:bg-purple-600/20 text-neutral-400 hover:text-purple-400 transition-colors"
                          title="New chat in a section"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {isExpanding && isExpanded && (
                      <div className="ml-4 border-l border-neutral-700/50 pl-2">
                        {fileChats.length === 0 ? (
                          <p className="text-xs text-neutral-600 px-2 py-1.5">No chats yet</p>
                        ) : (
                          fileChats.map((chat) => {
                            const isActive = chat.chatId === activeChatId
                            const isRenaming = renamingId === chat.chatId
                            return (
                              <div
                                key={chat.chatId}
                                className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all mb-0.5
                                  ${isActive ? 'bg-purple-600/20 border border-purple-700/40' : 'hover:bg-neutral-900/50'}
                                `}
                              >
                                <MessageSquare
                                  size={14}
                                  className={`shrink-0 ${isActive ? 'text-purple-400' : 'text-neutral-600 group-hover:text-purple-400'}`}
                                />
                                {isRenaming ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                      ref={renameInputRef}
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') submitRename(chat.chatId)
                                        if (e.key === 'Escape') cancelRename()
                                      }}
                                      className="flex-1 min-w-0 bg-neutral-950 border border-purple-500 rounded-lg px-2 py-0.5 text-xs text-white outline-none"
                                    />
                                    <button onClick={() => submitRename(chat.chatId)} className="text-green-400 hover:text-green-300 shrink-0">
                                      <Check size={13} />
                                    </button>
                                    <button onClick={cancelRename} className="text-neutral-500 hover:text-white shrink-0">
                                      <XIcon size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <Link
                                      href={`/chat/${chat.chatId}?fileId=${file._id}&fileName=${encodeURIComponent(file.fileName)}`}
                                      onClick={() => setMobileOpen(false)}
                                      className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'text-purple-300' : 'text-neutral-500 group-hover:text-white'}`}
                                      title={chat.title}
                                    >
                                      {chat.title}
                                    </Link>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button
                                        onClick={(e) => { e.preventDefault(); startRename(chat) }}
                                        className="p-1 rounded hover:bg-neutral-700 text-neutral-600 hover:text-purple-400 transition-colors"
                                        title="Rename"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={(e) => { e.preventDefault(); handleDelete(chat.chatId) }}
                                        className="p-1 rounded hover:bg-red-500/20 text-neutral-600 hover:text-red-400 transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* LOGOUT */}
        <div className="p-3 border-t border-neutral-800">
          <button
            onClick={() => {
              localStorage.removeItem('authToken')
              localStorage.removeItem('user')
              localStorage.removeItem('isNewUser')
              window.location.href = '/login'
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-white hover:bg-red-500/10 transition-all ${!isExpanded ? 'justify-center' : ''}`}
          >
            <LogOut size={20} />
            {isExpanded && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>

      </aside>

      {/* SECTION PICKER MODAL */}
      {sectionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSectionModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-white font-semibold">Start a chat in a section</h3>
              <button onClick={() => setSectionModal(null)} className="text-neutral-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-500 truncate">{sectionModal.fileName}</p>

            {modalLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-purple-400" size={22} />
              </div>
            ) : modalSections.length === 0 ? (
              <div className="py-6 text-center text-sm text-neutral-500">
                No sections yet. Create sections from Manage Access to chat about them.
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {modalSections.map((s) => {
                  const ready = isSectionChatReady(s)
                  const label = s.mode
                    ? (s.mode === 'assign' ? 'Assigned' : 'View only')
                    : s.parseStatus === 'parsed'
                      ? (s.topicsCreated ? `${s.topicsCreated} topics` : 'Ready')
                      : s.parseStatus === 'parsing'
                        ? 'Parsing…'
                        : s.parseStatus === 'failed'
                          ? 'Failed'
                          : 'Not parsed'
                  return (
                    <button
                      key={s._id}
                      onClick={() => startSectionChat(s)}
                      disabled={!ready}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        ready
                          ? 'border-neutral-700 bg-neutral-950 hover:border-purple-500 hover:bg-neutral-800 cursor-pointer'
                          : 'border-neutral-800 bg-neutral-950/50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">{s.title}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                            ready ? 'bg-emerald-950 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">Pages {s.pageStart}–{s.pageEnd}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
