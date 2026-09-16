"use client";

import React from "react";

export function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
        active ? "border-indigo-500 text-white" : "border-transparent text-gray-400 hover:text-white"
      }`}
    >
      {icon} {children}
    </button>
  );
}
