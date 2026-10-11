import { FormEvent, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, Plus, RefreshCw, Send, Trash2, XCircle } from 'lucide-react';
import { api, type AllocationBatchResponse, type AllocationReplanRequest, type BatchAllocationPatient } from '../lib/api';
import { useSession } from '../store/hospitals';
import { Button, Pill } from '../components/ui';
import { uid } from '../lib/util';

const SYMPTOMS = ['chest_pain', 'breathing', 'bleeding', 'unconscious', 'abdominal', 'head_injury', 'stroke', 'burns', 'trauma', 'seizure', 'fever'] as const;
const VITALS = ['spo2', 'hr', 'sbp', 'dbp', 'rr', 'temp', 'gcs'] as const;
type Draft = Omit<BatchAllocationPatient, 'vitals'> & { vitals: Record<string, number | undefined>; error?: string };

function newPatient(origin: { lat: number; lng: number }): Draft {
  return { patient_id: `patient-${uid()}`, latitude: origin.lat, longitude: origin.lng, symptoms: [], vitals: {}, described_as_severe: false };
}

export function DispatchPage() {
  const origin = useSession((s) => s.origin);
  const [patients, setPatients] = useState<Draft[]>(() => [newPatient(origin)]);
  const [batch, setBatch] = useState<AllocationBatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allocationId, setAllocationId] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [replan, setReplan] = useState({ reason: '', notes: '', latitude: '', longitude: '', travel: '' });

  const update = (index: number, patch: Partial<Draft>) => setPatients((xs) => xs.map((p, i) => i === index ? { ...p, ...patch, error: undefined } : p));
  const validate = (p: Draft) => {
    if (!p.patient_id.trim()) return 'Patient ID is required.';
    if (!Number.isFinite(p.latitude) || p.latitude < -90 || p.latitude > 90 || !Number.isFinite(p.longitude) || p.longitude < -180 || p.longitude > 180) return 'Enter valid latitude and longitude.';
    if (!p.symptoms.length && !Object.values(p.vitals).some((v) => v !== undefined && Number.isFinite(v))) return 'Add at least one symptom or valid vital sign.';
    if (p.age !== undefined && (!Number.isFinite(p.age) || p.age < 0 || p.age > 130)) return 'Age must be between 0 and 130.';
    return null;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errors = patients.map(validate);
    if (patients.length > 50 || errors.some(Boolean)) {
      setPatients((xs) => xs.map((p, i) => ({ ...p, error: errors[i] ?? (patients.length > 50 ? 'Maximum 50 patients per batch.' : undefined) })));
      setMessage('Correct the highlighted patient fields before submitting.');
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const payload = { patients: patients.map(({ error: _error, ...p }) => ({ ...p, symptoms: [...p.symptoms], vitals: Object.fromEntries(Object.entries(p.vitals).filter(([, v]) => v !== undefined && Number.isFinite(v))) })) };
      setBatch(await api.allocateBatch(payload));
      setMessage('Batch allocation response received from the backend.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Batch allocation failed.'); }
    finally { setBusy(false); }
  };
  const action = async (kind: 'replan' | 'cancel' | 'complete') => {
    if (!allocationId.trim()) { setMessage('Enter an allocation ID returned by the backend.'); return; }
    setActionBusy(true); setMessage(null);
    try {
      if (kind === 'cancel') await api.cancelAllocation(allocationId.trim());
      else if (kind === 'complete') await api.completeAllocation(allocationId.trim());
      else {
        if (!replan.reason.trim()) throw new Error('A replan reason is required.');
        const body: AllocationReplanRequest = { reason: replan.reason.trim() };
        if (replan.notes.trim()) body.notes = replan.notes.trim();
        if (replan.latitude) body.latitude = Number(replan.latitude);
        if (replan.longitude) body.longitude = Number(replan.longitude);
        if (replan.travel.trim()) {
          const times: Record<string, number> = {};
          for (const part of replan.travel.split(',')) {
            const [hospital, raw] = part.split('=').map((x) => x.trim());
            const minutes = Number(raw);
            if (!hospital || !Number.isFinite(minutes) || minutes < 0) throw new Error('Travel times must use hospital_id=minutes with non-negative numbers.');
            times[hospital] = minutes;
          }
          body.updated_travel_times = times;
        }
        await api.replanAllocation(allocationId.trim(), body);
      }
      setMessage(`${kind[0].toUpperCase()}${kind.slice(1)} request succeeded.`);
    } catch (err) { setMessage(err instanceof Error ? err.message : `${kind} failed.`); }
    finally { setActionBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-5">
      <section className="glass rounded-3xl p-5">
        <h1 className="font-display text-2xl font-semibold">Dispatch Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Allocate multiple patients through the backendâ€™s clinical triage, resource availability and ML-backed recommendation workflow. This supports decision-making; it is not a diagnosis or proof of hospital acceptance.</p>
        {message && <div className="mt-4 flex items-center gap-2 rounded-xl bg-signal/10 px-3 py-2 text-sm text-signal ring-1 ring-signal/25"><AlertCircle size={15} />{message}</div>}
      </section>

      <form onSubmit={submit} className="space-y-4">
        {patients.map((p, i) => <PatientCard key={p.patient_id} patient={p} index={i} origin={origin} update={update} remove={() => setPatients((xs) => xs.filter((_, n) => n !== i))} />)}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-400">{patients.length} / 50 patients</span>
          <div className="flex gap-2">
            <Button type="button" disabled={patients.length >= 50} onClick={() => setPatients((xs) => [...xs, newPatient(origin)])}><Plus size={15} />Add patient</Button>
            <Button type="button" onClick={() => setPatients([newPatient(origin)])}>Reset</Button>
            <Button type="submit" variant="primary" disabled={busy}><Send size={15} />{busy ? 'Allocatingâ€¦' : 'Allocate batch'}</Button>
          </div>
        </div>
      </form>

      {batch && <BatchResults batch={batch} />}

      <section className="glass rounded-3xl p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><RefreshCw size={17} className="text-signal" />Allocation lifecycle actions</h2>
        <p className="mt-2 text-xs text-slate-400">The current backend batch response does not include allocation IDs and no allocation read endpoint exists. Enter an ID only when your backend returns one through another integration.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-slate-300">Allocation ID<input value={allocationId} onChange={(e) => setAllocationId(e.target.value)} className="field mt-1" placeholder="Backend allocation ID" /></label>
          <label className="text-xs text-slate-300">Replan reason<input value={replan.reason} onChange={(e) => setReplan({ ...replan, reason: e.target.value })} className="field mt-1" /></label>
          <label className="text-xs text-slate-300">Notes<input value={replan.notes} onChange={(e) => setReplan({ ...replan, notes: e.target.value })} className="field mt-1" /></label>
          <label className="text-xs text-slate-300">Travel estimates<input value={replan.travel} onChange={(e) => setReplan({ ...replan, travel: e.target.value })} className="field mt-1" placeholder="hospital-id=18, other-id=24" /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={actionBusy} onClick={() => void action('replan')}><RefreshCw size={14} />Replan</Button>
          <Button variant="danger" disabled={actionBusy} onClick={() => { if (window.confirm('Cancel this active allocation and release its backend reservation?')) void action('cancel'); }}><XCircle size={14} />Cancel</Button>
          <Button disabled={actionBusy} onClick={() => { if (window.confirm('Mark this allocation complete?')) void action('complete'); }}><CheckCircle2 size={14} />Complete</Button>
        </div>
      </section>
    </div>
  );
}

