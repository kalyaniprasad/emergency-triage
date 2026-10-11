import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Grid, Html, Line, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { LatLng, RankedHospital } from '../types';
import { toLocalKm } from '../lib/geo';

type NodeState = 'best' | 'ok' | 'bad';
const COLORS: Record<NodeState, string> = {
  best: '#22d3ee',
  ok: '#38bdf8',
  bad: '#f43f5e',
};

interface SceneNode {
  r: RankedHospital;
  pos: THREE.Vector3;
  state: NodeState;
}

function PulseRing({ color, radius = 0.8, speed = 0.8 }: { color: string; radius?: number; speed?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = (clock.elapsedTime * speed) % 1;
    m.scale.setScalar(1 + t * 2.2);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.03}>
      <ringGeometry args={[radius, radius + 0.06, 64]} />
      <meshBasicMaterial color={color} transparent depthWrite={false} />
    </mesh>
  );
}

function Patient() {
  return (
    <group position={[0, 0, 0]}>
      {/* Patient Beacon Sphere */}
      <mesh position-y={0.32}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color="#ff3b57" emissive="#ff3b57" emissiveIntensity={2.8} />
      </mesh>
      {/* SOS Vertical Light Beam */}
      <mesh position-y={2.2}>
        <cylinderGeometry args={[0.02, 0.02, 4.4, 8]} />
        <meshBasicMaterial color="#ff3b57" transparent opacity={0.5} />
      </mesh>
      {/* Radio Wave Ground Rings */}
      <PulseRing color="#ff3b57" radius={0.4} speed={0.9} />
      <PulseRing color="#ff7a8c" radius={0.8} speed={0.6} />

      <Html position={[0, 1.1, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-white shadow-xl ring-2 ring-white/30">
          <span className="h-2 w-2 animate-ping rounded-full bg-white" />
          Patient SOS
        </div>
      </Html>
    </group>
  );
}

/** 3D Realistic Architectural Hospital Complex */
function HospitalBuilding3D({
  node,
  selected,
  onSelect,
}: {
  node: SceneNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const { r, pos, state } = node;
  const [hover, setHover] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Tower height scales realistically with hospital size & load
  const h = Math.max(1.4, 0.9 + (r.hospital.loadPct / 100) * 2.2);
  const color = COLORS[state];

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const targetScale = hover || selected ? 1.12 : 1;
    g.scale.x = THREE.MathUtils.damp(g.scale.x, targetScale, 8, dt);
    g.scale.y = THREE.MathUtils.damp(g.scale.y, targetScale, 8, dt);
    g.scale.z = THREE.MathUtils.damp(g.scale.z, targetScale, 8, dt);
  });

  return (
    <group
      ref={groupRef}
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(r.hospital.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = 'auto';
      }}
    >
      {/* Foundation Concrete Base Plaza */}
      <mesh position-y={0.06}>
        <boxGeometry args={[1.6, 0.12, 1.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Main Central Hospital Tower Block */}
      <mesh position-y={h / 2 + 0.12}>
        <boxGeometry args={[0.9, h, 0.7]} />
        <meshStandardMaterial
          color={hover || selected ? '#2a3b5c' : '#18243b'}
          emissive={color}
          emissiveIntensity={state === 'best' ? 0.7 : selected ? 0.5 : 0.15}
          roughness={0.25}
          metalness={0.65}
        />
      </mesh>

      {/* Glass Windows Grid Strips (Tower Facade) */}
      <mesh position={[0, h / 2 + 0.12, 0.36]}>
        <boxGeometry args={[0.76, h * 0.85, 0.02]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={state === 'best' ? 1.4 : selected ? 1.0 : 0.4}
          roughness={0.1}
          metalness={0.9}
          transparent
          opacity={0.88}
        />
      </mesh>

      {/* Side Wing 1: ER & Trauma Unit Bay */}
      <mesh position={[-0.6, 0.45, 0.1]}>
        <boxGeometry args={[0.45, 0.7, 0.6]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Side Wing 2: Diagnostic & Ambulatory Center */}
      <mesh position={[0.6, 0.4, -0.05]}>
        <boxGeometry args={[0.42, 0.6, 0.6]} />
        <meshStandardMaterial color="#131e33" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* 3D Illuminated Medical Cross Symbol on Facade */}
      <group position={[0, h * 0.75 + 0.12, 0.38]}>
        {/* Vertical cross bar */}
        <mesh>
          <boxGeometry args={[0.07, 0.24, 0.03]} />
          <meshStandardMaterial color="#ff3b57" emissive="#ff3b57" emissiveIntensity={2.5} />
        </mesh>
        {/* Horizontal cross bar */}
        <mesh>
          <boxGeometry args={[0.24, 0.07, 0.03]} />
          <meshStandardMaterial color="#ff3b57" emissive="#ff3b57" emissiveIntensity={2.5} />
        </mesh>
      </group>

      {/* Rooftop Helipad Deck */}
      <group position={[0, h + 0.14, 0]}>
        {/* Circular Landing Pad */}
        <mesh rotation-x={-Math.PI / 2}>
          <cylinderGeometry args={[0.38, 0.38, 0.04, 32]} />
          <meshStandardMaterial color="#334155" roughness={0.8} />
        </mesh>
        {/* Helipad Yellow Ring */}
        <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
          <ringGeometry args={[0.28, 0.32, 32]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        {/* Helipad 'H' Indicator */}
        <mesh rotation-x={-Math.PI / 2} position-y={0.035}>
          <planeGeometry args={[0.16, 0.16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      </group>

      {/* Base Perimeter Status Aura */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[0.95, 1.05, 48]} />
        <meshBasicMaterial color={color} transparent opacity={selected ? 0.95 : 0.4} />
      </mesh>

      {state === 'best' && <PulseRing color={color} radius={1.1} speed={0.7} />}

      {/* Floating 3D HUD Badge */}
      <Html position={[0, h + 0.9, 0]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <div
          className={`whitespace-nowrap rounded-2xl px-3 py-1.5 text-center text-xs leading-tight shadow-2xl backdrop-blur-md transition-all ${
            state === 'best'
              ? 'bg-signal/95 text-slate-950 font-bold ring-2 ring-white/60 shadow-[0_0_20px_rgba(34,211,238,0.5)]'
              : selected
              ? 'bg-blue-600/90 text-white font-semibold ring-2 ring-white/40'
              : 'bg-slate-900/90 text-slate-100 ring-1 ring-white/20'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            {state === 'best' && <span>⭐</span>}
            <span>{r.hospital.name}</span>
          </div>
          <div className="mt-0.5 text-[10px] opacity-80">
            {r.etaMin} min · {r.hospital.loadPct}% load · ICU {r.hospital.icu.available}/{r.hospital.icu.total}
          </div>
        </div>
      </Html>
    </group>
  );
}

/** Animated Curved Emergency Trajectory */
function EmergencyRoute({ to }: { to: THREE.Vector3 }) {
  const curve = useMemo(() => {
    const from = new THREE.Vector3(0, 0.35, 0);
    const end = new THREE.Vector3(to.x, 0.35, to.z);
    const mid = from.clone().lerp(end, 0.5).setY(2.2);
    return new THREE.QuadraticBezierCurve3(from, mid, end);
  }, [to]);

  const points = useMemo(() => curve.getPoints(60), [curve]);
  const pulses = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];

  useFrame(({ clock }) => {
    pulses.forEach((p, i) => {
      if (!p.current) return;
      const progress = (clock.elapsedTime * 0.32 + i * 0.33) % 1;
      p.current.position.copy(curve.getPoint(progress));
    });
  });

  return (
    <group>
      {/* Route Line */}
      <Line
        points={points}
        color="#22d3ee"
        lineWidth={2.8}
        dashed
        dashSize={0.25}
        gapSize={0.12}
        transparent
        opacity={0.92}
      />
      {/* Flowing Ambulance Light Beacons */}
      {pulses.map((ref, idx) => (
        <mesh key={idx} ref={ref}>
          <sphereGeometry args={[0.11, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

/** Topographic Landscape Base */
function TopoTerrainPlate() {
  return (
    <group position={[0, -0.05, 0]}>
      {/* Ground City Plate */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[36, 36, 32, 32]} />
        <meshStandardMaterial color="#090f1d" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* Topographic Relief Grid */}
      <Grid
        position={[0, 0.01, 0]}
        args={[36, 36]}
        cellSize={0.8}
        sectionSize={4}
        cellColor="#1b2a4a"
        sectionColor="#2d4880"
        fadeDistance={24}
        fadeStrength={1.5}
        infiniteGrid
      />
    </group>
  );
}

interface Props {
  origin: LatLng;
  ranked: RankedHospital[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  triageActive: boolean;
}

export function Scene3D({ origin, ranked, selectedId, onSelect, triageActive }: Props) {
  const nodes = useMemo<SceneNode[]>(() => {
    // 1. Calculate local coordinates in km relative to patient origin
    const rawPts = ranked.map((r) => {
      const { x, z } = toLocalKm(origin, r.hospital);
      const dist = Math.hypot(x, z);
      // Clamp extreme outliers (e.g. 2300km) to max 25km so local buildings aren't crushed
      const maxKm = 25;
      const factor = dist > maxKm ? maxKm / dist : 1;
      return { r, x: x * factor, z: z * factor, origDist: dist };
    });

    // 2. Compute scale factor based on local area
    const localPts = rawPts.filter((p) => p.origDist <= 40);
    const scaleBase = localPts.length > 0 ? localPts : rawPts;
    const ext = Math.min(25, Math.max(2, ...scaleBase.flatMap((p) => [Math.abs(p.x), Math.abs(p.z)])));
    const k = 4.8 / ext;

    // 3. Disperse overlapping 3D positions if coordinates are identical or near each other
    const placed: { x: number; z: number }[] = [];

    return rawPts.map((p, i) => {
      let posX = p.x * k;
      let posZ = p.z * k;

      // Check collision with patient origin
      if (Math.hypot(posX, posZ) < 0.8) {
        posX += 1.4;
        posZ += 1.4;
      }

      // Check collision with previously placed buildings
      for (let attempt = 0; attempt < 8; attempt++) {
        const collision = placed.some((other) => Math.hypot(other.x - posX, other.z - posZ) < 1.4);
        if (!collision) break;
        const angle = (attempt * Math.PI) / 4;
        posX += 1.5 * Math.cos(angle);
        posZ += 1.5 * Math.sin(angle);
      }

      placed.push({ x: posX, z: posZ });

      return {
        r: p.r,
        pos: new THREE.Vector3(posX, 0, posZ),
        state: (p.r.suitable ? (i === 0 && triageActive ? 'best' : 'ok') : 'bad') as NodeState,
      };
    });
  }, [ranked, origin, triageActive]);

  const best = nodes.find((n) => n.state === 'best');
  const activeNode = nodes.find((n) => n.r.hospital.id === selectedId) || best;

  return (
    <div className="glass relative h-full min-h-[280px] overflow-hidden rounded-3xl">
      <Canvas
        camera={{ position: [0, 9.5, 13.5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#050811']} />
        <fog attach="fog" args={['#050811', 12, 32]} />

        {/* Cinematic Stage Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 15, 8]} intensity={1.2} color="#cde3ff" />
        <pointLight position={[0, 9, 0]} intensity={85} color="#ff7a8c" />
        <pointLight position={[9, 5, -6]} intensity={50} color="#22d3ee" />

        <Suspense fallback={null}>
          <Stars radius={60} depth={30} count={1600} factor={2.5} fade speed={0.5} />
          <TopoTerrainPlate />
          <Patient />

          {/* Render Realistic 3D Hospital Complexes */}
          {nodes.map((n) => (
            <HospitalBuilding3D
              key={n.r.hospital.id}
              node={n}
              selected={n.r.hospital.id === selectedId}
              onSelect={onSelect}
            />
          ))}

          {/* Dynamic Ambulance Trajectory */}
          {activeNode && <EmergencyRoute to={activeNode.pos} />}

          <EffectComposer multisampling={0}>
            <Bloom intensity={0.75} luminanceThreshold={0.25} mipmapBlur />
          </EffectComposer>
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.4}
          minDistance={6}
          maxDistance={22}
          maxPolarAngle={Math.PI / 2.15}
        />
      </Canvas>

      {/* Top Overlay Badge */}
      <div className="pointer-events-none absolute left-4 top-3 text-xs text-slate-300">
        <div className="font-display text-sm font-semibold text-white flex items-center gap-1.5">
          <span>🏢</span> 3D Architectural City & Hospital Campus View
        </div>
        <div className="text-[11px] text-slate-400">
          Realistic 3D buildings with helipads, ER wings & load telemetry. Drag to rotate.
        </div>
      </div>

      {/* Bottom Legend */}
      <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ background: COLORS.best }} />
          Recommended Facility
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ background: COLORS.ok }} />
          Capable
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ background: COLORS.bad }} />
          Missing Unit
        </span>
      </div>
    </div>
  );
}
