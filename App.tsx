import React, { useState, useEffect, useRef, useMemo } from 'react';
import { VoteRecord, LocationData, ChatMessage, ViewMode, FilterState } from './types';
import { SAMPLE_CSV_DATA } from './constants';
import { parseCSV, aggregateByLocation } from './utils/csvParser';
import VoteMap from './components/VoteMap';
import { initializeChat, sendMessageToChat } from './services/geminiService';
import { 
  Database, 
  Upload, 
  Send, 
  MapPin, 
  Navigation, 
  Megaphone,
  Search,
  Bell,
  Calendar,
  Activity,
  FileText,
  Filter,
  BarChart3,
  ShieldCheck,
  Radio,
  Layers,
  FileDigit,
  Bot
} from 'lucide-react';

function App() {
  const [rawData, setRawData] = useState<VoteRecord[]>([]);
  const [aggregatedData, setAggregatedData] = useState<LocationData[]>([]);
  
  // App State
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [filters, setFilters] = useState<FilterState>({ minVotes: 0, party: 'ALL', candidate: 'ALL' });
  const [isLive, setIsLive] = useState(false);
  const [dataSource, setDataSource] = useState<'CSV' | 'E14_STREAM'>('CSV');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derived Data Lists for Filters
  const uniqueParties = useMemo(() => Array.from(new Set(rawData.map(r => r.partyName))).sort(), [rawData]);
  const uniqueCandidates = useMemo(() => Array.from(new Set(rawData.map(r => r.candidateName))).sort(), [rawData]);

  // Data Loading
  useEffect(() => {
    const parsed = parseCSV(SAMPLE_CSV_DATA);
    setRawData(parsed);
    setAggregatedData(aggregateByLocation(parsed));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => console.log("Geolocation error:", error)
      );
    }
  }, []);

  // Filter Logic
  const filteredData = useMemo(() => {
    let data = aggregatedData;

    // Filter by Party (Location must have at least 1 vote for this party)
    if (filters.party !== 'ALL') {
      data = data.filter(d => (d.parties[filters.party] || 0) > 0);
    }

    // Filter by Candidate
    if (filters.candidate !== 'ALL') {
      data = data.filter(d => (d.candidates[filters.candidate] || 0) > 0);
    }

    // Min Votes Threshold
    data = data.filter(d => d.totalVotes >= filters.minVotes);

    return data;
  }, [aggregatedData, filters]);

  // Analytics Logic (Top Lists based on filtered view)
  const analytics = useMemo(() => {
    const partyTotals: Record<string, number> = {};
    const candidateTotals: Record<string, number> = {};
    
    // We must iterate through rawData but filter it based on the location logic roughly
    // Or simpler: Re-aggregate based on filtered locations
    // For speed, let's just sum up the visible LocationData candidates/parties
    
    filteredData.forEach(loc => {
      Object.entries(loc.parties).forEach(([p, v]) => {
         if (filters.party === 'ALL' || filters.party === p) {
            partyTotals[p] = (partyTotals[p] || 0) + (v as number);
         }
      });
      Object.entries(loc.candidates).forEach(([c, v]) => {
         if (filters.candidate === 'ALL' || filters.candidate === c) {
           candidateTotals[c] = (candidateTotals[c] || 0) + (v as number);
         }
      });
    });

    return {
      topParties: Object.entries(partyTotals).sort((a,b) => b[1] - a[1]).slice(0, 5),
      topCandidates: Object.entries(candidateTotals).sort((a,b) => b[1] - a[1]).slice(0, 5)
    };
  }, [filteredData, filters]);


  // Initialize Chat
  useEffect(() => {
    if (aggregatedData.length > 0) {
      initializeChat({ data: aggregatedData, userLocation });
      if (messages.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'model',
          text: 'Sistema de Auditoría Electoral iniciado. Puedo analizar formatos E-14 y anomalías en tiempo real.'
        }]);
      }
    }
  }, [aggregatedData, userLocation]);

  // Live Simulation Effect
  useEffect(() => {
    let interval: any;
    if (isLive && dataSource === 'E14_STREAM') {
      interval = setInterval(() => {
        // Simulate incoming E-14 data by increasing random votes
        setAggregatedData(prev => prev.map(loc => {
          if (Math.random() > 0.7) {
             const increase = Math.floor(Math.random() * 5);
             return { ...loc, totalVotes: loc.totalVotes + increase };
          }
          return loc;
        }));
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isLive, dataSource]);

  // Chat Handlers
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);
    const response = await sendMessageToChat(text);
    const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: response.text, groundingChunks: response.groundingChunks };
    setMessages(prev => [...prev, botMsg]);
    setIsTyping(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setRawData(parsed);
        setAggregatedData(aggregateByLocation(parsed));
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8] text-slate-800 font-sans">
      
      {/* Top Nav */}
      <nav className="h-16 bg-[#1e293b] text-white flex items-center justify-between px-6 shadow-md sticky top-0 z-50">
        <div className="flex items-center space-x-3">
           <Activity className="w-6 h-6 text-[#2dd4bf]" />
           <span className="text-xl font-bold tracking-tight">VotoFlow <span className="font-light text-slate-400">Audit</span></span>
        </div>
        
        {/* Data Source Selector (E14/CSV) */}
        <div className="hidden md:flex items-center bg-[#0f172a] rounded-lg p-1 space-x-1 border border-slate-700">
           <button 
             onClick={() => { setDataSource('CSV'); setIsLive(false); }}
             className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center ${dataSource === 'CSV' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
           >
             <Upload className="w-3 h-3 mr-2" /> Carga CSV
           </button>
           <button 
             onClick={() => setDataSource('E14_STREAM')}
             className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center ${dataSource === 'E14_STREAM' ? 'bg-[#2dd4bf] text-[#0f172a]' : 'text-slate-400 hover:text-white'}`}
           >
             <FileDigit className="w-3 h-3 mr-2" /> E-14 Real-Time
           </button>
        </div>

        <div className="flex items-center space-x-4">
           {dataSource === 'E14_STREAM' && (
             <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span className="text-xs text-slate-300 uppercase font-semibold">{isLive ? 'CONECTADO' : 'OFFLINE'}</span>
                <button onClick={() => setIsLive(!isLive)} className="text-xs border border-slate-600 px-2 py-1 rounded hover:bg-slate-800">
                   {isLive ? 'Pausar' : 'Iniciar'}
                </button>
             </div>
           )}
           <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
             <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" alt="User" />
           </div>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
         
         <div className="col-span-1 lg:col-span-12 flex justify-between items-end mb-2">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Auditoría Electoral: Antioquia</h1>
              <p className="text-sm text-slate-500">Visualización y segregación de datos electorales en tiempo real.</p>
            </div>
         </div>

         {/* Left Column (Controls & Analytics) */}
         <div className="col-span-1 lg:col-span-3 flex flex-col gap-6 order-2 lg:order-1">
            
            {/* Control Panel */}
            <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-200">
               <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center">
                  <Filter className="w-4 h-4 mr-2 text-[#2dd4bf]" /> Filtros y Segmentación
               </h3>
               
               <div className="space-y-4">
                  <div>
                     <label className="text-xs font-semibold text-slate-500 mb-1 block">Modo de Visualización</label>
                     <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => setViewMode('heatmap')} className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${viewMode === 'heatmap' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                           Calor
                        </button>
                        <button onClick={() => setViewMode('party')} className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${viewMode === 'party' ? 'bg-[#2dd4bf] text-white border-[#2dd4bf]' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                           Partido
                        </button>
                        <button onClick={() => setViewMode('audit')} className={`p-2 rounded-lg text-xs font-medium border text-center transition-all ${viewMode === 'audit' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                           Auditoría
                        </button>
                     </div>
                  </div>

                  <div>
                     <label className="text-xs font-semibold text-slate-500 mb-1 block">Filtrar por Partido</label>
                     <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-[#2dd4bf]"
                        value={filters.party}
                        onChange={(e) => setFilters({...filters, party: e.target.value})}
                     >
                        <option value="ALL">Todos los Partidos</option>
                        {uniqueParties.map(p => <option key={p} value={p}>{p}</option>)}
                     </select>
                  </div>

                  <div>
                     <label className="text-xs font-semibold text-slate-500 mb-1 block">Filtrar por Candidato</label>
                     <select 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-[#2dd4bf]"
                        value={filters.candidate}
                        onChange={(e) => setFilters({...filters, candidate: e.target.value})}
                     >
                        <option value="ALL">Todos los Candidatos</option>
                        {uniqueCandidates.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                  </div>
               </div>
            </div>

            {/* Dynamic Analytics (Replacing Static Stats) */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
               <div className="bg-[#1e293b] text-white px-4 py-3 text-sm font-medium flex justify-between items-center">
                  <span>Análisis de Segmento</span>
                  <BarChart3 className="w-4 h-4 text-[#2dd4bf]" />
               </div>
               <div className="p-4 space-y-4">
                  <div>
                     <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Top Candidatos (Filtrado)</p>
                     <div className="space-y-2">
                        {analytics.topCandidates.map(([name, votes], idx) => (
                           <div key={name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                 <span className="font-bold text-slate-700 w-4">{idx+1}.</span>
                                 <span className="text-slate-600 truncate max-w-[120px]">{name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-[#2dd4bf] h-full" style={{ width: '60%' }}></div>
                                 </div>
                                 <span className="font-mono font-medium">{votes}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                     <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2">Distribución por Partido</p>
                     <div className="space-y-2">
                        {analytics.topParties.map(([name, votes], idx) => (
                           <div key={name} className="flex justify-between text-xs">
                              <span className="text-slate-600 truncate max-w-[150px]">{name}</span>
                              <span className="font-bold text-slate-800">{votes}</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </div>

         </div>

         {/* Center Column (Map) */}
         <div className="col-span-1 lg:col-span-6 order-1 lg:order-2">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px] lg:h-[700px] border border-slate-200">
               <div className="bg-white border-b border-slate-100 px-4 py-3 text-sm font-medium flex justify-between items-center">
                  <div className="flex items-center gap-2">
                     <Layers className="w-4 h-4 text-slate-400" />
                     <span className="text-slate-700">Georeferenciación E-14 / E-24</span>
                  </div>
                  <div className="flex space-x-2 text-xs">
                     <span className={`px-2 py-0.5 rounded font-semibold ${viewMode === 'audit' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                        {viewMode === 'audit' ? 'MODO AUDITORÍA ACTIVO' : 'Visualización Estándar'}
                     </span>
                  </div>
               </div>
               <div className="flex-1 relative bg-slate-100">
                  <VoteMap data={filteredData} viewMode={viewMode} />
               </div>
            </div>
         </div>

         {/* Right Column (Chat & Actions) */}
         <div className="col-span-1 lg:col-span-3 flex flex-col gap-6 order-3">
             <div className="bg-[#ccfbf1] p-6 rounded-xl space-y-4">
               <h3 className="text-[#115e59] font-bold text-sm uppercase tracking-wide mb-2 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-2" /> Auditoría Rápida
               </h3>
               
               <button onClick={() => handleSendMessage("Analiza las discrepancias entre los formularios E-14 y E-24 en la Comuna 14.")} className="w-full bg-white hover:bg-white/80 text-[#0f766e] text-xs font-semibold py-3 px-4 rounded-lg shadow-sm text-left flex items-center transition-all">
                  <Activity className="w-4 h-4 mr-3 text-red-500" />
                  Verificar Discrepancias
               </button>

               <button onClick={() => handleSendMessage("Genera un reporte de las mesas con más del 90% de participación (posible anomalía).")} className="w-full bg-white hover:bg-white/80 text-[#0f766e] text-xs font-semibold py-3 px-4 rounded-lg shadow-sm text-left flex items-center transition-all">
                  <FileText className="w-4 h-4 mr-3 text-[#2dd4bf]" />
                  Reporte de Anomalías
               </button>
            </div>

            {/* Chat Widget */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[400px] border border-slate-200">
               <div className="bg-[#1e293b] text-white px-4 py-3 text-sm font-medium flex justify-between items-center">
                  <span>Asistente de Auditoría</span>
                  <Bot className="w-4 h-4 text-[#2dd4bf]" />
               </div>
               
               {/* Messages */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs shadow-sm ${
                          msg.role === 'user' ? 'bg-[#0f766e] text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'
                       }`}>
                          <div className="whitespace-pre-wrap leading-relaxed">
                             {msg.role === 'model' 
                               ? <div dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                               : msg.text
                             }
                          </div>
                          {msg.groundingChunks && msg.groundingChunks.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {msg.groundingChunks.map((chunk, idx) => chunk.maps && (
                                <a key={idx} href={chunk.maps.uri} target="_blank" className="flex items-center text-[10px] bg-slate-100 p-1.5 rounded text-blue-600 hover:underline">
                                  <MapPin className="w-3 h-3 mr-1" /> {chunk.maps.title}
                                </a>
                              ))}
                            </div>
                          )}
                       </div>
                    </div>
                  ))}
                  {isTyping && (
                     <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-xl rounded-bl-none px-3 py-2 shadow-sm">
                           <div className="flex space-x-1">
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                           </div>
                        </div>
                     </div>
                  )}
                  <div ref={messagesEndRef} />
               </div>

               {/* Input */}
               <div className="p-3 bg-white border-t border-slate-100">
                  <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }} className="relative">
                     <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Consulte sobre mesas o candidatos..."
                        className="w-full bg-slate-100 text-slate-800 text-xs rounded-lg pl-3 pr-10 py-2.5 outline-none focus:ring-1 focus:ring-[#2dd4bf]"
                     />
                     <button type="submit" disabled={!inputValue.trim() || isTyping} className="absolute right-1 top-1 p-1.5 bg-[#0f766e] text-white rounded-md hover:bg-[#115e59] transition-colors disabled:opacity-50">
                        <Send className="w-3 h-3" />
                     </button>
                  </form>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

export default App;