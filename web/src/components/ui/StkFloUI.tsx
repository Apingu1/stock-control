import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared StkFlo presentation primitives. Style-only components:
 * they do not change API, stock, permissions or modal lifecycle logic.
 */
function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export type StkFloButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type StkFloButtonSize = "sm" | "md";

export interface StkFloButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: StkFloButtonVariant;
  size?: StkFloButtonSize;
}

export function StkFloButton({
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...props
}: StkFloButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={classes("sf-button", "sf-button--" + variant, size === "sm" && "sf-button--sm", className)}
    />
  );
}

export type StkFloBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
export interface StkFloBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StkFloBadgeTone;
}

export function StkFloBadge({ tone = "neutral", className, ...props }: StkFloBadgeProps) {
  return <span {...props} className={classes("sf-badge", "sf-badge--" + tone, className)} />;
}

export type StkFloPanelVariant = "default" | "flat" | "raised" | "subtle";
export interface StkFloPanelProps extends HTMLAttributes<HTMLElement> {
  eyebrow?: ReactNode;
  heading?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  variant?: StkFloPanelVariant;
}

export function StkFloPanel({
  eyebrow,
  heading,
  description,
  actions,
  variant = "default",
  className,
  children,
  ...props
}: StkFloPanelProps) {
  const hasHeader = eyebrow != null || heading != null || description != null || actions != null;
  return (
    <section
      {...props}
      className={classes("sf-surface", variant !== "default" && "sf-surface--" + variant, className)}
    >
      {hasHeader && (
        <div className="sf-panel-header">
          <div className="sf-panel-heading-group">
            {eyebrow != null && <div className="sf-eyebrow">{eyebrow}</div>}
            {heading != null && <div className="sf-panel-heading">{heading}</div>}
            {description != null && <div className="sf-panel-subtitle">{description}</div>}
          </div>
          {actions != null && <div className="sf-panel-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface StkFloFieldProps {
  htmlFor: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function StkFloField({ htmlFor, label, hint, error, children, className }: StkFloFieldProps) {
  return (
    <div className={classes("sf-field", className)}>
      <label className="sf-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint != null && <div className="sf-field-hint">{hint}</div>}
      {error != null && <div className="sf-field-error" role="alert">{error}</div>}
    </div>
  );
}

export function StkFloInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={classes("sf-input", className)} />;
}

export function StkFloSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={classes("sf-select", className)} />;
}

export function StkFloTextarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={classes("sf-textarea", className)} />;
}
