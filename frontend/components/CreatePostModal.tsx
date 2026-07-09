"use client";

import React, { useState } from "react";
import { createPost } from "@/lib/api";

interface CreatePostModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePostModal({ onClose, onSuccess }: CreatePostModalProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const clearImage = () => {
    setImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !content.trim() && !image) {
      setError("Please provide a title, content, or an image to post.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      if (title.trim()) formData.append("title", title);
      if (content.trim()) formData.append("content", content);
      if (image) formData.append("image", image);

      await createPost(formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create post.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface border border-outline-variant rounded-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-lowest">
          <h2 className="text-headline-sm font-bold text-on-surface">Post a Bug</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-full hover:bg-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 flex-1 overflow-y-auto flex flex-col gap-4 bg-surface">
          {error && (
            <div className="p-3 bg-error-container/20 text-error rounded-lg text-sm border border-error-container/30">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-label-lg font-bold text-on-surface mb-1">Title</label>
            <input 
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-2 text-body-base text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="E.g., React hydration error in Next.js 14"
            />
          </div>
          
          <div className="flex-1 flex flex-col min-h-[150px]">
            <label className="block text-label-lg font-bold text-on-surface mb-1">Description / Code</label>
            <textarea 
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full flex-1 bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 font-code-block text-code-block text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
              placeholder="Provide details or paste your code snippet here..."
            />
          </div>

          {imagePreview && (
            <div className="relative w-full rounded-lg overflow-hidden border border-outline-variant bg-surface-container-highest">
              <img src={imagePreview} alt="Preview" className="w-full max-h-[300px] object-contain" />
              <button
                type="button"
                onClick={clearImage}
                className="absolute top-2 right-2 p-1 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          )}
          
          <div className="flex justify-between items-center pt-4 border-t border-outline-variant mt-2">
            <div>
              <label className="cursor-pointer text-primary hover:bg-primary-container/20 p-2 rounded-full transition-colors inline-flex items-center justify-center">
                <span className="material-symbols-outlined">image</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            </div>
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-bold text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-6 py-2 rounded-lg font-bold bg-primary text-on-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isSubmitting ? (
                  <span className="material-symbols-outlined animate-spin-slow">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">send</span>
                )}
                Post
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
