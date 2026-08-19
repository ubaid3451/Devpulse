"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "@/lib/theme-context";

export default function ThemeModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { theme, setTheme, availableThemes } = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in-up">
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface-container border border-outline-variant/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">palette</span>
            <h2 className="font-bold text-on-surface text-base">Select App Theme</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Options List */}
        <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {availableThemes.map((t) => {
            const isSelected = theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTheme(t.id);
                }}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  isSelected
                    ? "border-primary bg-primary-container/15 ring-1 ring-primary/40 shadow-sm"
                    : "border-outline-variant/40 bg-surface-variant/40 hover:bg-surface-variant/80 hover:border-outline-variant"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-white/10"
                    style={{ backgroundColor: t.preview.bg }}
                  >
                    <span
                      className="material-symbols-outlined text-[20px]"
                      style={{ color: t.preview.primary }}
                    >
                      {t.icon}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-on-surface">{t.name}</span>
                      {isSelected && (
                        <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-primary/20 text-primary uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-on-surface-variant truncate mt-0.5">
                      {t.description}
                    </p>
                  </div>
                </div>

                {/* Color preview dots */}
                <div className="flex items-center gap-1.5 shrink-0 pl-2">
                  <div
                    className="w-4 h-4 rounded-full border border-outline-variant shadow-xs"
                    style={{ backgroundColor: t.preview.bg }}
                    title="Background"
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-outline-variant shadow-xs"
                    style={{ backgroundColor: t.preview.surface }}
                    title="Surface"
                  />
                  <div
                    className="w-4 h-4 rounded-full border border-white/20 shadow-xs"
                    style={{ backgroundColor: t.preview.primary }}
                    title="Primary Accent"
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/30 bg-surface-container-low flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-on-primary hover:brightness-110 active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
