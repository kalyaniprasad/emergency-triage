import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, AlertCircle, BedDouble, CheckCircle2, ExternalLink, HeartPulse, Loader2, LogIn, Plus, ShieldCheck, Trash2, UserCheck, UserRound, Wind, Wrench, XCircle,
} from 'lucide-react';
import type { Capability, Doctor, Hospital, HospitalStatus, Resource } from '../types';
import { api, type HospitalDataDTO, type HospitalRequestInboxItem } from '../lib/api';
import { ALL_FACILITIES, FACILITY_LABEL, SPECIALIST, capability, loadLabel } from '../lib/capability';
import { recordId, recordTime, statusFromTriage } from '../lib/mappers';
import { clamp, cn, timeAgo, uid } from '../lib/util';
import { useNow } from '../hooks/useNow';
import { useHospitals } from '../store/hospitals';
import { useAuth } from '../store/auth';
import { Button, Meter, Pill, Segmented, Stepper, Toggle } from '../components/ui';

const SPECIALTIES = ['Emergency Physician', 'Intensivist', 'Cardiologist', 'Neurologist', 'Trauma Surgeon', 'Burn Specialist', 'Pulmonologist', 'General Surgeon'];
type ResKey = 'beds' | 'icu' | 'ventilators';

export function PortalPage() {
  const { isAuthenticated, registrationNumber, logout } = useAuth();
  const hospitals = useHospitals((s) => s.hospitals);
  const scope = useHospitals((s) => s.scope);
  const loading = useHospitals((s) => s.loading);
  const error = useHospitals((s) => s.error);
  const lastSyncedAt = useHospitals((s) => s.lastSyncedAt);
  const update = useHospitals((s) => s.update);
  const now = useNow(5000);

  const h = hospitals.find((x) => x.registrationNumber && x.registrationNumber === registrationNumber);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <div className="glass rounded-3xl p-8">
          <ShieldCheck size={36} className="mx-auto text-signal" />
          <h1 className="mt-4 font-display text-xl font-semibold">Hospital staff only</h1>
          <p className="mt-2 text-sm text-slate-400">Sign in with your registration number to manage live capacity.</p>
          <Link to="/login" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2 text-sm font-semibold text-slate-950"><LogIn size={15} /> Sign in</Link>
        </div>
      </div>
    );
  }

  if (!h) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <div className="glass rounded-3xl p-8 text-sm text-slate-300">
          {loading || (scope === 'full' && !lastSyncedAt) ? (
            <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading your hospital…</span>
          ) : error ? (
            <span className="inline-flex items-center gap-2 text-red-300"><AlertCircle size={16} /> {error}</span>
          ) : (
            <>No active hospital found for registration number <strong>{registrationNumber}</strong>.
              <div className="mt-4"><Button onClick={logout}>Sign out</Button></div></>
          )}
        </div>
      </div>
    );
  }

  return <Editor h={h} update={update} now={now} error={error} logout={logout} registrationNumber={registrationNumber} />;
}

type Upd = (id: string, note: string, fn: (h: Hospital) => Hospital) => Promise<void>;

