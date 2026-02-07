import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { LocationData, ViewMode } from '../types';
import { MapPin, Users, Award, ShieldAlert, Flag } from 'lucide-react';

interface VoteMapProps {
  data: LocationData[];
  viewMode: ViewMode;
}

// --- Helper Component to Auto-Center Map ---
const MapController: React.FC<{ data: LocationData[] }> = ({ data }) => {
  const map = useMap();

  useEffect(() => {
    if (data.length > 0) {
      try {
        const bounds = L.latLngBounds(data.map(d => [d.lat, d.lng]));
        if (bounds.isValid()) {
          map.fitBounds(bounds, { 
            padding: [50, 50],
            maxZoom: 14,
            animate: true,
            duration: 1.5
          });
        }
      } catch (e) {
        console.error("Error fitting bounds", e);
      }
    }
  }, [data, map]);

  return null;
};

const PARTY_COLORS: Record<string, string> = {
  "PARTIDO CENTRO DEMOCRÁTICO": "#0ea5e9", // Sky Blue
  "PACTO HISTÓRICO": "#9333ea", // Purple
  "PARTIDO LIBERAL": "#ef4444", // Red
  "PARTIDO CONSERVADOR": "#1d4ed8", // Dark Blue
  "ALIANZA VERDE": "#22c55e", // Green
  "DEFAULT": "#64748b" // Slate
};

