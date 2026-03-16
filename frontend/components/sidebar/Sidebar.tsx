'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { LogOut, Pencil, Trash2, Check, X as XIcon } from 'lucide-react'
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
} from 'lucide-react'

type ChatSession = {
  chatId: string
  title: string
  updatedAt: string
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
  const [isLoadingChats, setIsLoadingChats] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  useEffect(() => {
    fetchChats()
  }, [activeChatId])

  // Listen for optimistic events from the chat page
  useEffect(() => {
    const handleChatOpened = (e: Event) => {
      const { chatId, title } = (e as CustomEvent).detail as ChatSession
      setChats(prev => {
        // Don't duplicate if it's already in the list
        if (prev.some(c => c.chatId === chatId)) return prev
        return [{ chatId, title, updatedAt: new Date().toISOString() }, ...prev]
      })
    }

    const handleTitleUpdated = (e: Event) => {
      const { chatId, title } = (e as CustomEvent).detail as ChatSession
      setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, title } : c))
    }

    window.addEventListener('chatOpened', handleChatOpened)
    window.addEventListener('chatTitleUpdated', handleTitleUpdated)
    return () => {
      window.removeEventListener('chatOpened', handleChatOpened)
      window.removeEventListener('chatTitleUpdated', handleTitleUpdated)
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
        if (chatId === activeChatId) router.push('/')
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const menuItems = [
    { icon: History, label: 'Past Exam History', color: 'text-pink-400' },
    { icon: FileText, label: 'Records', color: 'text-indigo-400' },
    { icon: Lightbulb, label: 'Suggestions & News', color: 'text-orange-400' },
    { icon: User, label: 'Profile Settings', color: 'text-emerald-400' },
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
            onClick={() => { router.push('/'); setMobileOpen(false) }}
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
            <p className="text-xs text-neutral-500 px-3 mb-2 uppercase tracking-wider">
              {searchQuery ? `Results for "${searchQuery}"` : 'Your Chats'}
            </p>
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
            filteredChats.map((chat) => {
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
                      /* ── Inline rename input ── */
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
                      /* ── Normal row ── */
                      <>
                        <Link
                          href={`/chat/${chat.chatId}`}
                          onClick={() => setMobileOpen(false)}
                          className={`flex-1 min-w-0 text-sm truncate ${isActive ? 'text-purple-300' : 'text-neutral-400 group-hover:text-white'}`}
                          title={chat.title}
                        >
                          {chat.title}
                        </Link>

                        {/* Rename + Delete — appear on hover */}
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
            })
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
    </>
  )
}
