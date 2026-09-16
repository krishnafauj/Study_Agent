"use client";

import React from "react";

// Thin custom scrollbar used by the messages container.
export function ScrollbarStyle() {
  return (
    <style>{`
      .custom-scrollbar::-webkit-scrollbar { width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9333ea; }
      .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #3f3f46 transparent; }
    `}</style>
  );
}