// --- Main Map Component ---
const VoteMap: React.FC<VoteMapProps> = ({ data, viewMode }) => {
  const centerPosition: [number, number] = [6.2442, -75.5812];

  // Calculate stats for scaling and audit
  const stats = useMemo(() => {
    if (data.length === 0) return { max: 100, avg: 0 };
    const max = Math.max(...data.map(d => d.totalVotes));
    const avg = data.reduce((acc, c) => acc + c.totalVotes, 0) / data.length;
    return { max, avg };
  }, [data]);

  // Logic to determine marker appearance based on ViewMode
  const getVisuals = (loc: LocationData) => {
    let radius = 4 + (Math.sqrt(loc.totalVotes) * 0.8);
    let color = '#fbbf24';
    let opacity = 0.6;
    let stroke = false;

    if (viewMode === 'heatmap') {
      const intensity = Math.min(loc.totalVotes / stats.max, 1);
      if (intensity > 0.8) color = '#7f1d1d'; 
      else if (intensity > 0.6) color = '#dc2626'; 
      else if (intensity > 0.4) color = '#ea580c'; 
      else if (intensity > 0.2) color = '#f59e0b';
    } 
    else if (viewMode === 'party') {
      const party = loc.winningParty || "DEFAULT";
      // Simple string matching for colors
      const matchedKey = Object.keys(PARTY_COLORS).find(k => party.includes(k.split(' ')[1])) || "DEFAULT";
      color = PARTY_COLORS[matchedKey] || PARTY_COLORS["DEFAULT"];
      opacity = 0.8;
      radius = 8; // Uniform size for territory map
    }
    else if (viewMode === 'audit') {
      // Audit Logic: Flag if votes are 2x the average (Anomaly)
      const isAnomaly = loc.totalVotes > (stats.avg * 1.8);
      color = isAnomaly ? '#ef4444' : '#10b981'; // Red for alert, Green for OK
      radius = isAnomaly ? 15 : 5;
      opacity = isAnomaly ? 0.9 : 0.4;
      stroke = isAnomaly;
    }
    
    return { radius, color, opacity, stroke };
  };

  return (
    <div className="w-full h-full bg-slate-100 relative group">
      <MapContainer 
        // Cast props to prevent TS issues with some React-Leaflet versions
        {...({ center: centerPosition, zoom: 11 } as any)} 
        style={{ height: '100%', width: '100%', background: '#f1f5f9' }}
        zoomControl={false}
      >
        <MapController data={data} />
        
        <TileLayer
          {...({ attribution: '&copy; <a href="https://carto.com/">CARTO</a>' } as any)}
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {data.map((loc, idx) => {
          const { radius, color, opacity, stroke } = getVisuals(loc);
          
          return (
            <CircleMarker
              key={`${loc.name}-${viewMode}-${idx}`}
              center={[loc.lat, loc.lng]}
              pathOptions={{
                color: stroke ? '#ffffff' : color,
                fillColor: color,
                fillOpacity: opacity,
                weight: stroke ? 2 : 1,
                opacity: 0.8,
                className: viewMode === 'audit' && stroke ? 'animate-pulse' : ''
              }}
              // Cast radius to 'any' for React-Leaflet compatibility
              {...({ radius: radius } as any)}
            >
              <Tooltip 
                {...({ direction: "top", offset: [0, -10] } as any)}
                opacity={1}
                className="font-sans font-semibold text-xs border-none shadow-sm text-slate-700"
              >
                {loc.name} {viewMode === 'audit' && color === '#ef4444' ? '(AUDIT ALERT)' : ''}
              </Tooltip>
              
              <Popup closeButton={false} offset={[0, -5]}>
                <div className="font-sans text-slate-800">
                  {/* Header */}
                  <div className={`text-white p-3 ${viewMode === 'audit' && color === '#ef4444' ? 'bg-red-600' : 'bg-slate-900'}`}>
                    <div className="flex items-start justify-between">
                       <div>
                         <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider mb-0.5">{loc.parentLocation}</p>
                         <h3 className="text-sm font-bold leading-tight">{loc.name}</h3>
                       </div>
                       {viewMode === 'audit' && color === '#ef4444' 
                          ? <ShieldAlert className="w-5 h-5 text-white" />
                          : <MapPin className="w-4 h-4 text-slate-400 mt-1" />
                       }
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-3 bg-white">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                      <div className="flex items-center text-slate-600 text-xs font-medium">
                        <Users className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        Total Votos
                      </div>
                      <span className="text-sm font-bold text-slate-900">{loc.totalVotes}</span>
                    </div>

                    <div className="space-y-2">
                       <p className="text-[10px] font-semibold text-slate-400 uppercase">
                         {viewMode === 'party' ? 'Partidos Dominantes' : 'Candidatos Líderes'}
                       </p>
                       
                       {/* Show Parties if mode is party, else candidates */}
                       {viewMode === 'party' 
                         ? Object.entries(loc.parties)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .slice(0, 3)
                            .map(([name, count], i) => (
                              <div key={name} className="flex justify-between items-center text-xs">
                                 <span className="truncate max-w-[140px] text-slate-700 font-medium">{name}</span>
                                 <span className="font-mono text-slate-500">{count}</span>
                              </div>
                            ))
                         : Object.entries(loc.candidates)
                            .sort((a, b) => (b[1] as number) - (a[1] as number))
                            .slice(0, 3)
                            .map(([name, count], i) => (
                              <div key={name} className="flex justify-between items-center text-xs">
                                 <div className="flex items-center">
                                    <span className={`w-1.5 h-1.5 rounded-full mr-2 ${i === 0 ? 'bg-[#2dd4bf]' : 'bg-slate-300'}`}></span>
                                    <span className="truncate max-w-[140px] text-slate-700 font-medium">{name}</span>
                                 </div>
                                 <span className="font-mono text-slate-500">{count}</span>
                              </div>
                            ))
                        }
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Dynamic Legend */}
      <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg z-[1000] border border-slate-200 min-w-[180px]">
        <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center uppercase tracking-wide">
          {viewMode === 'heatmap' && <><Award className="w-3 h-3 mr-1 text-[#2dd4bf]" /> Densidad de Votos</>}
          {viewMode === 'party' && <><Flag className="w-3 h-3 mr-1 text-[#2dd4bf]" /> Territorio Político</>}
          {viewMode === 'audit' && <><ShieldAlert className="w-3 h-3 mr-1 text-red-500" /> Auditoría E-14</>}
        </h4>
        
        <div className="space-y-1.5">
          {viewMode === 'heatmap' && (
            <>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#fbbf24] opacity-80"></span><span className="text-[10px] text-slate-600">Baja</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ea580c] opacity-80"></span><span className="text-[10px] text-slate-600">Media</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#7f1d1d] opacity-80"></span><span className="text-[10px] text-slate-600">Alta</span></div>
            </>
          )}
          {viewMode === 'party' && (
             <>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#0ea5e9]"></span><span className="text-[10px] text-slate-600">C. Democrático</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ef4444]"></span><span className="text-[10px] text-slate-600">Liberal</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#64748b]"></span><span className="text-[10px] text-slate-600">Otros</span></div>
            </>
          )}
          {viewMode === 'audit' && (
             <>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#10b981]"></span><span className="text-[10px] text-slate-600">Verificado OK</span></div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ef4444] animate-pulse"></span><span className="text-[10px] text-slate-600">Anomalía Detectada</span></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoteMap;