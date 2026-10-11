import { create } from 'zustand';
import { api, getTokens, type PublicHospitalDTO } from '../lib/api';
import type { ActivityItem, Hospital, LatLng } from '../types';
import { DEFAULT_ORIGIN } from '../lib/geo';
import { latestByHospital, toDataBody, toDoctorDTO, toHospital, toPublicHospital, recordId, STATUS_TO_TRIAGE } from '../lib/mappers';
import { uid } from '../lib/util';

const POLL_MS = 8000;

interface HospitalState {
  hospitals: Hospital[];
  /** Changes made in this browser session (local log, not stored in the DB). */
  activity: ActivityItem[];
  loading: boolean;
  error: string | null;
  /** 'full' = signed in, real capacity data. 'public' = backend only exposes name + location. */
  scope: 'full' | 'public';
  lastSyncedAt: number | null;
  refresh: () => Promise<void>;
  startPolling: () => () => void;
  /** Optimistically apply `fn`, then persist the difference to the backend. */
  update: (id: string, note: string, fn: (h: Hospital) => Hospital) => Promise<void>;
}

let pendingWrites = 0;
let writeChain: Promise<unknown> = Promise.resolve();

export const useHospitals = create<HospitalState>()((set, get) => ({
  hospitals: [],
  activity: [],
  loading: false,
  error: null,
  scope: 'public',
  lastSyncedAt: null,

  refresh: async () => {
    if (pendingWrites > 0) return; // do not overwrite an in-flight edit
    set({ loading: get().lastSyncedAt === null });
    try {
      if (getTokens()) {
        try {
          const [list, records] = await Promise.all([api.listHospitals(), api.listData(500)]);
          const latest = latestByHospital(records);
          const activeList = list.filter((h) => h.is_active !== false);

          let pubList: PublicHospitalDTO[] = [];
          try { pubList = await api.publicHospitals(); } catch { /* ignore */ }

          const hospitalMap = new Map<string, Hospital>();
          for (const p of pubList) {
            hospitalMap.set(p.id, toPublicHospital(p));
          }
          for (const h of activeList) {
            hospitalMap.set(h.id, toHospital(h, latest.get(h.id)));
          }

          const hospitals = Array.from(hospitalMap.values());
          set({ hospitals, scope: 'full', error: null, lastSyncedAt: Date.now(), loading: false });
          return;
        } catch (e) {
          console.warn('Authenticated hospital load failed, falling back to public:', e);
          // token rejected or error: fall through to the public list
        }
      }
      const pub = await api.publicHospitals();
      set({ hospitals: pub.map(toPublicHospital), scope: 'public', error: null, lastSyncedAt: Date.now(), loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load hospitals', loading: false });
    }
  },

  startPolling: () => {
    void get().refresh();
    const t = window.setInterval(() => { if (!document.hidden) void get().refresh(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void get().refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  },

  update: async (id, note, fn) => {
    const before = get().hospitals.find((h) => h.id === id);
    if (!before) return;
    const after: Hospital = { ...fn(before), updatedAt: Date.now() };
    const item: ActivityItem = { id: uid(), hospitalId: id, hospitalName: before.name, text: note, ts: Date.now() };
    set((s) => ({ hospitals: s.hospitals.map((h) => (h.id === id ? after : h)), activity: [item, ...s.activity].slice(0, 40), error: null }));

    pendingWrites++;
    const job = writeChain.then(async () => {
      try {
        const bedsChanged = before.beds.total !== after.beds.total || before.beds.available !== after.beds.available;
        if (!after.dataId) {
          const created = await api.createData(toDataBody(after));
          const newId = recordId(created);
          set((s) => ({ hospitals: s.hospitals.map((h) => (h.id === id ? { ...h, dataId: newId, hasOpsData: true } : h)) }));
        } else {
          const patch: Record<string, unknown> = {};
          if (bedsChanged) Object.assign(patch, { general_beds_total: after.beds.total, general_beds_available: after.beds.available });
          if (before.icu.total !== after.icu.total || before.icu.available !== after.icu.available) Object.assign(patch, { icu_beds_total: after.icu.total, icu_beds_available: after.icu.available });
          if (before.ventilators.total !== after.ventilators.total || before.ventilators.available !== after.ventilators.available) Object.assign(patch, { ventilators_total: after.ventilators.total, ventilators_available: after.ventilators.available });
          if (before.oxygen !== after.oxygen) patch.oxygen_cylinders = after.oxygen;
          if (before.status !== after.status) patch.triage_status = STATUS_TO_TRIAGE[after.status];
          if (before.doctors !== after.doctors) Object.assign(patch, { doctors: after.doctors.map(toDoctorDTO), doctors_total: after.doctorsTotal, doctors_available: after.doctorsAvailable });
          if (before.notes !== after.notes) patch.notes = after.notes ?? '';
          if (Object.keys(patch).length) await api.patchData(after.dataId, patch);
        }
        if (bedsChanged) await api.updateAvailability(id, after.beds.total, after.beds.available);
      } catch (e) {
        // roll back the optimistic change
        set((s) => ({ hospitals: s.hospitals.map((h) => (h.id === id ? before : h)), error: e instanceof Error ? e.message : 'Save failed' }));
      } finally {
        pendingWrites--;
      }
    });
    writeChain = job;
    await job;
    void get().refresh();
  },
}));

interface SessionState {
  origin: LatLng;
  locating: boolean;
  usingGps: boolean;
  locate: () => void;
}

export const useSession = create<SessionState>((set) => ({
  origin: DEFAULT_ORIGIN,
  locating: false,
  usingGps: false,
  locate: () => {
    if (!navigator.geolocation) return;
    set({ locating: true });
    navigator.geolocation.getCurrentPosition(
      (p) => set({ origin: { lat: p.coords.latitude, lng: p.coords.longitude }, locating: false, usingGps: true }),
      () => set({ locating: false }),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  },
}));
