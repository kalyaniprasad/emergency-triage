import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation2, Maximize2, Minimize2, Hospital as HospitalIcon } from 'lucide-react';
import type { LatLng, RankedHospital } from '../types';

interface TerrainMapProps {
  origin: LatLng;
  ranked: RankedHospital[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  triageActive: boolean;
}

type MapLayerType = 'terrain' | 'satellite' | 'street';

export function TerrainMap({ origin, ranked, selectedId, onSelect, triageActive }: TerrainMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [activeLayer, setActiveLayer] = useState<MapLayerType>('terrain');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Layer Tile URLs
  const getTileUrl = (type: MapLayerType) => {
    switch (type) {
      case 'terrain':
        // Google Maps Terrain / Topographic layer
        return 'https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
      case 'satellite':
        // Google Hybrid Satellite + Roads
        return 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      case 'street':
      default:
        // High-contrast clean carto style
        return 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [origin.lat, origin.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      const tiles = L.tileLayer(getTileUrl('terrain'), {
        maxZoom: 19,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      }).addTo(map);

      tileLayerRef.current = tiles;
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Invalidate size when fullscreen mode toggling occurs
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 200);
    }
  }, [isFullscreen]);

  // Change Layer Type
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;

    mapInstanceRef.current.removeLayer(tileLayerRef.current);
    const newTiles = L.tileLayer(getTileUrl(activeLayer), {
      maxZoom: 19,
      subdomains: activeLayer === 'street' ? ['a', 'b', 'c', 'd'] : ['mt0', 'mt1', 'mt2', 'mt3'],
    }).addTo(mapInstanceRef.current);

