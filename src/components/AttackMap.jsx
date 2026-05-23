import { useMemo } from 'react';

/* Fixed server position (US East Coast) */
const SERVER = { x: 218, y: 162 };

/* Simplified continent SVG paths (1000×500 equirectangular) */
const CONTINENTS = [
  { id:'na', d:'M88,75 L178,52 L252,65 L285,88 L295,142 L280,195 L258,245 L225,268 L175,270 L130,248 L96,210 L72,168 L68,122Z' },
  { id:'gl', d:'M302,28 L372,18 L392,48 L358,74 L298,65Z' },
  { id:'ca', d:'M195,272 L218,282 L215,300 L198,305 L188,292Z' },
  { id:'sa', d:'M218,295 L278,270 L312,298 L320,375 L292,440 L250,455 L210,428 L194,368 L200,315Z' },
  { id:'eu', d:'M435,65 L538,52 L572,72 L578,108 L554,142 L516,162 L470,155 L446,128 L440,98Z' },
  { id:'sc', d:'M475,38 L525,30 L545,52 L530,72 L502,78 L476,64Z' },
  { id:'uk', d:'M430,82 L452,76 L464,92 L448,112 L430,108Z' },
  { id:'af', d:'M448,168 L560,162 L612,198 L622,282 L595,360 L546,408 L488,412 L446,365 L434,284 L438,222Z' },
  { id:'ar', d:'M556,175 L620,168 L640,195 L626,228 L578,235 L550,208Z' },
  { id:'ru', d:'M538,35 L740,28 L855,42 L935,78 L942,118 L918,138 L845,130 L758,118 L662,108 L585,92 L554,68Z' },
  { id:'in', d:'M616,148 L700,138 L742,162 L748,208 L720,235 L666,232 L626,200 L616,172Z' },
  { id:'cn', d:'M735,92 L852,82 L920,114 L915,164 L868,194 L810,200 L752,180 L728,148Z' },
  { id:'jp', d:'M886,108 L913,102 L922,128 L906,150 L884,140Z' },
  { id:'se', d:'M736,205 L810,195 L845,218 L850,248 L808,262 L760,252 L736,232Z' },
  { id:'au', d:'M775,325 L892,315 L952,358 L948,418 L900,452 L830,455 L776,420 L758,375Z' },
  { id:'nz', d:'M955,415 L978,405 L988,428 L970,448 L952,435Z' },
];

/* Region labels */
const REGION_LABELS = [
  { x: 178, y: 160, text: 'North America' },
  { x: 250, y: 380, text: 'South America' },
  { x: 488, y: 118, text: 'Europe' },
  { x: 510, y: 295, text: 'Africa' },
  { x: 730, y: 85,  text: 'Asia' },
  { x: 855, y: 390, text: 'Australia' },
];

/* Map threat IP to approximate map coordinates */
function ipToCoords(ip) {
  const [a, b = 0, c = 0] = ip.split('.').map(Number);
  if (a === 10)  return { x: 492 + (b % 36), y: 112 + (c % 28) }; // Europe
  if (a === 172) return { x: 722 + (b % 45), y: 155 + (c % 38) }; // East Asia
  if (a === 192) return { x: 200 + (b % 38), y: 152 + (c % 28) }; // North America
  if (a === 203) return { x: 858 + (b % 28), y: 255 + (c % 28) }; // SE Asia/Pacific
  // Hash-based fallback for public IPs
  const hash = (a * 256 + b) % 6;
  return [
    { x: 185, y: 158 }, { x: 245, y: 375 }, { x: 490, y: 118 },
    { x: 512, y: 278 }, { x: 718, y: 158 }, { x: 872, y: 362 },
  ][hash];
}

function extractIP(log) {
  const m = log?.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  return m ? m[1] : null;
}

/* Dot-grid background */
function DotGrid() {
  return (
    <g opacity="0.3">
      {Array.from({ length: 50 }, (_, col) =>
        Array.from({ length: 25 }, (_, row) => (
          <circle key={`${col}-${row}`} cx={col * 20 + 10} cy={row * 20 + 10} r="0.6" fill="#1e293b" />
        ))
      )}
    </g>
  );
}