function Editor({ h, update, now, error, logout, registrationNumber }: { h: Hospital; update: Upd; now: number; error: string | null; logout: () => void; registrationNumber: string | null }) {
  const upd = (note: string, fn: (x: Hospital) => Hospital) => update(h.id, note, fn);

  const setRes = (key: ResKey, label: string, patch: Partial<Resource>) =>
    upd(`${label} updated`, (x) => {
      const cur = x[key];
      const total = Math.max(0, patch.total ?? cur.total);
      const available = clamp(patch.available ?? cur.available, 0, total);
      return { ...x, [key]: { total, available } };
    });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-5">
      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-500/15 px-4 py-2.5 text-xs text-red-300 ring-1 ring-red-500/30">
          <AlertCircle size={15} className="shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-signal/10 px-4 py-2.5 text-xs text-slate-200 ring-1 ring-inset ring-signal/25">
        <div className="flex items-center gap-2">
          <UserCheck size={16} className="text-signal" />
          <span>Signed in as <strong>{registrationNumber}</strong> · managing <strong>{h.name}</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/" className="inline-flex items-center gap-1 font-semibold text-signal hover:underline"><ExternalLink size={12} /> View on triage console</Link>
          <button onClick={logout} className="text-slate-400 hover:text-white hover:underline">Sign out</button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold">{h.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
              {h.area}{h.phone ? ` · ${h.phone}` : ''}
              <Pill tone="signal">{h.hasOpsData ? `Saved ${timeAgo(h.updatedAt, now)}` : 'No capacity saved yet'}</Pill>
            </div>
          </div>
          <div className="ml-auto">
            <Segmented<HospitalStatus>
              value={h.status}
              onChange={(status) => upd(`Status set to ${status}`, (x) => ({ ...x, status }))}
              options={[
                { value: 'open', label: 'Accepting', tone: 'bg-ok text-slate-950' },
                { value: 'busy', label: 'Busy', tone: 'bg-warn text-slate-950' },
                { value: 'diverting', label: 'Diverting', tone: 'bg-brand text-white' },
              ]}
            />
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">Bed occupancy (general + ICU)</span>
            <span className="text-slate-400">{loadLabel(h.loadPct)} · {h.loadPct}%</span>
          </div>
          <Meter value={h.loadPct} />
          <p className="mt-1.5 text-[11px] text-slate-500">Calculated from your beds, so it always matches what you enter.</p>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card title="Resources" icon={<BedDouble size={16} />}>
            <div className="grid gap-3 sm:grid-cols-2">
              {([['beds', 'General beds', <BedDouble size={16} key="b" />], ['icu', 'ICU beds', <HeartPulse size={16} key="i" />], ['ventilators', 'Ventilators', <Wind size={16} key="v" />]] as const).map(([key, label, icon]) => (
                <ResourceTile key={key} label={label} icon={icon} value={h[key]} onAvail={(n) => setRes(key, label, { available: n })} onTotal={(n) => setRes(key, label, { total: n })} />
              ))}
              <div className="rounded-2xl bg-black/25 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><Wrench size={16} className="text-brand-soft" />Oxygen cylinders</div>
                <div className="mt-3"><Stepper label="oxygen cylinders" value={h.oxygen} max={9999} onChange={(n) => upd(`Oxygen cylinders set to ${n}`, (x) => ({ ...x, oxygen: n }))} /></div>
              </div>
            </div>
          </Card>

          <Card title="Specialist departments" icon={<HeartPulse size={16} />}>
            <p className="mb-3 text-xs text-slate-400">A department is ready when a doctor with that specialisation is on duty. Add or toggle doctors to change it.</p>
            <div className="space-y-2">
              {(Object.keys(SPECIALIST) as Capability[]).map((c) => {
                const r = capability(h, c);
                return (
                  <div key={c} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5">
                    {r.ok ? <CheckCircle2 size={16} className="text-ok" /> : <XCircle size={16} className="text-slate-500" />}
                    <div className="flex-1">
                      <div className="text-sm font-semibold">{FACILITY_LABEL[c]}</div>
                      <div className={cn('text-xs', r.ok ? 'text-ok' : 'text-slate-500')}>{r.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="How patients see you right now" icon={<Activity size={16} />}>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_FACILITIES.map((f) => {
                const r = capability(h, f);
                return (
                  <div key={f} className="flex items-start gap-2 rounded-xl bg-black/25 px-3 py-2">
                    {r.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-brand-soft" />}
                    <div><div className="text-sm font-semibold">{FACILITY_LABEL[f]}</div><div className="text-xs text-slate-400">{r.detail}</div></div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <IncomingRequests />
          <RejectionCard />
          <DoctorsCard h={h} upd={upd} />
          <HistoryCard hospitalId={h.id} version={h.updatedAt} now={now} />
        </div>
      </div>
    </div>
  );
}

function IncomingRequests() {
  const [requests, setRequests] = useState<HospitalRequestInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => api.incomingHospitalRequests().then((rows) => { setRequests(rows); setError(null); }).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load incoming requests.'));
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 7000);
    return () => window.clearInterval(timer);
  }, []);
  const decide = async (item: HospitalRequestInboxItem, accept: boolean) => {
    const reason = accept ? 'Accepted after hospital review.' : window.prompt('Why is this request being rejected?')?.trim();
    if (!reason) return;
    setBusy(item.request_id); setError(null);
    try {
      if (accept) await api.acceptHospitalRequest(item.request_id);
      else await api.rejectHospitalRequest(item.request_id, { reason });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'The request decision failed.'); }
    finally { setBusy(null); }
  };
  return (
    <Card title="Incoming Patient Requests" icon={<HeartPulse size={16} />}>
      {error && <p className="mb-3 text-xs text-brand-soft">{error}</p>}
      {requests === null ? <p className="text-sm text-slate-500">Loading incoming requests…</p>
        : requests.length === 0 ? <p className="text-sm text-slate-500">No pending requests addressed to this hospital.</p>
        : <div className="space-y-3">{requests.map((item) => (
          <div key={item.request_id} className="rounded-2xl bg-black/25 p-3">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.patient_id}</strong><Pill tone={item.severity === 'critical' ? 'bad' : item.severity === 'high' ? 'warn' : 'neutral'}>{item.severity} · {item.urgency_level}</Pill><Pill>{item.status}</Pill></div>
            <p className="mt-1 text-xs text-slate-400">{item.category} · symptoms: {item.symptoms.join(', ') || 'not provided'}</p>
            <p className="mt-1 text-xs text-slate-400">Required: {item.required_resources.join(', ') || 'none'}{item.required_specialists.length ? ` · specialists: ${item.required_specialists.join(', ')}` : ''}</p>
            <p className="mt-1 text-xs text-slate-500">Location: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}{item.estimated_travel_minutes != null ? ` · estimate ${item.estimated_travel_minutes} min` : ''}</p>
            <div className="mt-3 flex gap-2"><Button variant="primary" disabled={busy !== null} onClick={() => void decide(item, true)}>Accept</Button><Button variant="danger" disabled={busy !== null} onClick={() => void decide(item, false)}>Reject</Button></div>
          </div>
        ))}</div>}
    </Card>
  );
}

function RejectionCard() {
  const [allocationId, setAllocationId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const submit = async () => {
    if (!allocationId.trim() || !reason.trim()) { setStatus('Allocation ID and reason are required.'); return; }
    setPending(true); setStatus(null);
    try {
      const response = await api.rejectAllocation(allocationId.trim(), { reason: reason.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) });
      setStatus(`Backend response: ${response.status}${response.hospital_id ? ` · reassigned to ${response.hospital_id}` : ''}`);
      setReason(''); setNotes('');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not reject allocation.');
    } finally { setPending(false); }
  };
  return (
    <Card title="Reject an assigned allocation" icon={<XCircle size={16} />}>
      <p className="mb-3 text-xs text-slate-400">No hospital allocation-list endpoint is available, so enter an allocation ID supplied by the backend. The logged-in hospital JWT determines authorization; do not enter a hospital ID.</p>
      <div className="space-y-2">
        <input value={allocationId} onChange={(e) => setAllocationId(e.target.value)} placeholder="Allocation ID" aria-label="Allocation ID" className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-signal/60" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} placeholder="Reason (required)" aria-label="Rejection reason" className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-signal/60" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Notes (optional)" aria-label="Rejection notes" rows={2} className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-signal/60" />
        <Button variant="danger" disabled={pending} onClick={() => void submit()}><XCircle size={15} />{pending ? 'Rejecting…' : 'Reject allocation'}</Button>
        {status && <p className="text-xs text-slate-300">{status}</p>}
      </div>
    </Card>
  );
}

function Card({ title, icon, children }: { title?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="glass rounded-3xl p-5">
      {title && <h3 className="mb-4 flex items-center gap-2 font-display text-[15px] font-semibold"><span className="text-brand-soft">{icon}</span>{title}</h3>}
      {children}
    </section>
  );
}

function ResourceTile({ label, icon, value, onAvail, onTotal }: { label: string; icon: React.ReactNode; value: Resource; onAvail: (n: number) => void; onTotal: (n: number) => void }) {
  const used = value.total ? Math.round(((value.total - value.available) / value.total) * 100) : 0;
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold"><span className="text-brand-soft">{icon}</span>{label}</div>
      <div className={cn('mt-2 font-display text-3xl font-semibold', value.total > 0 && value.available === 0 && 'text-brand-soft')}>
        {value.available}<span className="text-sm font-medium text-slate-500"> / {value.total}</span>
      </div>
      <Meter value={used} className="my-2" />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><div className="mb-1 text-[11px] text-slate-400">Available</div><Stepper label={`${label} available`} value={value.available} max={value.total} onChange={onAvail} /></div>
        <div><div className="mb-1 text-[11px] text-slate-400">Capacity</div><Stepper label={`${label} capacity`} value={value.total} max={9999} onChange={onTotal} /></div>
      </div>
    </div>
  );
}

function DoctorsCard({ h, upd }: { h: Hospital; upd: (note: string, fn: (h: Hospital) => Hospital) => void }) {
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState(SPECIALTIES[0]);

  /** Keep the doctors_total / doctors_available counts in step with the list. */
  const withCounts = (x: Hospital, doctors: Doctor[]): Hospital => ({
    ...x, doctors, doctorsTotal: doctors.length, doctorsAvailable: doctors.filter((d) => d.onDuty).length,
  });
  const setDoc = (d: Doctor, patch: Partial<Doctor>, note: string) =>
    upd(note, (x) => withCounts(x, x.doctors.map((y) => (y.id === d.id ? { ...y, ...patch } : y))));
  const add = () => {
    if (!name.trim()) return;
    const d: Doctor = { id: uid(), name: name.trim(), specialty, onDuty: true };
    upd(`${d.name} (${d.specialty}) added on duty`, (x) => withCounts(x, [...x.doctors, d]));
    setName('');
  };

  return (
    <Card title={`Doctors · ${h.doctorsAvailable} of ${h.doctorsTotal} available`} icon={<UserRound size={16} />}>
      {h.doctors.length === 0 && <p className="mb-3 text-xs text-slate-500">No individual doctors listed yet. Add them below so specialist departments can be matched.</p>}
      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {h.doctors.map((d) => (
            <motion.div key={d.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3 rounded-xl bg-black/25 px-3 py-2.5">
              <Toggle label={`${d.name} on duty`} on={d.onDuty} onChange={(v) => setDoc(d, { onDuty: v }, `${d.name} marked ${v ? 'on duty' : 'off duty'}`)} />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-sm font-semibold', !d.onDuty && 'text-slate-500')}>{d.name}</div>
                <div className="text-xs text-slate-400">{d.specialty}</div>
              </div>
              <button aria-label={`Remove ${d.name}`} onClick={() => upd(`${d.name} removed`, (x) => withCounts(x, x.doctors.filter((y) => y.id !== d.id)))} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/8 hover:text-brand-soft"><Trash2 size={15} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Doctor name" aria-label="Doctor name"
          className="min-w-32 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-white/10 focus:ring-signal/60" />
        <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Specialty" className="rounded-xl bg-white/6 px-3 py-2 text-sm outline-none ring-1 ring-inset ring-white/10">
          {SPECIALTIES.map((s) => <option key={s} className="bg-panel">{s}</option>)}
        </select>
        <Button variant="primary" onClick={add}><Plus size={15} />Add doctor</Button>
      </div>
    </Card>
  );
}

/** Recent operational records for this hospital, straight from GET /hospitals-data/hospital/{id}/history. */
function HistoryCard({ hospitalId, version, now }: { hospitalId: string; version: number; now: number }) {
  const [rows, setRows] = useState<HospitalDataDTO[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.historyFor(hospitalId, 15)
      .then((r) => { if (live) { setRows(r); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [hospitalId, version]);

  const sorted = useMemo(() => (rows ? [...rows].sort((a, b) => recordTime(b) - recordTime(a)) : []), [rows]);

  return (
    <Card title="Recent records (database)" icon={<Activity size={16} />}>
      {failed && !rows ? <p className="text-sm text-slate-500">Could not load history.</p>
        : rows === null ? <p className="text-sm text-slate-500">Loading…</p>
        : sorted.length === 0 ? <p className="text-sm text-slate-500">No operational records saved yet.</p>
        : (
          <ul className="space-y-2">
            {sorted.slice(0, 8).map((r, i) => (
              <li key={recordId(r) ?? i} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                <span className="flex-1 text-slate-300">
                  {statusFromTriage(r.triage_status)} · beds {r.general_beds_available}/{r.general_beds_total} · ICU {r.icu_beds_available}/{r.icu_beds_total} · vent {r.ventilators_available}/{r.ventilators_total}
                </span>
                <span className="shrink-0 text-xs text-slate-500">{recordTime(r) ? timeAgo(recordTime(r), now) : ''}</span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  );
}
