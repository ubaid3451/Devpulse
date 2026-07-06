"use client";

import React from "react";
import { Spinner } from "./Spinner";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-dp-primary-container text-dp-on-primary-container hover:opacity-90 active:scale-[0.98] shadow-lg shadow-dp-primary-container/20",
  secondary:
    "bg-dp-surface-container border border-dp-outline-variant text-dp-on-surface hover:bg-dp-surface-high transition-colors",
  ghost:
    "bg-transparent text-dp-on-surface-variant hover:text-dp-on-surface hover:bg-dp-surface-high transition-colors",
  danger:
    "bg-dp-error-container text-dp-error hover:opacity-90 active:scale-[0.98]",
};

const sizeStyles = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
  lg: "py-3 px-6 text-base",
};

export function Button({
  variant = "primary",
  isLoading = false,
  leftIcon,
  rightIcon,
  size = "md",
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-lg font-semibold
        transition-all duration-200
        disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
    >
      {isLoading ? (
        <Spinner size="sm" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      {children}
      {!isLoading && rightIcon && (
        <span className="flex-shrink-0">{rightIcon}</span>
      )}
    </button>
  );
}