function PatientCard({ patient: p, index, origin, update, remove }: { patient: Draft; index: number; origin: { lat: number; lng: number }; update: (i: number, patch: Partial<Draft>) => void; remove: () => void }) {
  const symptomSet = useMemo(() => new Set(p.symptoms), [p.symptoms]);
  return <section className="glass rounded-3xl p-5">
    <div className="flex items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">Patient {index + 1}</h2><button type="button" onClick={remove} disabled={index === 0} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-brand-soft disabled:opacity-30" aria-label="Remove patient"><Trash2 size={16} /></button></div>
    {p.error && <p className="mt-2 flex items-center gap-2 text-xs text-brand-soft"><AlertCircle size={14} />{p.error}</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-slate-300">Stable patient ID<input value={p.patient_id} onChange={(e) => update(index, { patient_id: e.target.value })} className="field mt-1" /></label>
      <label className="text-xs text-slate-300">Latitude<input type="number" step="any" value={p.latitude} onChange={(e) => update(index, { latitude: Number(e.target.value) })} className="field mt-1" /></label>
      <label className="text-xs text-slate-300">Longitude<input type="number" step="any" value={p.longitude} onChange={(e) => update(index, { longitude: Number(e.target.value) })} className="field mt-1" /></label>
      <label className="text-xs text-slate-300">Age (optional)<input type="number" min="0" max="130" value={p.age ?? ''} onChange={(e) => update(index, { age: e.target.value ? Number(e.target.value) : undefined })} className="field mt-1" /></label>
    </div>
    <button type="button" onClick={() => update(index, { latitude: origin.lat, longitude: origin.lng })} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-signal hover:underline"><MapPin size={14} />Use current session location</button>
    <div className="mt-4"><div className="mb-2 text-xs font-semibold text-slate-300">Symptoms</div><div className="flex flex-wrap gap-2">{SYMPTOMS.map((s) => <label key={s} className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-slate-300"><input type="checkbox" checked={symptomSet.has(s)} onChange={(e) => update(index, { symptoms: e.target.checked ? [...p.symptoms, s] : p.symptoms.filter((x) => x !== s) })} />{s.replace('_', ' ')}</label>)}</div></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-4"><div className="text-xs font-semibold text-slate-300 sm:col-span-4">Vitals (optional)</div>{VITALS.map((v) => <label key={v} className="text-xs text-slate-300">{v}<input type="number" step="any" value={p.vitals[v] ?? ''} onChange={(e) => update(index, { vitals: { ...p.vitals, [v]: e.target.value ? Number(e.target.value) : undefined } })} className="field mt-1" /></label>)}</div>
    <label className="mt-4 inline-flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={p.described_as_severe} onChange={(e) => update(index, { described_as_severe: e.target.checked })} />Described as severe</label>
  </section>;
}

function BatchResults({ batch }: { batch: AllocationBatchResponse }) {
  return <section className="glass rounded-3xl p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">Backend allocation results</h2><Pill tone="signal">Batch {batch.batch_id}</Pill></div><p className="mt-2 text-xs text-slate-500">These are authoritative server results. They are not a hospitalâ€™s clinical acceptance.</p><div className="mt-4 grid gap-3">{batch.results.map((r) => <div key={r.patient_id} className="rounded-2xl bg-black/25 p-4"><div className="flex flex-wrap items-center gap-2"><strong>{r.patient_id}</strong><Pill tone={r.status === 'ALLOCATED' ? 'ok' : 'bad'}>{r.status}</Pill>{r.hospital_id && <Pill>{r.hospital_id}</Pill>}</div><p className="mt-2 text-sm text-slate-300">{r.reason}</p>{r.estimated_travel_minutes != null && <p className="mt-1 text-xs text-slate-500">Backend travel estimate: {r.estimated_travel_minutes} min</p>}</div>)}</div></section>;
}