/* Attacker dot with triple pulsing rings */
function AttackerDot({ pos, color = '#ef4444' }) {
  return (
    <g>
      <circle cx={pos.x} cy={pos.y} r="4" fill={color} />
      {[0, 1, 2].map(i => (
        <circle key={i} cx={pos.x} cy={pos.y} r="4" fill="none"
          stroke={color} strokeWidth="1.2"
          className={`svg-pulse${i > 0 ? ` svg-pulse-d${i}` : ''}`}
        />
      ))}
    </g>
  );
}

/* Animated dashed line from attacker to server */
function AttackLine({ from, to }) {
  return (
    <line
      x1={from.x} y1={from.y} x2={to.x} y2={to.y}
      stroke="#ef4444" strokeWidth="1.2" strokeOpacity="0.55"
      className="attack-line"
    />
  );
}

export default function AttackMap({ threats = [] }) {
  const attackers = useMemo(() => {
    const seen = {};
    threats
      .filter(t => t.level !== 'FALSE_POSITIVE')
      .forEach(t => {
        const ip = extractIP(t.log);
        if (ip && !seen[ip]) seen[ip] = { ip, pos: ipToCoords(ip), level: t.level };
      });
    return Object.values(seen);
  }, [threats]);

  return (
    <div className="rounded-2xl border border-slate-700/50 overflow-hidden"
         style={{ background: '#040810' }}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between"
           style={{ background: 'rgba(8,12,20,0.8)' }}>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-base">Live Attack Map</span>
          <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold tracking-widest">LIVE</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {attackers.length} threat source{attackers.length !== 1 ? 's' : ''} detected
          </span>
        </div>
      </div>

      {/* SVG Map */}
      <div className="relative">
        <svg viewBox="0 0 1000 500" style={{ height: '300px', width: '100%', display: 'block' }}>
          {/* Ocean */}
          <rect width="1000" height="500" fill="#040810" />

          {/* Dot grid */}
          <DotGrid />

          {/* Continents */}
          {CONTINENTS.map(c => (
            <path key={c.id} d={c.d} fill="#0f1a2e" stroke="#1e3a5f" strokeWidth="0.7" />
          ))}

          {/* Region labels */}
          {REGION_LABELS.map(l => (
            <text key={l.text} x={l.x} y={l.y} fill="#1e3a5f" fontSize="9"
                  fontFamily="system-ui" textAnchor="middle" style={{ userSelect: 'none' }}>
              {l.text}
            </text>
          ))}

          {/* Attack lines */}
          {attackers.map(a => (
            <AttackLine key={a.ip} from={a.pos} to={SERVER} />
          ))}

          {/* Server dot (green) */}
          <AttackerDot pos={SERVER} color="#10b981" />
          <text x={SERVER.x + 8} y={SERVER.y - 8} fill="#10b981" fontSize="7.5"
                fontFamily="monospace" style={{ userSelect: 'none' }}>
            ◆ YOUR SERVER
          </text>

          {/* Attacker dots + IP labels */}
          {attackers.map(a => (
            <g key={a.ip}>
              <AttackerDot pos={a.pos} color={a.level === 'CRITICAL' ? '#ef4444' : '#f59e0b'} />
              <text x={a.pos.x + 9} y={a.pos.y + 4} fill={a.level === 'CRITICAL' ? '#fca5a5' : '#fde68a'}
                    fontSize="7" fontFamily="monospace" style={{ userSelect: 'none' }}>
                {a.ip}
              </text>
            </g>
          ))}

          {/* Scan overlay — faint horizontal sweep */}
          <defs>
            <linearGradient id="scanline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
              <stop offset="50%" stopColor="#22d3ee" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="1000" height="500" fill="url(#scanline)" />
        </svg>
      </div>

      {/* Legend */}
      <div className="px-5 py-3 border-t border-slate-700/30 flex items-center gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Critical source</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />Medium source</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Protected server</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed border-red-500/60" />
          Attack vector
        </span>
      </div>
    </div>
  );
}
