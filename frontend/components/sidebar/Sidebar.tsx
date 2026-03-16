'use client'

import React, { useState } from 'react'
import { LogOut } from 'lucide-react'
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
  X
} from 'lucide-react'
import { useUI } from '@/context/UiContext'

export default function Sidebar() {

  const { openMain } = useUI()

  const [isExpanded, setIsExpanded] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const menuItems = [
    { icon: Search, label: 'Search Chat', color: 'text-purple-400' },
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

        {/* CLOSE BUTTON (mobile only, inside sidebar) */}
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
            onClick={() => {
              openMain()
              setMobileOpen(false)
            }}
            className={`group flex items-center justify-center gap-3 w-full rounded-xl transition-all duration-300 shadow-lg
            bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 hover:scale-[1.02]
            ${isExpanded ? 'h-11 px-4' : 'h-11 w-11'}`}
          >
            <Plus size={20} className="text-white group-hover:rotate-90 transition-transform" />

            <span
              className={`text-sm font-semibold text-white transition-all ${
                isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
              }`}
            >
              New Chat
            </span>
          </button>
        </div>

        {/* MENU ITEMS */}
        <nav className="mt-6 px-3 flex flex-col gap-1">
          {menuItems.map((item, i) => (
            <button
              key={i}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl
              text-neutral-400 hover:text-white
              hover:bg-neutral-900/70 transition-all
              ${!isExpanded ? 'justify-center' : ''}`}
            >
              <item.icon size={20} className={item.color} />

              <span
                className={`text-sm transition-all ${
                  isExpanded ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {item.label}
              </span>
            </button>
          ))}
        </nav>

        {/* DIVIDER */}
        <div className="px-4 my-4">
          <div className="h-px bg-gradient-to-r from-transparent via-neutral-700 to-transparent w-full" />
        </div>

        {/* CHATS */}
        <div className="flex-1 px-3 overflow-y-auto">
          {isExpanded && (
            <p className="text-xs text-neutral-500 px-3 mb-3 uppercase tracking-wider">
              Your Chats
            </p>
          )}

          <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 transition">
            <MessageSquare size={18} className="text-purple-400" />
            {isExpanded && <span className="text-sm">Sample Chat</span>}
          </button>
        </div>
        {/* LOGOUT */}
<div className="p-3 border-t border-neutral-800">
  <button
    onClick={() => {

      // clear auth storage
      localStorage.removeItem("authToken")
      localStorage.removeItem("user")
      localStorage.removeItem("isNewUser")

      // redirect to login
      window.location.href = "/login"

    }}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
    text-red-400 hover:text-white hover:bg-red-500/10 transition-all
    ${!isExpanded ? 'justify-center' : ''}`}
  >
    <LogOut size={20} />

    {isExpanded && (
      <span className="text-sm font-medium">
        Logout
      </span>
    )}
  </button>
</div>


      </aside>
    </>
  )
}
