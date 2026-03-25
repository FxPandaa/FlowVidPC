/**
 * FlowVid Desktop - Toast Notification System
 * In-app toast notifications rendered in the top-right corner.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import "./ToastContainer.css";

export interface ToastData {
  id: string;
  title: string;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast-item ${exiting ? "toast-exit" : ""}`}>
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        <div className="toast-message">{toast.message}</div>
      </div>
      <div className="toast-actions">
        {toast.action && (
          <button
            className="toast-action-btn"
            onClick={() => {
              toast.action!.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button className="toast-close-btn" onClick={() => onDismiss(toast.id)}>
          &times;
        </button>
      </div>
    </div>
  );
}

// Global toast push function — set by ToastContainer on mount
let pushToastFn: ((toast: Omit<ToastData, "id">) => void) | null = null;

export function showToast(toast: Omit<ToastData, "id">): void {
  pushToastFn?.(toast);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idCounter = useRef(0);

  const push = useCallback((toast: Omit<ToastData, "id">) => {
    const id = `toast-${++idCounter.current}-${Date.now()}`;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // max 5 visible
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    pushToastFn = push;
    return () => { pushToastFn = null; };
  }, [push]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>,
    document.body,
  );
}
