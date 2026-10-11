import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type HospitalRequestStatusResponse, type RecommendResponse } from '../lib/api';
import { buildRecommendRequest, toRanked } from '../lib/recommend';
import { Map as MapIcon, Box, Sparkles, Building2, AlertCircle, Loader2, Info } from 'lucide-react';
import { ChatPanel } from '../components/ChatPanel';
import { HospitalList } from '../components/HospitalList';
import { Scene3D } from '../components/Scene3D';
import { TerrainMap } from '../components/TerrainMap';
import { useChat } from '../hooks/useChat';
import { rankHospitals } from '../lib/ranking';
import { useHospitals, useSession } from '../store/hospitals';
import type { FacilityKey } from '../types';
import { Badge, Button, Pill } from '../components/ui';
import type { RankedHospital } from '../types';
import { uid } from '../lib/util';

const DEFAULT_REQUIRED: FacilityKey[] = ['emergency'];

type MapVisualizationMode = 'terrain' | '3d';

export function TriagePage() {
  const hospitals = useHospitals((s) => s.hospitals);
  const scope = useHospitals((s) => s.scope);
  const loading = useHospitals((s) => s.loading);
  const error = useHospitals((s) => s.error);
  const origin = useSession((s) => s.origin);
  const chat = useChat();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapVisualizationMode>('terrain');
  const [requestTarget, setRequestTarget] = useState<RankedHospital | null>(null);
  const [requestStatus, setRequestStatus] = useState<HospitalRequestStatusResponse | null>(null);
  const [requestBusy, setRequestBusy] = useState(false);
  const requestPatientId = useRef(`patient-${uid()}`);

  const required = chat.triage?.required ?? DEFAULT_REQUIRED;

  // Server-side ranking (POST /triage/recommend), refreshed every 10 s so live bed changes re-rank.
  const [server, setServer] = useState<RecommendResponse | null>(null);
  const [recoError, setRecoError] = useState<string | null>(null);
  const reqBody = useMemo(
    () => (chat.triage ? JSON.stringify(buildRecommendRequest(chat.patient, origin)) : null),
    [chat.triage, chat.patient, origin],
  );
  useEffect(() => {
    if (!reqBody) { setServer(null); setRecoError(null); return; }
    let live = true;
    const run = () =>
      api.recommend(JSON.parse(reqBody))
        .then((r) => { if (live) { setServer(r); setRecoError(null); } })
        .catch((e: Error) => { if (live) { setServer(null); setRecoError(e.message); } });
    void run();
    const t = window.setInterval(() => { if (!document.hidden) void run(); }, 10000);
    return () => { live = false; window.clearInterval(t); };
  }, [reqBody]);

  const ranked = useMemo(
    () => (server ? toRanked(server, hospitals) : rankHospitals(hospitals, origin, required)),
    [server, hospitals, origin, required],
  );
  const triageKey = chat.triage ? `${chat.triage.severity}:${chat.triage.required.join(',')}` : '';
  const topId = ranked[0]?.hospital.id;

  // Focus recommended hospital on new triage result
  useEffect(() => {
    if (triageKey) setSelectedId(topId ?? null);
  }, [triageKey, topId]);

  // Dynamic re-routing on real-time portal status changes
  const prev = useRef({ top: topId, key: triageKey });
  useEffect(() => {
    const p = prev.current;
    if (triageKey && p.key === triageKey && p.top && topId && p.top !== topId) {
      const name = ranked[0].hospital.name;
      chat.pushBot(
        `A hospital's status just updated in real time. The top recommendation is now ${name}${
          ranked[0].suitable ? '' : ' (closest partial match)'
        }.`,
      );
      setSelectedId(topId);
    }
    prev.current = { top: topId, key: triageKey };
  }, [topId, triageKey, ranked, chat]);

  useEffect(() => {
    if (!requestStatus || requestStatus.status !== 'PENDING_HOSPITAL_RESPONSE') return;
    const poll = () => void api.hospitalRequestStatus(requestStatus.request_id).then(setRequestStatus).catch(() => undefined);
    const timer = window.setInterval(() => { if (!document.hidden) poll(); }, 5000);
    return () => window.clearInterval(timer);
  }, [requestStatus]);

  const sendHospitalRequest = async () => {
    if (!requestTarget || !chat.triage) return;
    setRequestBusy(true);
    try {
      const { max_results: _maxResults, ...clinical } = buildRecommendRequest(chat.patient, origin);
      const created = await api.createHospitalRequest({
        ...clinical,
        patient_id: requestPatientId.current,
        target_hospital_id: requestTarget.hospital.id,
      }, `hospital-request-${requestPatientId.current}-${requestTarget.hospital.id}`);
      setRequestStatus(created);
      setRequestTarget(null);
    } catch (e) {
      setRequestStatus({
        request_id: '', target_hospital_id: requestTarget.hospital.id, target_hospital_name: requestTarget.hospital.name,
        status: 'UNAVAILABLE', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        reason: e instanceof Error ? e.message : 'The hospital request could not be sent.',
      });
    } finally { setRequestBusy(false); }
  };

  return (
    <div className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(400px,5fr)_7fr] lg:p-5">
      {/* Left Column: Triage Assistant & Clinical Reasoning */}
      <div className="min-h-0 lg:h-full">
        <ChatPanel
          messages={chat.messages}
          thinking={chat.thinking}
          patient={chat.patient}
          triage={chat.triage}
          ranked={ranked}
          onSend={chat.send}
          onSelect={setSelectedId}
        />
      </div>

      {/* Right Column: High-Impact Real Terrain & 3D Hospital Map Console */}
      <div className="flex min-h-0 flex-col gap-3">
        {/* Data status */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/30">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}
        {loading && hospitals.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
            <Loader2 size={14} className="animate-spin" /> Loading hospitals from the database…
          </div>
        )}
        {!loading && !error && hospitals.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-300 ring-1 ring-white/10">
            <Info size={14} className="shrink-0" /> No hospitals are registered yet. Register one to see it here.
          </div>
        )}
        {scope === 'public' && hospitals.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn ring-1 ring-warn/30">
            <Info size={14} className="shrink-0" /> Showing hospital locations only. Bed, ICU and doctor availability needs a staff sign-in, so rankings are limited.
          </div>
        )}

        {recoError && chat.triage && (
          <div className="flex items-center gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn ring-1 ring-warn/30">
            <AlertCircle size={14} className="shrink-0" /> Server recommendation unavailable ({recoError}). Showing basic local ranking.
          </div>
        )}
        {server && (
          <div className="space-y-1 rounded-xl bg-signal/8 px-3 py-2 text-[11px] text-slate-300 ring-1 ring-signal/25">
            <div>
              <strong className="text-signal">{server.triage.urgency_level}</strong> · {server.triage.category} · ranked by {server.ranking.method.replace(/_/g, ' ').toLowerCase()}
              {server.ranking.model_id ? ` (${server.ranking.model_id})` : ''} · {server.ranking.hospitals_considered} hospitals considered
            </div>
            {server.triage.not_checked_by_server.length > 0 && (
              <div className="text-slate-400">Not checked by server: {server.triage.not_checked_by_server.join(', ')}</div>
            )}
            <div className="text-slate-500">{server.disclaimer}</div>
          </div>
        )}

        {/* Map Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles size={16} className="text-signal" /> Emergency Dispatch Telemetry
            </span>
            <Badge variant="signal">
              <Building2 size={12} /> {hospitals.length} Hospitals Live
            </Badge>
          </div>

          {/* Visualization Mode Toggle */}
          <div className="flex rounded-xl bg-slate-900/90 p-1 ring-1 ring-inset ring-white/15 backdrop-blur-md">
            <button
              onClick={() => setMapMode('terrain')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mapMode === 'terrain'
                  ? 'bg-signal text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapIcon size={14} /> Real Google Terrain Map
            </button>
            <button
              onClick={() => setMapMode('3d')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                mapMode === '3d'
                  ? 'bg-signal text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box size={14} /> 3D Architectural Scene
            </button>
          </div>
        </div>

        {/* High-Impact Full-Featured Map Viewport */}
        <div className="h-[460px] shrink-0 lg:h-[54%] transition-all">
          {mapMode === 'terrain' ? (
            <TerrainMap
              origin={origin}
              ranked={ranked}
              selectedId={selectedId}
              onSelect={setSelectedId}
              triageActive={!!chat.triage}
            />
          ) : (
            <Scene3D
              origin={origin}
              ranked={ranked}
              selectedId={selectedId}
              onSelect={setSelectedId}
              triageActive={!!chat.triage}
            />
          )}
        </div>

        {/* Ranked Hospital Capability List */}
        <div className="min-h-0 flex-1">
          <HospitalList
            ranked={ranked}
            required={required}
            triageActive={!!chat.triage}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRequest={setRequestTarget}
          />
        </div>
      </div>
      {requestTarget && chat.triage && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="request-hospital-title">
          <div className="glass max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl p-5">
            <h2 id="request-hospital-title" className="font-display text-xl font-semibold">Request {requestTarget.hospital.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{requestTarget.hospital.area}</p>
            <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <div><span className="text-slate-500">Severity:</span> {chat.triage.severity} · {chat.triage.category}</div>
              <div><span className="text-slate-500">Urgency:</span> {server?.triage.urgency_level ?? chat.triage.severity}</div>
              <div><span className="text-slate-500">Patient location:</span> {origin.lat.toFixed(4)}, {origin.lng.toFixed(4)}</div>
              <div><span className="text-slate-500">Estimate:</span> {requestTarget.etaMin} min (routing fallback)</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(server?.triage.required_resources ?? required).map((resource) => <Pill key={resource} tone="signal">{resource}</Pill>)}
              {(server?.triage.required_specialists ?? []).map((specialist) => <Pill key={specialist}>{specialist}</Pill>)}
            </div>
            <div className="mt-4 rounded-xl bg-warn/10 p-3 text-xs text-warn ring-1 ring-warn/25">
              Reported capacity is decision-support data, not a confirmed reservation. This request remains pending until the hospital accepts and the backend successfully reserves resources.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={requestBusy} onClick={() => setRequestTarget(null)}>Cancel</Button>
              <Button variant="primary" disabled={requestBusy} onClick={() => void sendHospitalRequest()}>{requestBusy ? 'Sending…' : 'Confirm Request'}</Button>
            </div>
          </div>
        </div>
      )}
      {requestStatus && !requestTarget && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(28rem,calc(100vw-2rem))] glass rounded-2xl p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-2"><strong>Hospital request</strong><Pill tone={requestStatus.status === 'ALLOCATED' ? 'ok' : requestStatus.status === 'REJECTED' ? 'bad' : 'warn'}>{requestStatus.status}</Pill></div>
          <p className="mt-2 text-sm text-slate-300">{requestStatus.reason ?? (requestStatus.status === 'PENDING_HOSPITAL_RESPONSE' ? 'Waiting for the hospital to respond.' : 'The backend has updated this request.')}</p>
          {requestStatus.allocation_id && <p className="mt-1 text-xs text-slate-500">Allocation confirmed by backend: {requestStatus.allocation_id}</p>}
          <div className="mt-3 flex items-center gap-3">
            {requestStatus.status === 'REJECTED' && <button className="text-xs font-semibold text-signal underline" onClick={() => setRequestStatus(null)}>Choose another hospital</button>}
            <button className="text-xs text-slate-400 underline" onClick={() => setRequestStatus(null)}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
