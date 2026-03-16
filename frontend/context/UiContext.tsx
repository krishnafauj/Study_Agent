"use client";
import React, { createContext, useContext, useState, ReactNode } from 'react';

type UIContextType = {
  isDnaOpen: boolean;
  toggleDna: () => void;
  closeDna: () => void;
  openDna: () => void;
  isMainOpen: boolean;
  toggleMain: () => void;
  closeMain: () => void;
  openMain: () => void;
};

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error("useUI must be used within a UIProvider");
  return context;
};

export const UIProvider = ({ children }: { children: ReactNode }) => {
  // Desktop: Default Open. Mobile: Default Closed could be better, but let's stick to True.
  const [isDnaOpen, setIsDnaOpen] = useState(true);
  const [isMainOpen, setIsMainOpen] = useState(true);

  const toggleDna = () => setIsDnaOpen(prev => !prev);
  const closeDna = () => setIsDnaOpen(false);
  const openDna = () => setIsDnaOpen(true);

  const toggleMain = () => setIsMainOpen(prev => !prev);
  const closeMain = () => setIsMainOpen(false);
  const openMain = () => setIsMainOpen(true);

  return (
    <UIContext.Provider value={{ 
      isDnaOpen, toggleDna, closeDna, openDna,
      isMainOpen, toggleMain, closeMain, openMain
    }}>
      {children}
    </UIContext.Provider>
  );
};