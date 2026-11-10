'use client';
import React, { useEffect, useRef, useId } from 'react';
import { X, ArrowRight, Package, LoaderCircle } from 'lucide-react';
import { AppState, Lang } from '@/lib/types';
export type Env = {
  s: AppState;
  lang: Lang;
  t: (key: string) => string;
  open: (kind: string, data?: any) => void;
  close: () => void;
  refresh: () => Promise<void>;
  act: (path: string, body?: any, method?: string) => Promise<any>;
  toast: (message: string, error?: boolean) => void;
  busy: boolean;
};
export function IconButton({
  children,
  label,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={'badge ' + tone}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Package size={28} />
      </div>
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {action && (
        <button className="btn primary" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control = React.isValidElement(children)
    ? React.cloneElement(
        children as React.ReactElement<{
          'aria-labelledby'?: string;
          'aria-describedby'?: string;
        }>,
        { 'aria-labelledby': id, 'aria-describedby': hint ? id + '-hint' : undefined },
      )
    : children;
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {control}
      {hint && <small id={id + '-hint'}>{hint}</small>}
    </label>
  );
}
export function Submit({
  children,
  busy,
  disabled = false,
}: {
  children: React.ReactNode;
  busy: boolean;
  disabled?: boolean;
}) {
  return (
    <button type="submit" className="btn primary" disabled={busy || disabled}>
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const focus = () => {
      if (!panel.current?.contains(document.activeElement))
        panel.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    };
    const timer = window.setTimeout(focus, 80);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const nodes = panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      old?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className={'modal ' + (wide ? 'wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-heading"
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-heading">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="Fermer" onClick={close}>
            <X size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