    newTiles.bringToBack();
    tileLayerRef.current = newTiles;
  }, [activeLayer]);

  // Helper: disperse overlapping coordinates so markers sharing identical lat/lng (or patient SOS) are clearly visible and separated
  const getDispersedCoordinates = (
    items: RankedHospital[],
    orig: LatLng,
  ): Map<string, { lat: number; lng: number }> => {
    const coordsMap = new Map<string, { lat: number; lng: number }>();
    const groups = new Map<string, RankedHospital[]>();

    for (const r of items) {
      // Group by coordinate key (within ~15-20 meters)
      const key = `${r.hospital.lat.toFixed(4)},${r.hospital.lng.toFixed(4)}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    for (const [, groupList] of groups) {
      if (groupList.length === 1) {
        const h = groupList[0].hospital;
        // Check if hospital is right on top of the patient SOS
        const onPatient = Math.abs(h.lat - orig.lat) < 0.0003 && Math.abs(h.lng - orig.lng) < 0.0003;
        if (onPatient) {
          coordsMap.set(h.id, { lat: h.lat + 0.0004, lng: h.lng + 0.0004 });
        } else {
          coordsMap.set(h.id, { lat: h.lat, lng: h.lng });
        }
      } else {
        // Disperse multiple hospitals in a circle around the coordinate
        const total = groupList.length;
        const radLat = 0.00048; // ~50m
        const radLng = 0.00048 / Math.max(0.2, Math.cos((groupList[0].hospital.lat * Math.PI) / 180));

        groupList.forEach((r, idx) => {
          const angle = (2 * Math.PI * idx) / total;
          coordsMap.set(r.hospital.id, {
            lat: r.hospital.lat + radLat * Math.sin(angle),
            lng: r.hospital.lng + radLng * Math.cos(angle),
          });
        });
      }
    }

    return coordsMap;
  };

  // Update Markers, Ultra-Detailed 3D Hospital Icons, and Routes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // Compute dispersed visual positions for all hospitals
    const dispersed = getDispersedCoordinates(ranked, origin);

    // 1. Patient SOS Location Marker
    const patientIcon = L.divIcon({
      className: 'patient-custom-marker',
      html: `
        <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; z-index: 500;">
          <div style="position: absolute; width: 48px; height: 48px; border-radius: 50%; background: rgba(255,59,87,0.35); animation: ping 1.6s ease-out infinite;"></div>
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: #ff3b57; border: 3px solid #ffffff; box-shadow: 0 0 20px rgba(255,59,87,0.9); display: flex; align-items: center; justify-content: center; color: white;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </div>
          <div style="position: absolute; bottom: -22px; white-space: nowrap; background: #060912; color: #fff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; border: 1px solid rgba(255,59,87,0.6); box-shadow: 0 4px 12px rgba(0,0,0,0.6);">
            🚨 PATIENT SOS
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    const patientMarker = L.marker([origin.lat, origin.lng], { icon: patientIcon, zIndexOffset: 800 });
    patientMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 12px; color: #0c1220; padding: 4px;">
        <strong style="color: #ff3b57;">Incident / Patient Location</strong>
        <div style="font-size: 11px; color: #475569; margin-top: 2px;">
          Lat: ${origin.lat.toFixed(4)}, Lng: ${origin.lng.toFixed(4)}
        </div>
      </div>
    `);
    group.addLayer(patientMarker);

    // 2. Add High-Tech 3D Hospital Isometric Building Icons
    ranked.forEach((r, idx) => {
      const isTop = idx === 0 && triageActive;
      const isSelected = r.hospital.id === selectedId;
      const h = r.hospital;
      const pos = dispersed.get(h.id) ?? { lat: h.lat, lng: h.lng };

      const primaryColor = isTop ? '#06b6d4' : r.suitable ? '#3b82f6' : '#ef4444';
      const glowEffect = isTop
        ? '0 0 28px rgba(6,182,212,0.95), 0 0 10px rgba(255,255,255,0.6)'
        : isSelected
        ? '0 0 22px rgba(59,130,246,0.85)'
        : '0 8px 20px rgba(0,0,0,0.6)';

      const hospitalIcon = L.divIcon({
        className: 'hospital-building-marker-3d',
        html: `
          <div style="position: relative; width: 84px; height: 92px; cursor: pointer; transition: transform 0.2s ease;">
            <!-- Radar Ground Pulse -->
            ${
              isTop
                ? `<div style="position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 70px; height: 70px; border-radius: 50%; border: 2px solid ${primaryColor}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; opacity: 0.7;"></div>`
                : ''
            }

            <!-- 3D Architectural Hospital Structure -->
            <div style="
              position: absolute;
              bottom: 8px;
              left: 50%;
              transform: translateX(-50%);
              width: 64px;
              height: 60px;
              background: linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #090d16 100%);
              border: 2px solid ${primaryColor};
              border-radius: 10px;
              box-shadow: ${glowEffect};
              display: flex;
              flex-direction: column;
              overflow: hidden;
            ">
              <!-- Rooftop Helipad Deck -->
              <div style="
                height: 16px;
                background: linear-gradient(90deg, ${primaryColor}22, ${primaryColor}44);
                border-bottom: 1px solid ${primaryColor}66;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 4px;
              ">
                <span style="border: 1px solid ${primaryColor}; border-radius: 50%; width: 12px; height: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; color: ${primaryColor}; background: #0f172a;">H</span>
                <span style="width: 5px; height: 5px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e;"></span>
              </div>

              <!-- Main Facade with Windows & Red Cross -->
              <div style="flex: 1; padding: 3px 5px; display: flex; flex-direction: column; justify-content: space-between; background: rgba(15, 23, 42, 0.9);">
                <div style="display: flex; justify-content: space-between; gap: 2px;">
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                </div>

                <!-- Glowing Red Medical Cross -->
                <div style="align-self: center; background: #ff3b57; color: white; width: 14px; height: 14px; border-radius: 3.5px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; box-shadow: 0 0 10px rgba(255,59,87,0.9); line-height: 1;">
                  +
                </div>

                <div style="display: flex; justify-content: space-between; gap: 2px;">
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                  <span style="width: 10px; height: 3px; background: ${primaryColor}aa; border-radius: 1px;"></span>
                </div>
              </div>

              <!-- Live Load Telemetry Bar -->
              <div style="height: 5px; width: 100%; background: #1e293b;">
                <div style="height: 100%; width: ${h.loadPct}%; background: ${h.loadPct > 80 ? '#ef4444' : h.loadPct > 60 ? '#f59e0b' : '#10b981'}; transition: width 0.5s;"></div>
              </div>
            </div>

            <!-- Top Floating Header Badge -->
            <div style="
              position: absolute;
              top: -6px;
              left: 50%;
              transform: translateX(-50%);
              background: #090d16;
              color: #ffffff;
              padding: 2.5px 8px;
              border-radius: 9999px;
              font-size: 9.5px;
              font-weight: 800;
              white-space: nowrap;
              border: 1px solid ${primaryColor};
              box-shadow: 0 4px 12px rgba(0,0,0,0.7);
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              ${isTop ? '<span style="color:#22d3ee;">⭐ BEST</span>' : ''} ${r.etaMin}m · ${h.name.split(' ')[0]}
            </div>
          </div>
        `,
        iconSize: [84, 92],
        iconAnchor: [42, 84],
      });

      const zIndex = isTop ? 900 : isSelected ? 850 : 300 - idx;
      const marker = L.marker([pos.lat, pos.lng], { icon: hospitalIcon, zIndexOffset: zIndex });

      marker.on('click', () => {
        onSelect(h.id);
        map.flyTo([pos.lat, pos.lng], 14, { duration: 0.8 });
      });

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; color: #0c1220; min-width: 180px;">
          <div style="font-weight: 800; font-size: 14px; color: #0f172a;">${h.name}</div>
          <div style="color: #64748b; font-size: 11px; margin-bottom: 6px;">${h.area}${h.phone ? ' · ' + h.phone : ''}</div>
          <div style="display: flex; gap: 6px; margin-bottom: 6px;">
            <span style="background: #0f172a; color: #38bdf8; padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700;">
              ETA: ${r.etaMin} min
            </span>
            <span style="background: #0f172a; color: #34d399; padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700;">
              ICU: ${h.icu.available}/${h.icu.total}
            </span>
          </div>
          <div style="font-size: 10.5px; color: ${r.suitable ? '#059669' : '#dc2626'}; font-weight: 700;">
            ${r.suitable ? '✓ Capable for patient needs' : '⚠ Missing required department'}
          </div>
        </div>
      `);

      group.addLayer(marker);

      // 3. Draw Route
      if (isSelected || (isTop && !selectedId)) {
        const polyline = L.polyline(
          [
            [origin.lat, origin.lng],
            [pos.lat, pos.lng],
          ],
          {
            color: primaryColor,
            weight: 5,
            opacity: 0.9,
            dashArray: '10, 10',
          },
        );
        group.addLayer(polyline);
      }
    });

    // 4. Fit bounds: filter out extreme geographical outliers (> 120km) so the map doesn't zoom out across the country
    const localHospitals = ranked
      .filter((r) => {
        if (r.hospital.id === selectedId) return true;
        const d = r.distanceKm || 0;
        return d <= 120;
      })
      .map((r) => r.hospital);

    const targetHospitals = localHospitals.length > 0 ? localHospitals : ranked.slice(0, 5).map((r) => r.hospital);

    const points: [number, number][] = [
      [origin.lat, origin.lng],
      ...targetHospitals.map((h): [number, number] => {
        const p = dispersed.get(h.id) ?? { lat: h.lat, lng: h.lng };
        return [p.lat, p.lng];
      }),
    ];

    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [55, 55], maxZoom: 15 });
    } else {
      map.setView([origin.lat, origin.lng], 13);
    }
  }, [origin, ranked, selectedId, triageActive, onSelect]);

  const handleCenterPatient = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([origin.lat, origin.lng], 14, { duration: 0.8 });
    }
  };

  return (
    <div
      className={`glass relative h-full w-full overflow-hidden rounded-3xl transition-all duration-300 ${
        isFullscreen ? 'fixed inset-3 z-50 rounded-3xl shadow-2xl ring-2 ring-signal/50 bg-slate-950' : ''
      }`}
    >
      {/* Leaflet Map Container */}
      <div ref={mapContainerRef} className="h-full w-full z-0" />

      {/* Top Floating Controls */}
      <div className="absolute left-4 top-3.5 z-10 flex flex-wrap items-center gap-2">
        <div className="rounded-xl bg-slate-950/90 px-3.5 py-2 text-xs text-white shadow-xl backdrop-blur-md ring-1 ring-white/15">
          <div className="flex items-center gap-2 font-display font-semibold">
            <HospitalIcon size={15} className="text-signal animate-pulse" />
            <span>Google Terrain Emergency Map</span>
            <span className="rounded-full bg-signal/20 px-2 py-0.5 text-[10px] text-signal font-bold">
              3D Hospital Pins
            </span>
          </div>
        </div>

        {/* Map Layer Switcher */}
        <div className="flex items-center rounded-xl bg-slate-950/90 p-1 shadow-xl backdrop-blur-md ring-1 ring-white/15">
          {(
            [
              { id: 'terrain', label: 'Terrain' },
              { id: 'satellite', label: 'Satellite' },
              { id: 'street', label: 'Streets' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveLayer(item.id)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                activeLayer === item.id
                  ? 'bg-signal text-slate-950 shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Right Action Button: Expand Full Mode */}
      <div className="absolute right-4 top-3.5 z-10 flex items-center gap-2">
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="flex items-center gap-2 rounded-xl bg-signal px-3.5 py-2 text-xs font-bold text-slate-950 shadow-xl hover:bg-signal/90 transition"
        >
          {isFullscreen ? (
            <>
              <Minimize2 size={15} /> Exit Full Mode
            </>
          ) : (
            <>
              <Maximize2 size={15} /> Open Full Mode
            </>
          )}
        </button>
      </div>

      {/* Right Bottom Action Tools */}
      <div className="absolute right-4 bottom-4 z-10 flex flex-col gap-2">
        <button
          onClick={handleCenterPatient}
          title="Center on Patient SOS"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/90 text-slate-200 shadow-xl backdrop-blur-md ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white"
        >
          <Navigation2 size={18} className="text-brand" />
        </button>
      </div>

      {/* Bottom Map Legend */}
      <div className="pointer-events-none absolute bottom-3 left-4 z-10 flex flex-wrap gap-x-4 gap-y-1.5 rounded-xl bg-slate-950/85 px-3.5 py-2 text-[11px] font-medium text-slate-300 backdrop-blur-md ring-1 ring-white/15">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-signal shadow-[0_0_8px_#22d3ee]" />
          Recommended Facility
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          Capable
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Missing Unit
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_8px_#ff3b57]" />
          Patient SOS
        </span>
      </div>
    </div>
  );
}
