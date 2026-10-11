import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LocateFixed,
  Loader2,
  Stethoscope,
  Building2,
  PlusCircle,
  LogIn,
  LogOut,
  UserCheck,
  Menu,
  X,
  RadioTower,
} from 'lucide-react';
import { useSession, useHospitals } from '../store/hospitals';
import { useAuth } from '../store/auth';
import { useNow } from '../hooks/useNow';
import { cn, timeAgo } from '../lib/util';

export function Header() {
  const { locate, locating, usingGps } = useSession();
  const lastSynced = useHospitals((s) => s.lastSyncedAt);
  const syncError = useHospitals((s) => s.error);
  const { isAuthenticated, registrationNumber, logout } = useAuth();
  const now = useNow(5000);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs md:text-sm font-semibold transition',
      isActive
        ? 'bg-white/12 text-white shadow-sm ring-1 ring-white/15'
        : 'text-slate-400 hover:text-white hover:bg-white/5',
    );

  return (
    <header className="glass-solid sticky top-0 z-30 border-b border-white/8 px-4 py-2.5 md:px-6">
      <div className="flex items-center justify-between gap-3">
        {/* Brand Logo & Title */}
        <Link to="/" className="flex items-center gap-3">
          <div className="relative grid h-9 w-9 md:h-10 md:w-10 place-items-center rounded-xl bg-brand shadow-[0_8px_24px_-6px_rgba(255,59,87,.8)]">
            <svg
              viewBox="0 0 32 32"
              className="h-5 w-5 md:h-6 md:w-6"
              fill="none"
              stroke="white"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path className="ecg-line" d="M3 17h6l3-7 5 13 3-6h8" />
            </svg>
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm md:text-[15px] font-semibold text-white">
              Emergency Triage
            </div>
            <div className="text-[11px] text-slate-400">Right hospital, not just the nearest</div>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-1.5 lg:flex">
          <NavLink to="/" end className={link}>
            <Stethoscope size={15} />
            Triage Console
          </NavLink>
          <NavLink to="/portal" className={link}>
            <Building2 size={15} />
            Hospital Portal
          </NavLink>
          <NavLink to="/dispatch" className={link}>
            <RadioTower size={15} /> Dispatch Center
          </NavLink>
          <NavLink to="/register" className={link}>
            <PlusCircle size={15} className="text-signal" />
            Register Hospital
          </NavLink>
          <NavLink to="/login" className={link}>
            <LogIn size={15} />
            Staff Login
          </NavLink>
        </nav>

        {/* Right Tools & Auth Status */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Active Logged-in Staff Badge */}
          {isAuthenticated ? (
            <div className="hidden items-center gap-2 rounded-xl bg-signal/15 px-3 py-1.5 text-xs text-white ring-1 ring-inset ring-signal/30 xl:flex">
              <UserCheck size={14} className="text-signal" />
              <span className="font-medium truncate max-w-[150px]">
                {registrationNumber ?? 'Signed in'}
              </span>
              <button
                onClick={logout}
                title="Log out"
                className="text-slate-400 hover:text-white"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden items-center gap-1.5 rounded-xl bg-white/6 px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10 hover:bg-white/10 sm:flex"
            >
              <LogIn size={14} className="text-signal" /> Login
            </Link>
          )}

          {/* Live Data Pulse */}
          <div className="hidden items-center gap-2 rounded-full bg-white/6 px-3 py-1.5 text-xs text-slate-300 ring-1 ring-inset ring-white/10 sm:flex">
            <span className={cn('h-2 w-2 rounded-full', syncError ? 'bg-brand' : 'ping bg-ok')} />
            <span className="text-[11px]">{syncError ? 'Sync error' : lastSynced ? `Live sync · ${timeAgo(lastSynced, now)}` : 'Connecting…'}</span>
          </div>

          {/* GPS Location Button */}
          <button
            onClick={locate}
            className="flex items-center gap-1.5 rounded-xl bg-white/6 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-inset ring-white/10 transition hover:bg-white/10"
          >
            {locating ? (
              <Loader2 size={15} className="animate-spin text-signal" />
            ) : (
              <LocateFixed size={15} className={usingGps ? 'text-signal' : ''} />
            )}
            <span className="hidden md:inline">
              {usingGps ? 'GPS Location' : 'Use My GPS'}
            </span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-300 ring-1 ring-white/10 lg:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="mt-3 space-y-1.5 border-t border-white/8 pt-3 lg:hidden">
          <NavLink
            to="/"
            end
            onClick={() => setMobileMenuOpen(false)}
            className={link}
          >
            <Stethoscope size={16} /> Triage Console
          </NavLink>
          <NavLink
            to="/portal"
            onClick={() => setMobileMenuOpen(false)}
            className={link}
          >
            <Building2 size={16} /> Hospital Portal
          </NavLink>
          <NavLink
            to="/dispatch"
            onClick={() => setMobileMenuOpen(false)}
            className={link}
          >
            <RadioTower size={16} /> Dispatch Center
          </NavLink>
          <NavLink
            to="/register"
            onClick={() => setMobileMenuOpen(false)}
            className={link}
          >
            <PlusCircle size={16} className="text-signal" /> Register Hospital
          </NavLink>
          <NavLink
            to="/login"
            onClick={() => setMobileMenuOpen(false)}
            className={link}
          >
            <LogIn size={16} /> Staff Login
          </NavLink>
        </div>
      )}
    </header>
  );
}
