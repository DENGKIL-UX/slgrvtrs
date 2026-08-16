'use client';

import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────

interface SettingsGearProps {
  onPasswordChanged?: () => void;
}

// ── Component ───────────────────────────────────────────────

export default function SettingsGear({ onPasswordChanged }: SettingsGearProps) {
  const [open, setOpen] = useState(false);
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'idle' | 'set' | 'change'>('idle');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch password-is-set on mount
  useEffect(() => {
    fetch('/api/settings/password')
      .then((r) => r.json())
      .then((d) => setIsSet(d.isSet))
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        reset();
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function reset() {
    setMode('idle'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setMsg(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (newPw.length < 6) { setMsg({ type: 'err', text: 'Minimum 6 characters' }); return; }
    if (newPw !== confirmPw) { setMsg({ type: 'err', text: 'Passwords do not match' }); return; }

    setLoading(true);
    try {
      const body: Record<string, string> = { newPassword: newPw };
      if (isSet) body.currentPassword = currentPw;

      const res = await fetch('/api/settings/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setMsg({ type: 'err', text: data.error || 'Failed' });
      } else {
        setIsSet(true);
        setMsg({ type: 'ok', text: isSet ? 'Password updated' : 'Password set' });
        onPasswordChanged?.();
        setTimeout(() => { setOpen(false); reset(); }, 1200);
      }
    } catch {
      setMsg({ type: 'err', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger */}
      <button
        onClick={() => { setOpen(!open); if (open) reset(); }}
        className="p-2 rounded-lg hover:bg-white/60 transition-colors"
        title="Export settings"
        aria-label="Export settings"
      >
        <svg className="w-4 h-4 text-emerald-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {/* Badge dot when no password is set */}
        {isSet === false && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-emerald-600 animate-pulse" />
        )}
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
            <h4 className="text-xs font-semibold text-slate-700">Export Settings</h4>
            <p className="text-[10px] text-slate-400 mt-0.5">Manage CSV download password</p>
          </div>

          {mode === 'idle' && (
            <div className="p-4">
              <p className="text-xs text-slate-600 mb-3">
                {isSet
                  ? 'Password is set. Change it or use it to download CSV exports.'
                  : 'No password set yet. Set one to enable CSV downloads.'}
              </p>
              <button
                onClick={() => setMode(isSet ? 'change' : 'set')}
                className="w-full py-2 text-xs font-medium rounded-lg transition-all bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
              >
                {isSet ? 'Change Password' : 'Set Export Password'}
              </button>
            </div>
          )}

          {(mode === 'set' || mode === 'change') && (
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              {isSet && mode === 'change' && (
                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">Current Password</label>
                  <input
                    type="password" autoFocus={false}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                    placeholder="Enter current password"
                    required
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">New Password</label>
                <input
                  type="password" autoFocus
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                  placeholder="Min 6 characters"
                  required minLength={6}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full h-8 px-3 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                  placeholder="Re-enter new password"
                  required minLength={6}
                />
              </div>

              {msg && (
                <p className={`text-[11px] font-medium ${msg.type === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {msg.text}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('idle'); setMsg(null); }}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                >Cancel</button>
                <button
                  type="submit"
                  disabled={loading || !newPw || newPw !== confirmPw}
                  className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                >{loading ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
