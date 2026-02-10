import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm",
    secondary: "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 active:bg-gray-100 shadow-sm",
    ghost: "bg-transparent hover:bg-gray-100 text-gray-700",
    danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
  };
  
  const sizes = {
    sm: "h-8 px-3 text-xs rounded-md",
    md: "h-10 px-4 text-sm rounded-lg",
    lg: "h-12 px-6 text-base rounded-xl",
    icon: "h-10 w-10 p-2 flex items-center justify-center rounded-lg",
  };

  return (
    <button 
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none select-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
