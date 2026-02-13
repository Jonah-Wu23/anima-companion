import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

const statusVariants = cva(
  "absolute bottom-0 right-0 z-10 block h-3 w-3 rounded-full ring-2 ring-white",
  {
    variants: {
      status: {
        online: "bg-success",
        offline: "bg-neutral-400",
        busy: "bg-danger",
        away: "bg-warning",
      },
    },
    defaultVariants: {
      status: "offline",
    },
  }
)

interface AvatarStatusProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof statusVariants> {}

const AvatarStatus = ({ className, status, ...props }: AvatarStatusProps) => {
  return (
    <span className={cn(statusVariants({ status }), className)} {...props} />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarStatus }
