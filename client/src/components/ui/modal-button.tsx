"use client";

import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "white"
  | "destructive"
  | "warning"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Keep the button focusable while disabled (Base UI behavior). */
  focusableWhenDisabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Animate the left icon on hover. */
  leftIconMotion?: "trash" | "mail";
  /** Animate the right icon on hover. */
  rightIconMotion?: "arrow" | "download";
}

const base =
  "wensity-button relative inline-flex shrink-0 transform-gpu items-center justify-center gap-2 whitespace-nowrap rounded-[var(--primitive-radius-control,0.875rem)] shadow-none " +
  "text-sm font-medium select-none touch-manipulation " +
  "transition-[background-color,border-color,color,opacity,transform] duration-200 ease-[var(--primitive-ease,cubic-bezier(0.23,1,0.32,1))] motion-reduce:transition-[background-color,border-color,color,opacity] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primitive-ring,rgba(255,255,255,0.45))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background,#111214)] " +
  "disabled:pointer-events-none disabled:opacity-45 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const pressable =
  "active:scale-[0.97] active:duration-100 motion-reduce:active:scale-100 disabled:active:scale-100 data-[disabled]:active:scale-100";

const variants: Record<ButtonVariant, string> = {
  default: cn(
    pressable,
    "border border-white/15 bg-[color:var(--primary,#ededed)] text-[color:var(--primary-foreground,#0a0a0a)] " +
      "hover:bg-white/85 active:bg-white/75"
  ),
  secondary: cn(
    pressable,
    "border border-white/10 bg-white/[0.06] text-gray-100 " +
      "hover:border-white/15 hover:bg-white/10 active:bg-white/15"
  ),
  outline: cn(
    pressable,
    "border border-white/15 bg-transparent text-gray-100 " +
      "hover:border-white/25 hover:bg-white/5 active:bg-white/10"
  ),
  ghost: cn(
    pressable,
    "border border-transparent bg-transparent text-gray-400 " +
      "hover:border-white/10 hover:bg-white/5 hover:text-gray-100 active:bg-white/10"
  ),
  white: cn(
    pressable,
    "border border-white/15 bg-[#ededed] text-[#0a0a0a] " +
      "hover:bg-white/85 active:bg-white/75"
  ),
  destructive: cn(
    pressable,
    "border border-red-400/30 bg-[#e2162a] text-white " +
      "hover:bg-[#ff3b4e] active:bg-[#c51223]"
  ),
  warning: cn(
    pressable,
    "border border-amber-300/30 bg-[#ff9300] text-[#0a0a0a] " +
      "hover:bg-[#ffa726] active:bg-[#d27504]"
  ),
  link:
    "h-auto border border-transparent bg-transparent px-0 font-medium text-gray-100 underline-offset-4 " +
    "hover:text-gray-300 hover:underline active:scale-100",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4",
  lg: "h-10 gap-2 px-5 text-[15px]",
  icon: "h-9 w-9 gap-0 p-0",
};

const ICON_SHELL = "relative z-10 inline-flex shrink-0";

const ICON_MOTION_SHELL =
  "btn-icon-motion inline-flex shrink-0 origin-center transform-gpu";

const leftIconMotionClass = {
  trash: cn(ICON_MOTION_SHELL, "btn-icon-motion--trash"),
  mail: cn(ICON_MOTION_SHELL, "btn-icon-motion--mail"),
} as const;

const rightIconMotionClass = {
  arrow: cn(ICON_MOTION_SHELL, "btn-icon-motion--arrow"),
  download: cn(ICON_MOTION_SHELL, "btn-icon-motion--download"),
} as const;

const BUTTON_ICON_KEYFRAMES_ID = "button-icon-keyframes";

function ensureButtonIconKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(BUTTON_ICON_KEYFRAMES_ID)) return;

  const style = document.createElement("style");
  style.id = BUTTON_ICON_KEYFRAMES_ID;
  style.textContent = `
    @keyframes button-trash-shake {
      0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
      24% { transform: translate3d(-0.5px, -1px, 0) rotate(-4deg); }
      48% { transform: translate3d(0.5px, -1px, 0) rotate(3deg); }
      72% { transform: translate3d(-0.25px, -0.5px, 0) rotate(-1.5deg); }
    }
    @keyframes button-mail-lift {
      0% { transform: translate3d(0, 0, 0) rotate(0deg); }
      46% { transform: translate3d(2px, -2px, 0) rotate(-5deg); }
      100% { transform: translate3d(0, 0, 0) rotate(0deg); }
    }
    @keyframes button-download-tick {
      0%, 100% { transform: translate3d(0, 0, 0); }
      46% { transform: translate3d(0, 2.5px, 0); }
    }
    .btn-icon-motion--arrow {
      transition: transform 160ms var(--primitive-ease, cubic-bezier(0.23, 1, 0.32, 1));
    }
    @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
      .wensity-button:hover .btn-icon-motion--trash {
        animation: button-trash-shake 340ms var(--primitive-ease, cubic-bezier(0.23, 1, 0.32, 1)) both;
      }
      .wensity-button:hover .btn-icon-motion--mail {
        animation: button-mail-lift 320ms var(--primitive-ease, cubic-bezier(0.23, 1, 0.32, 1)) both;
      }
      .wensity-button:hover .btn-icon-motion--arrow {
        transform: translate3d(2px, 0, 0);
      }
      .wensity-button:active .btn-icon-motion--arrow {
        transform: translate3d(1px, 0, 0);
      }
      .wensity-button:hover .btn-icon-motion--download {
        animation: button-download-tick 300ms var(--primitive-ease, cubic-bezier(0.23, 1, 0.32, 1)) both;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .btn-icon-motion {
        animation: none !important;
        transition: none !important;
        transform: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export function buttonVariants({
  variant = "default",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      asChild = false,
      loading = false,
      disabled = false,
      focusableWhenDisabled,
      leftIcon,
      rightIcon,
      leftIconMotion,
      rightIconMotion,
      children,
      type,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const hasIconMotion = Boolean(leftIconMotion || rightIconMotion);

    React.useLayoutEffect(() => {
      if (hasIconMotion) ensureButtonIconKeyframes();
    }, [hasIconMotion]);

    const composedClassName = buttonVariants({
      variant,
      size,
      className: cn(hasIconMotion && "group", className),
    });

    const content = (
      <>
        {loading ? <ButtonSpinner /> : null}
        {!loading && leftIcon ? (
          <span
            className={cn(
              ICON_SHELL,
              leftIconMotion && leftIconMotionClass[leftIconMotion]
            )}
          >
            {leftIcon}
          </span>
        ) : null}
        {size === "icon" && !loading && !leftIcon && !rightIcon ? (
          <span className={cn(ICON_SHELL, "items-center justify-center")}>
            {children}
          </span>
        ) : (
          <span className="relative z-10 inline-flex items-center gap-2">
            {children}
          </span>
        )}
        {!loading && rightIcon ? (
          <span
            className={cn(
              ICON_SHELL,
              rightIconMotion && rightIconMotionClass[rightIconMotion]
            )}
          >
            {rightIcon}
          </span>
        ) : null}
      </>
    );

    if (asChild && React.isValidElement(children)) {
      return (
        <BaseButton
          data-wensity-primitive=""
          ref={ref as React.Ref<HTMLElement>}
          disabled={isDisabled}
          focusableWhenDisabled={focusableWhenDisabled}
          nativeButton={false}
          className={composedClassName}
          aria-busy={loading ? true : undefined}
          data-loading={loading ? "" : undefined}
          render={children as React.ReactElement}
          {...props}
        />
      );
    }

    return (
      <BaseButton
        data-wensity-primitive=""
        ref={ref}
        disabled={isDisabled}
        focusableWhenDisabled={focusableWhenDisabled}
        type={type ?? "button"}
        className={composedClassName}
        aria-busy={loading ? true : undefined}
        data-loading={loading ? "" : undefined}
        {...props}
      >
        {content}
      </BaseButton>
    );
  }
);

Button.displayName = "Button";

function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="relative z-10 size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent opacity-80 motion-safe:animate-spin"
    />
  );
}

// Compatibility wrapper for modal callers migrated to ModalButton
export interface ModalButtonProps
  extends Omit<ButtonProps, "size" | "type" | "variant" | "prefix"> {
  size?: "tiny" | "small" | "medium" | "large";
  type?: "primary" | "secondary" | "tertiary" | "error" | "warning";
  htmlType?: "button" | "submit" | "reset";
  shape?: "square" | "circle" | "rounded";
  svgOnly?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  shadow?: boolean;
  fullWidth?: boolean;
}

const MODAL_VARIANT_MAP: Record<NonNullable<ModalButtonProps["type"]>, ButtonVariant> = {
  primary: "default",
  secondary: "secondary",
  tertiary: "ghost",
  error: "destructive",
  warning: "warning",
};

const MODAL_SIZE_MAP: Record<NonNullable<ModalButtonProps["size"]>, ButtonSize> = {
  tiny: "sm",
  small: "sm",
  medium: "md",
  large: "lg",
};

export const ModalButton = React.forwardRef<HTMLButtonElement, ModalButtonProps>(
  (
    {
      size = "medium",
      type = "primary",
      htmlType = "button",
      shape = "square",
      svgOnly = false,
      prefix,
      suffix,
      shadow: _shadow,
      fullWidth = false,
      className,
      ...rest
    },
    ref
  ) => {
    const mappedSize: ButtonSize = svgOnly ? "icon" : MODAL_SIZE_MAP[size];
    const shapeClass =
      shape === "circle" || shape === "rounded"
        ? "rounded-full"
        : svgOnly && size === "tiny"
          ? "h-7 w-7 rounded-lg"
          : svgOnly && size === "small"
            ? "h-8 w-8 rounded-lg"
            : size === "tiny"
              ? "h-7 px-2.5 text-xs"
              : "";

    return (
      <Button
        ref={ref}
        type={htmlType}
        variant={MODAL_VARIANT_MAP[type]}
        size={mappedSize}
        leftIcon={prefix}
        rightIcon={suffix}
        className={cn(shapeClass, fullWidth && "w-full", className)}
        {...rest}
      />
    );
  }
);

ModalButton.displayName = "ModalButton";
