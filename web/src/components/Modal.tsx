'use client';

import { useEffect, type ReactNode } from 'react';

export function Modal({
  open,
  title,
  onClose,
  children,
  labelledBy = 'modal-title',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="card w-full max-w-lg p-5 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={labelledBy} className="text-sm font-medium text-[#e8eaed]">
            {title}
          </h2>
          <button type="button" className="btn px-2 py-1 text-xs" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
