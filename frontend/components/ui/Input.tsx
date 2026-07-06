"use client";

import React, { forwardRef, useState } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  showPasswordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, showPasswordToggle, type, className = "", id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const inputType = type === "password" && showPassword ? "text" : type;

    return (
      <div className="space-y-1">
        {label && (
          <label
            htmlFor={id}
            className="block label-caps text-dp-on-surface-variant ml-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={inputType}
            className={`
              w-full bg-dp-surface-lowest border rounded-lg
              px-4 py-2 text-sm text-dp-on-surface placeholder:text-dp-outline
              transition-all duration-200 outline-none
              focus:ring-1 focus:ring-dp-primary focus:border-dp-primary
              ${error ? "border-dp-error focus:ring-dp-error focus:border-dp-error" : "border-dp-outline-variant"}
              ${showPasswordToggle ? "pr-10" : ""}
              ${className}
            `}
            {...props}
          />
          {showPasswordToggle && type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-dp-on-surface-variant hover:text-dp-primary transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span className="material-symbols-outlined text-lg">
                {showPassword ? "visibility_off" : "visibility"}
              </span>
            </button>
          )}
        </div>
        {error && (
          <p className="text-xs text-dp-error ml-1 animate-fade-in-up">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-dp-outline ml-1">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
