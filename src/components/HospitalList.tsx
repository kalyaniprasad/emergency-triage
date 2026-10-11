import { useDeferredValue, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Phone, Search, SearchX, TriangleAlert, X } from 'lucide-react';
import type { FacilityKey, RankedHospital } from '../types';
import { FACILITY_LABEL, capability, loadLabel } from '../lib/capability';
import { cn } from '../lib/util';
import { Button, Meter, Pill } from './ui';

const FILTERS: FacilityKey[] = ['icu', 'trauma', 'cardiac', 'neuro', 'burn'];
type Sort = 'best' | 'nearest' | 'load';

interface Props {
  ranked: RankedHospital[];
  required: FacilityKey[];
  triageActive: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRequest: (hospital: RankedHospital) => void;
}

export function HospitalList({ ranked, required, triageActive, selectedId, onSelect, onRequest }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FacilityKey[]>([]);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('best');
  const q = useDeferredValue(query.trim().toLowerCase());

  const rows = useMemo(() => {
    const list = ranked.filter((r) => {
      const h = r.hospital;
      if (openOnly && h.status === 'diverting') return false;
      if (filters.some((f) => !capability(h, f).ok)) return false;
      if (!q) return true;
      const hay = [h.name, h.area, ...h.doctors.map((d) => `${d.name} ${d.specialty}`), ...FILTERS.filter((f) => capability(h, f).ok).map((f) => FACILITY_LABEL[f])].join(' ').toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
    if (sort === 'nearest') return [...list].sort((a, b) => a.distanceKm - b.distanceKm);
    if (sort === 'load') return [...list].sort((a, b) => a.hospital.loadPct - b.hospital.loadPct);
    return list;
  }, [ranked, q, filters, openOnly, sort]);

  const toggle = (f: FacilityKey) => setFilters((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));

  return (
    <section className="glass flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl" aria-label="Hospitals">
      <div className="space-y-3 border-b border-white/8 p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold">Hospitals</h2>
          <Pill tone="neutral">{rows.length} of {ranked.length}</Pill>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort hospitals"
            className="ml-auto rounded-xl bg-white/6 px-3 py-1.5 text-xs font-semibold text-slate-200 ring-1 ring-inset ring-white/10 outline-none">
            <option value="best" className="bg-panel">{triageActive ? 'Best match' : 'Default order'}</option>
            <option value="nearest" className="bg-panel">Nearest first</option>
            <option value="load" className="bg-panel">Lowest load</option>
          </select>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by hospital, area, specialist or facility"
            className="w-full rounded-xl bg-black/30 py-2.5 pl-10 pr-9 text-sm outline-none ring-1 ring-inset ring-white/10 placeholder:text-slate-500 focus:ring-signal/60" aria-label="Search hospitals" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"><X size={15} /></button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => toggle(f)} aria-pressed={filters.includes(f)}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition', filters.includes(f) ? 'bg-signal/20 text-signal ring-signal/50' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10')}>
              {FACILITY_LABEL[f]}
            </button>
          ))}
          <button onClick={() => setOpenOnly((v) => !v)} aria-pressed={openOnly}
            className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition', openOnly ? 'bg-ok/20 text-ok ring-ok/50' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10')}>
            Accepting patients
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        <AnimatePresence mode="popLayout" initial={false}>
          {rows.map((r) => (
            <HospitalCard key={r.hospital.id} r={r} required={required} triageActive={triageActive} isBest={triageActive && ranked[0]?.hospital.id === r.hospital.id && r.suitable}
              open={selectedId === r.hospital.id} onToggle={() => onSelect(selectedId === r.hospital.id ? null : r.hospital.id)} onRequest={onRequest} />
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <div className="grid place-items-center gap-2 py-12 text-center text-sm text-slate-400">
            <SearchX size={28} />
            <div>No hospitals match these filters.</div>
            <button className="text-signal underline-offset-2 hover:underline" onClick={() => { setQuery(''); setFilters([]); setOpenOnly(false); }}>Clear search and filters</button>
          </div>
        )}
      </div>
    </section>
  );
}

function HospitalCard({ r, required, triageActive, isBest, open, onToggle, onRequest }: { r: RankedHospital; required: FacilityKey[]; triageActive: boolean; isBest: boolean; open: boolean; onToggle: () => void; onRequest: (hospital: RankedHospital) => void }) {
  const h = r.hospital;
  const onDuty = h.doctors.filter((d) => d.onDuty);
  const statusTone = h.status === 'open' ? 'ok' : h.status === 'busy' ? 'warn' : 'bad';
  const shown: FacilityKey[] = triageActive ? required : FILTERS.filter((f) => capability(h, f).ok);

  return (
    <motion.article layout="position" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className={cn('rounded-2xl ring-1 ring-inset transition-colors', isBest ? 'bg-signal/8 ring-signal/45' : open ? 'bg-white/7 ring-white/20' : 'bg-white/4 ring-white/8 hover:bg-white/6')}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] font-semibold">{h.name}</h3>
            {isBest && <Pill tone="signal">Best match</Pill>}
            <Pill tone={statusTone}>{h.status === 'open' ? 'Accepting' : h.status === 'busy' ? 'Busy' : 'Diverting'}</Pill>
          </div>
          <div className="mt-0.5 text-xs text-slate-400">{h.area} · {onDuty.length} doctors on duty</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {shown.map((f) => {
              const c = capability(h, f);
              return <Pill key={f} tone={triageActive ? (c.ok ? 'ok' : 'bad') : 'neutral'}>{triageActive && (c.ok ? <Check size={11} /> : <X size={11} />)}{FACILITY_LABEL[f]}</Pill>;
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Meter value={h.loadPct} className="max-w-48" />
            <span className="text-xs text-slate-400">{loadLabel(h.loadPct)} load · {h.loadPct}%</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-2xl font-semibold leading-none">{r.etaMin}<span className="ml-0.5 text-xs font-medium text-slate-400">min</span></div>
          <div className="mt-1 text-xs text-slate-400">{r.distanceKm.toFixed(1)} km</div>
          <ChevronDown size={16} className={cn('ml-auto mt-2 text-slate-500 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-4 border-t border-white/8 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['Beds', h.beds], ['ICU', h.icu], ['Ventilators', h.ventilators], ['Doctors', { total: h.doctorsTotal, available: h.doctorsAvailable }]] as const).map(([label, v]) => (
                  <div key={label} className="rounded-xl bg-black/25 p-3">
                    <div className="text-xs text-slate-400">{label}</div>
                    <div className={cn('font-display text-lg font-semibold', v.available === 0 && 'text-brand-soft')}>{v.available}<span className="text-xs font-medium text-slate-500"> / {v.total}</span></div>
                  </div>
                ))}
              </div>
              {r.missing.length > 0 && (
                <div className="space-y-1.5 rounded-xl bg-warn/8 p-3 ring-1 ring-inset ring-warn/25">
                  {r.missing.map((m) => <div key={m.key} className="flex items-center gap-2 text-sm text-warn"><TriangleAlert size={14} />{m.detail}</div>)}
                </div>
              )}
              <div>
                <div className="mb-1.5 text-xs text-slate-400">On duty now</div>
                <div className="flex flex-wrap gap-1.5">
                  {onDuty.length ? onDuty.map((d) => <Pill key={d.id}>{d.name} · {d.specialty}</Pill>) : <span className="text-sm text-slate-500">No doctors marked on duty</span>}
                </div>
              </div>
              {h.phone && <a href={`tel:${h.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3.5 py-2 text-sm font-semibold ring-1 ring-inset ring-white/10 hover:bg-white/10"><Phone size={15} />{h.phone}</a>}
              {triageActive && r.suitable && h.status !== 'diverting' && (
                <Button variant="primary" onClick={() => onRequest(r)}>Request This Hospital</Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
