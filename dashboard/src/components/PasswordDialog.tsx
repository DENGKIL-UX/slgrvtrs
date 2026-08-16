'use client';

import { useState, useRef, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────

interface PasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  description: string;
}

// ── Component ───────────────────────────────────────────────

export default function PasswordDialog({ open, onClose, onSubmit, description }: PasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus password input when dialog opens
  useEffect(() => {
    if (open) {
      setPassword('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      await onSubmit(password);
      setPassword('');
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Incorrect password';
      setError(msg);
      // Shake animation
      inputRef.current?.classList.add('animate-shake');
      setTimeout(() => inputRef.current?.classList.remove('animate-shake'), 500);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Password Required</h3>
              <p className="text-[11px] text-slate-400">Enter the export password to download</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 pb-5">
          <p className="text-xs text-slate-500 mb-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            {description}
          </p>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            className={`w-full h-10 px-3 text-sm rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-all ${error ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-200'}`}
            placeholder="Enter export password"
            autoComplete="off"
          />

          {error && (
            <div className="flex items-center gap-1.5 mt-2">
              <svg className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-xs text-rose-600 font-medium">{error}</p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >Cancel</button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 py-2.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <><svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Verifying...</>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download CSV</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
