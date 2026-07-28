"use client";

import React, { useState } from "react";
import { toggleBlock } from "@/lib/api";

interface BlockButtonProps {
  username: string;
  isBlockedByMe: boolean;
  onChange: (isBlockedByMe: boolean) => void; // lets the parent update local profile state
}

export default function BlockButton({ username, isBlockedByMe, onChange }: BlockButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = () => {
    if (isBlockedByMe) {
      // Unblocking doesn't need confirmation — only blocking does, since
      // blocking is the more consequential/surprising action.
      doToggle();
    } else {
      setShowConfirm(true);
    }
  };

  const doToggle = async () => {
    setIsProcessing(true);
    setShowConfirm(false);
    try {
      const res = await toggleBlock(username);
      onChange(res.status === "blocked");
    } catch (err) {
      console.error("Failed to toggle block", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isProcessing}
        className={`px-6 py-2 font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 ${
          isBlockedByMe
            ? "bg-error text-on-error hover:brightness-110"
            : "bg-surface-variant text-on-surface hover:bg-surface-container-high"
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">block</span>
        {isBlockedByMe ? "Unblock" : "Block"}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-container-low border border-outline-variant rounded-xl w-full max-w-sm p-lg shadow-2xl">
            <h3 className="text-title-md font-bold text-on-surface mb-2">Block @{username}?</h3>
            <p className="text-body-sm text-on-surface-variant mb-6">
              They won't be able to see your posts, and you won't see theirs. Any existing
              follow relationship between you will be removed. You can unblock them anytime.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg text-on-surface-variant hover:bg-surface-variant/30 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={doToggle}
                className="px-4 py-2 text-sm rounded-lg bg-error text-on-error font-bold hover:brightness-110 transition-colors"
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}