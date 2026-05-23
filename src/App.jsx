import { useState, useEffect, useRef } from 'react';
import AttackMap from './components/AttackMap';
import ChatAssistant from './components/ChatAssistant';
import ExecutiveSummary from './components/ExecutiveSummary';

/* ── Constants ── */
const SAMPLE_LOGS = `192.168.1.105 - - [23/May/2026:14:32:11 +0000] "GET /admin/login?user=admin'--&pass=x HTTP/1.1" 200 4523
192.168.1.42 - - [23/May/2026:14:32:45 +0000] "POST /api/auth/login HTTP/1.1" 401 - (attempt 1/5)
192.168.1.42 - - [23/May/2026:14:32:46 +0000] "POST /api/auth/login HTTP/1.1" 401 - (attempt 2/5)
192.168.1.42 - - [23/May/2026:14:32:47 +0000] "POST /api/auth/login HTTP/1.1" 401 - (attempt 3/5)
192.168.1.42 - - [23/May/2026:14:32:48 +0000] "POST /api/auth/login HTTP/1.1" 401 - (attempt 4/5)
192.168.1.42 - - [23/May/2026:14:32:49 +0000] "POST /api/auth/login HTTP/1.1" 401 - (attempt 5/5)
10.0.0.55 - - [23/May/2026:14:33:01 +0000] "GET /search?q=<script>alert('xss')</script> HTTP/1.1" 200 1234
203.0.113.77 - - [23/May/2026:14:33:15 +0000] "GET /robots.txt HTTP/1.1" 200 96
172.16.0.88 - - [23/May/2026:14:33:22 +0000] "GET /api/users/../../../../etc/passwd HTTP/1.1" 403 512
192.168.1.200 - - [23/May/2026:14:33:30 +0000] "GET /static/logo.png HTTP/1.1" 200 8192
10.0.0.99 - - [23/May/2026:14:34:05 +0000] "POST /api/execute?cmd=whoami HTTP/1.1" 500 245`;

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

const LEVEL_CONFIG = {
  CRITICAL:       { bg:'bg-red-950/40',     border:'border-red-500/50',    badge:'bg-red-600 text-white',       text:'text-red-400',    dot:'bg-red-400' },
  MEDIUM:         { bg:'bg-yellow-950/30',  border:'border-yellow-500/35', badge:'bg-yellow-600 text-white',    text:'text-yellow-400', dot:'bg-yellow-400' },
  LOW:            { bg:'bg-emerald-950/20', border:'border-emerald-600/30',badge:'bg-emerald-700 text-white',   text:'text-emerald-400',dot:'bg-emerald-400' },
  FALSE_POSITIVE: { bg:'bg-slate-800/25',   border:'border-slate-600/30',  badge:'bg-slate-600 text-slate-200', text:'text-slate-400',  dot:'bg-slate-500' },
};

/* Fake live-monitor event pool */
const LIVE_POOL = [
  { log:'45.33.32.156 - - [LIVE] "GET /wp-admin/setup-config.php HTTP/1.1" 404 162', level:'MEDIUM',   type:'WordPress Scan',           explanation:'Automated scanner probing for WordPress admin installation path.', fix:'Block IP at WAF. Disable xmlrpc.php.' },
  { log:'195.78.54.149 - - [LIVE] "POST /api/auth HTTP/1.1" 401 - (attempt 1/50)',   level:'CRITICAL',  type:'Credential Stuffing',      explanation:'High-volume credential stuffing using leaked database. 50 attempts in seconds.', fix:'Enable MFA, account lockout, CAPTCHA immediately.' },
  { log:'198.51.100.42 - - [LIVE] "GET /actuator/env HTTP/1.1" 200 4521',            level:'CRITICAL',  type:'Spring Boot Actuator Leak', explanation:'Actuator endpoint exposed environment variables including database credentials.', fix:'Disable actuator in production. Rotate all secrets now.' },
  { log:'185.220.101.47 - - [LIVE] "GET /etc/passwd HTTP/1.1" 403 285',              level:'MEDIUM',   type:'Directory Traversal',      explanation:'Tor exit node probing for path traversal. Server blocked the request (403).', fix:'Block Tor exit nodes. Verify path sanitization.' },
  { log:'91.108.56.119 - - [LIVE] "GET /config.php.bak HTTP/1.1" 200 8934',          level:'CRITICAL',  type:'Backup File Exposure',     explanation:'Attacker downloaded backup config containing plaintext credentials.', fix:'Remove backup files immediately. Rotate credentials.' },
  { log:'207.154.255.1 - - [LIVE] "GET /api/users?role=admin HTTP/1.1" 200 12445',   level:'LOW',      type:'Privilege Enumeration',    explanation:'Admin user list was publicly accessible via API parameter.', fix:'Implement authorization checks on all admin endpoints.' },
  { log:'5.188.62.214 - - [LIVE] "POST /upload.php HTTP/1.1" 200 - (shell.php)',     level:'CRITICAL',  type:'Web Shell Upload',         explanation:'PHP web shell uploaded via unvalidated file upload endpoint — full RCE.', fix:'Remove shell, restrict uploads, scan for persistence.' },
  { log:'103.240.192.35 - - [LIVE] "POST /graphql HTTP/1.1" 200 - (introspection)',  level:'MEDIUM',   type:'GraphQL Introspection',    explanation:'Schema introspection maps all mutations for targeted exploitation.', fix:'Disable introspection in production. Add rate limiting.' },
];

/* ── Animated counter hook ── */
function useCountUp(target, duration = 950) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) { setVal(0); return; }
    let start = null, raf;
    const step = ts => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ── Typewriter hook ── */
function useTypewriter(text, speed = 18) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    setTyped('');
    if (!text) return;
    let i = 0;
    const t = setInterval(() => {
      setTyped(text.slice(0, ++i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text]);
  return typed;
}

/* ── Helpers ── */
function extractIP(log) {
  return log?.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/)?.[1] ?? null;
}

function ipRiskScore(ip, level) {
  if (!ip) return null;
  const hash = ip.split('.').reduce((s, p) => s + parseInt(p, 10), 0);
  const [base, range] = { CRITICAL:[82,17], MEDIUM:[52,26], LOW:[18,28], FALSE_POSITIVE:[4,11] }[level] ?? [20,30];
  return base + (hash % (range + 1));
}

function calcThreatPercent(summary, total) {
  if (!total) return 0;
  return Math.min(Math.round(((summary.critical * 3 + summary.medium * 1.5 + summary.low * 0.5) / (total * 3)) * 100), 100);
}

function getThreatMeta(pct) {
  if (pct >= 75) return { label:'CRITICAL', color:'text-red-400',    bar:'linear-gradient(90deg,#991b1b,#ef4444)', glow:'rgba(239,68,68,0.5)' };
  if (pct >= 50) return { label:'HIGH',     color:'text-orange-400', bar:'linear-gradient(90deg,#c2410c,#fb923c)', glow:'rgba(251,146,60,0.4)' };
  if (pct >= 25) return { label:'ELEVATED', color:'text-yellow-400', bar:'linear-gradient(90deg,#a16207,#fbbf24)', glow:'rgba(251,191,36,0.35)' };
  return          { label:'SECURE',   color:'text-emerald-400', bar:'linear-gradient(90deg,#065f46,#34d399)', glow:'rgba(52,211,153,0.3)' };
}

/* ── Threat Intel ── */
const ATTACKER_PROFILES = [
  { name:'Script Kiddie',         icon:'👾', color:'text-blue-400',   bg:'bg-blue-900/20',   border:'border-blue-700/30' },
  { name:'Cybercriminal',         icon:'💀', color:'text-red-400',    bg:'bg-red-900/20',    border:'border-red-700/30' },
  { name:'Hacktivist',            icon:'🏴', color:'text-yellow-400', bg:'bg-yellow-900/20', border:'border-yellow-700/30' },
  { name:'APT Group',             icon:'🎯', color:'text-purple-400', bg:'bg-purple-900/20', border:'border-purple-700/30' },
  { name:'State-Sponsored Actor', icon:'🌐', color:'text-orange-400', bg:'bg-orange-900/20', border:'border-orange-700/30' },
];

function getThreatIntel(ip, level) {
  if (!ip) return null;
  const hash = ip.split('.').reduce((s, p) => s + parseInt(p, 10), 0);
  const profileIdx = level === 'CRITICAL' ? (2 + hash % 3) : level === 'MEDIUM' ? (1 + hash % 3) : hash % 3;
  const profile = ATTACKER_PROFILES[profileIdx % 5];
  const baseScore = { CRITICAL:7, MEDIUM:4, LOW:2 }[level] ?? 2;
  const sophistication = Math.min(10, baseScore + (hash % 4));
  const similarBase = { CRITICAL:800, MEDIUM:280, LOW:45 }[level] ?? 20;
  const similarIn24h = similarBase + (hash % 500);
  const responseTime = { CRITICAL:'IMMEDIATE (< 15 min)', MEDIUM:'< 4 hours', LOW:'< 24 hours' }[level] ?? 'Monitor';
  return { profile, sophistication, similarIn24h, responseTime };
}

/* ── Alert sound via Web Audio ── */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1108, 0.2], [880, 0.4]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + offset);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + offset + 0.04);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.14);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.18);
    });
  } catch { /* AudioContext blocked */ }
}

/* ── Icons ── */
function ShieldIcon({ className = 'w-6 h-6' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
}
function AlertIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}
function CheckCircleIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
}
function InfoIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
}
function SpinnerIcon() {
  return <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>;
}
function BoltIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
}
function CopyIcon({ className = 'w-4 h-4' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>;
}
function WarningIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}
function RadioIcon({ className = 'w-5 h-5' }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 010 8.49m-8.48-.01a6 6 0 010-8.49m11.31-2.82a10 10 0 010 14.14m-14.14 0a10 10 0 010-14.14" /></svg>;
}

/* ── Stat card ── */
function StatCard({ label, count, iconColor, cardBorder, cardBg, icon }) {
  const animated = useCountUp(count);
  return (
    <div className={`rounded-xl border ${cardBorder} ${cardBg} p-5 flex items-center gap-4`}>
      <div className={`${iconColor} p-2.5 rounded-xl bg-black/20`}>{icon}</div>
      <div>
        <div className="text-3xl font-bold text-white tabular-nums">{animated}</div>
        <div className="text-xs text-slate-500 mt-0.5 font-medium uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

/* ── IP Risk Badge ── */
function IPRiskBadge({ ip, level }) {
  const score = ipRiskScore(ip, level);
  if (!score || !ip) return null;
  const dot = score >= 80 ? '🔴' : score >= 50 ? '🟡' : '🟢';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-600/60 text-slate-300 font-mono whitespace-nowrap">
      IP Risk: {score}/100 {dot}
    </span>
  );
}

/* ── Threat Intel Panel ── */
function ThreatIntelPanel({ ip, level }) {
  const intel = getThreatIntel(ip, level);
  if (!intel) return null;
  const { profile, sophistication, similarIn24h, responseTime } = intel;
  const barColor = sophistication >= 8 ? 'bg-red-500' : sophistication >= 5 ? 'bg-yellow-500' : 'bg-blue-500';
  const rtColor  = level === 'CRITICAL' ? 'text-red-400 font-bold' : 'text-yellow-400';

  return (
    <div className="border border-slate-700/40 rounded-lg p-3.5 space-y-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
      <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-bold">
        <span>Threat Intelligence</span>
        <span className="font-mono">{ip}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Profile */}
        <div className={`rounded-lg p-2.5 ${profile.bg} border ${profile.border}`}>
          <div className="text-[10px] text-slate-500 mb-1">Attacker Profile</div>
          <div className={`font-semibold text-sm ${profile.color}`}>{profile.icon} {profile.name}</div>
        </div>
        {/* Response time */}
        <div className="rounded-lg p-2.5 bg-black/20 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 mb-1">Response Time</div>
          <div className={`text-sm font-semibold ${rtColor}`}>{responseTime}</div>
        </div>
        {/* Sophistication */}
        <div className="rounded-lg p-2.5 bg-black/20 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 mb-1.5">Attack Sophistication</div>
          <div className="flex gap-0.5 mb-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`h-2 flex-1 rounded-sm ${i < sophistication ? barColor : 'bg-slate-700'}`} />
            ))}
          </div>
          <div className="text-[10px] text-slate-400">{sophistication}/10</div>
        </div>
        {/* Similar attacks */}
        <div className="rounded-lg p-2.5 bg-black/20 border border-slate-700/30">
          <div className="text-[10px] text-slate-500 mb-1">Similar Attacks (24h)</div>
          <div className="text-2xl font-bold text-white tabular-nums">{similarIn24h.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Threat Card ── */
function ThreatCard({ threat }) {
  const ip  = extractIP(threat.log);
  const cfg = LEVEL_CONFIG[threat.level] || LEVEL_CONFIG.LOW;
  const isCritical = threat.level === 'CRITICAL';
  const showIntel  = threat.level === 'CRITICAL' || threat.level === 'MEDIUM';

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5 space-y-3 transition-all hover:brightness-110`}>
      <div className="flex items-center flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-widest uppercase ${cfg.badge}${isCritical ? ' badge-critical' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
          {threat.level.replace('_', ' ')}
        </span>
        <span className="text-white font-semibold text-sm">{threat.type}</span>
        {ip && <IPRiskBadge ip={ip} level={threat.level} />}
      </div>

      <div className="bg-black/50 rounded-lg px-3 py-2.5 font-mono text-xs text-slate-400 break-all leading-relaxed border border-slate-700/50">
        {threat.log}
      </div>

      <div>
        <div className={`text-xs font-bold uppercase tracking-widest mb-1.5 ${cfg.text}`}>AI Analysis</div>
        <p className="text-slate-300 text-sm leading-relaxed">{threat.explanation}</p>
      </div>

      {threat.level !== 'FALSE_POSITIVE' && threat.fix && (
        <div className="bg-emerald-950/30 border border-emerald-700/30 rounded-lg p-3">
          <div className="text-xs font-bold uppercase tracking-widest mb-1.5 text-emerald-400">Recommended Fix</div>
          <p className="text-slate-300 text-sm leading-relaxed">{threat.fix}</p>
        </div>
      )}

      {showIntel && ip && <ThreatIntelPanel ip={ip} level={threat.level} />}
    </div>
  );
}

/* ── Live Monitor Event (with typewriter log line) ── */
function LiveEventCard({ event }) {
  const typed = useTypewriter(event.log, 14);
  const cfg   = LEVEL_CONFIG[event.level] || LEVEL_CONFIG.LOW;
  const done  = typed.length >= event.log.length;

  return (
    <div className="entry-in border border-slate-700/40 rounded-lg px-4 py-3 space-y-2" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-widest ${cfg.badge}${event.level === 'CRITICAL' ? ' badge-critical' : ''}`}>
          {event.level.replace('_', ' ')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono">{event.ts}</span>
          <span className={`text-[10px] font-bold ${done ? 'text-emerald-400' : 'text-cyan-400'}`}>
            {done ? '✓ CLASSIFIED' : '⟳ SCANNING...'}
          </span>
        </div>
      </div>
      <div className={`font-mono text-[11px] text-cyan-300 leading-relaxed break-all${!done ? ' typing-cursor' : ''}`}>
        {typed}
      </div>
      {done && (
        <div className="text-xs text-slate-400 leading-relaxed">
          <span className={`font-semibold ${cfg.text}`}>{event.type}: </span>
          {event.explanation}
        </div>
      )}
    </div>
  );
}

/* ── Cinematic Alert Overlay ── */
function CinematicAlert({ criticalCount, onDone }) {
  useEffect(() => {
    playAlertSound();
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[999] pointer-events-none">
      {/* Screen flash */}
      <div className="absolute inset-0 bg-red-600 screen-flash" />
      {/* Banner */}
      <div className="cinematic-banner absolute top-0 left-0 right-0 flex justify-center pt-0">
        <div className="w-full flex items-center justify-center gap-4 py-5 px-8"
             style={{ background: 'linear-gradient(135deg,#7f1d1d,#dc2626)', boxShadow: '0 8px 40px rgba(239,68,68,0.6)' }}>
          <div className="text-4xl">🚨</div>
          <div>
            <div className="text-2xl font-bold text-white tracking-wider">CRITICAL THREAT DETECTED</div>
            <div className="text-red-200 text-sm mt-0.5 tracking-widest">
              {criticalCount} CRITICAL ATTACK{criticalCount > 1 ? 'S' : ''} IDENTIFIED — IMMEDIATE ACTION REQUIRED
            </div>
          </div>
          <div className="text-4xl">🚨</div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ MAIN APP ══════════════ */
export default function App() {
  const [logs, setLogs]           = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState('');
  const [filter, setFilter]       = useState('ALL');
  const [barWidth, setBarWidth]   = useState(0);
  const [copied, setCopied]       = useState(false);
  const [cinematic, setCinematic] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [liveEvents, setLiveEvents]     = useState([]);
  const [liveCount, setLiveCount]       = useState(0);
  const monitorRef = useRef(null);
  const livePoolIdx = useRef(0);

  const apiKey = (typeof window !== 'undefined' && window.GROQ_KEY)
    || import.meta.env.VITE_GROQ_KEY || '';

  /* Derived values */
  const threatPercent  = result ? calcThreatPercent(result.summary, result.threats.length) : 0;
  const threatMeta     = getThreatMeta(threatPercent);
  const hasCritical    = (result?.summary?.critical || 0) > 0;
  const realThreats    = result?.threats?.filter(t => t.level !== 'FALSE_POSITIVE') || [];
  const falsePositives = result?.threats?.filter(t => t.level === 'FALSE_POSITIVE') || [];
  const shown          = filter === 'ALL' ? realThreats : realThreats.filter(t => t.level === filter);
  const totalThreats   = (result?.summary?.critical || 0) + (result?.summary?.medium || 0) + (result?.summary?.low || 0);

  const coordinatedIPs = (() => {
    if (!result) return [];
    const map = {};
    result.threats.forEach(t => {
      const ip = extractIP(t.log);
      if (ip) map[ip] = (map[ip] || 0) + 1;
    });
    return Object.entries(map).filter(([, c]) => c >= 2).map(([ip]) => ip);
  })();

  /* Animate progress bar */
  useEffect(() => {
    if (result) {
      setBarWidth(0);
      const t = setTimeout(() => setBarWidth(threatPercent), 250);
      return () => clearTimeout(t);
    }
  }, [result, threatPercent]);

  /* Clean up monitor on unmount */
  useEffect(() => () => { if (monitorRef.current) clearInterval(monitorRef.current); }, []);

  /* Live Monitor controls */
  function startMonitor() {
    setIsMonitoring(true);
    setLiveEvents([]);
    setLiveCount(0);
    livePoolIdx.current = 0;
    monitorRef.current = setInterval(() => {
      const event = { ...LIVE_POOL[livePoolIdx.current % LIVE_POOL.length], id: Date.now(), ts: new Date().toLocaleTimeString() };
      livePoolIdx.current++;
      setLiveEvents(prev => [event, ...prev].slice(0, 8));
      setLiveCount(c => c + 1);
    }, 3000);
  }

  function stopMonitor() {
    setIsMonitoring(false);
    clearInterval(monitorRef.current);
  }

  /* Analyze */
  async function analyzeThreats() {
    if (!logs.trim()) { setError('Please paste some security logs first.'); return; }
    if (!apiKey) { setError('Groq API key not found. Set VITE_GROQ_KEY in your .env file.'); return; }
    setLoading(true); setError(''); setResult(null);

    const prompt = `You are a cybersecurity expert. Analyze these security logs and respond ONLY with valid JSON.

For each log classify as CRITICAL, MEDIUM, LOW, or FALSE_POSITIVE.

Return exactly this format:
{
  "threats": [
    {
      "level": "CRITICAL",
      "type": "SQL Injection",
      "explanation": "simple English explanation",
      "fix": "specific fix recommendation",
      "log": "original log line"
    }
  ],
  "summary": {
    "critical": 0,
    "medium": 0,
    "low": 0,
    "false_positive": 0
  }
}

Logs to analyze:
${logs}`;

    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 4096 }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `API error ${res.status}`); }
      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const match   = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('AI returned unexpected format.');
      const parsed  = JSON.parse(match[0]);
      if (!parsed.threats || !parsed.summary) throw new Error('Incomplete AI response.');
      setResult(parsed);
      if (parsed.summary.critical > 0) {
        setTimeout(() => setCinematic(true), 300);
      }
    } catch (e) {
      setError(e.message || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  /* Export report */
  async function exportReport() {
    const ts  = new Date().toLocaleString();
    const lines = [
      `╔${'═'.repeat(58)}╗`,
      `║          SecureAI — Threat Intelligence Report           ║`,
      `║  ${ts.padEnd(56)}║`,
      `╚${'═'.repeat(58)}╝`,
      ``,
      `EXECUTIVE SUMMARY`,
      `${'─'.repeat(58)}`,
      `System Threat Level : ${threatMeta.label} (${threatPercent}%)`,
      `Critical            : ${result.summary.critical}`,
      `Medium              : ${result.summary.medium}`,
      `Low                 : ${result.summary.low}`,
      `False Positives     : ${result.summary.false_positive}`,
      coordinatedIPs.length > 0 ? `\n⚠  COORDINATED ATTACK: ${coordinatedIPs.join(', ')}` : '',
      ``,
      `THREAT DETAILS`,
      `${'─'.repeat(58)}`,
      ...result.threats.map((t, i) => {
        const ip = extractIP(t.log);
        const score = ip ? ipRiskScore(ip, t.level) : null;
        return [``, `[${String(i+1).padStart(2,'0')}] ${t.level.replace('_',' ')} — ${t.type}`,
          `     Log     : ${t.log}`, `     Analysis: ${t.explanation}`,
          t.fix ? `     Fix     : ${t.fix}` : '',
          score ? `     IP Risk : ${score}/100 (${ip})` : '',
        ].filter(Boolean).join('\n');
      }),
      ``, `${'─'.repeat(58)}`,
      `Report by SecureAI · Llama 3.3 70B via Groq · ${ts}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { setError('Clipboard access denied.'); }
  }

  /* ────── RENDER ────── */
  return (
    <div className="min-h-screen text-slate-100" style={{ background: '#080c14' }}>

      {/* ── Cinematic Alert ── */}
      {cinematic && <CinematicAlert criticalCount={result?.summary?.critical || 0} onDone={() => setCinematic(false)} />}

      {/* ── Navbar ── */}
      <nav className="border-b border-slate-800/80 sticky top-0 z-50"
           style={{ background: 'rgba(8,12,20,0.93)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">
              <ShieldIcon className="w-8 h-8" />
            </div>
            <div className="leading-none">
              <div className="text-xl font-bold tracking-tight text-white">Secure<span className="text-red-500">AI</span></div>
              <div className="text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">AI-Powered Threat Monitor</div>
            </div>
          </div>

          {hasCritical && (
            <div className="alert-blink flex items-center gap-2 text-red-400 text-xs font-bold bg-red-950/50 border border-red-500/50 rounded-full px-3 py-1.5 flex-shrink-0">
              🚨 ALERT — {result.summary.critical} CRITICAL THREAT{result.summary.critical > 1 ? 'S' : ''} DETECTED
            </div>
          )}

          <div className="flex items-center gap-3">
            {/* Live Monitor toggle */}
            <button
              onClick={isMonitoring ? stopMonitor : startMonitor}
              className={`hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-full font-medium border transition-all cursor-pointer ${
                isMonitoring
                  ? 'border-red-500/60 text-red-400 bg-red-950/40'
                  : 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-400'
              }`}
            >
              <RadioIcon className="w-3.5 h-3.5" />
              {isMonitoring ? `Live · ${liveCount}` : 'Live Monitor'}
              {isMonitoring && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 border border-slate-700/60 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        {/* ── Hero ── */}
        <div className="text-center space-y-4 pt-2">
          <div className="inline-flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-4 py-1.5">
            <BoltIcon className="w-3.5 h-3.5" />
            Powered by Llama 3.3 70B · Groq Inference
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">
            Detect Threats <span className="text-red-500 drop-shadow-[0_0_20px_rgba(239,68,68,0.4)]">Instantly</span>
          </h1>
          <p className="text-slate-400 max-w-lg mx-auto text-base leading-relaxed">
            Paste server logs and AI identifies SQL injection, brute force, XSS, path traversal, and more — with threat intelligence, attack maps, and plain-English fixes.
          </p>
        </div>

        {/* ── Log Input ── */}
        <div className="rounded-2xl border border-slate-700/50 p-6 space-y-4" style={{ background: 'rgba(12,17,26,0.9)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-base">Security Log Input</h2>
            <button onClick={() => { setLogs(SAMPLE_LOGS); setError(''); }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors cursor-pointer">
              Load Sample Logs
            </button>
          </div>
          <textarea value={logs} onChange={e => setLogs(e.target.value)}
            placeholder={'Paste your server / application logs here...\n\nTip: Click "Load Sample Logs" to demo SQL injection, brute force, XSS, and path traversal.'}
            className="w-full h-48 rounded-xl border border-slate-700/70 bg-black/40 text-slate-300 placeholder-slate-600 font-mono text-xs p-4 resize-y focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-colors leading-relaxed"
          />
          {error && (
            <div className="flex items-start gap-2.5 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertIcon className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
          <button onClick={analyzeThreats} disabled={loading}
            className="w-full h-12 rounded-xl font-semibold text-white text-sm tracking-wide transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 cursor-pointer"
            style={{ background: 'linear-gradient(135deg,#dc2626,#991b1b)', boxShadow: '0 4px 24px rgba(220,38,38,0.28)' }}>
            {loading ? <><SpinnerIcon /> AI is analyzing your logs...</> : <><ShieldIcon className="w-5 h-5" /> Analyze Threats</>}
          </button>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="rounded-2xl border border-slate-700/30 p-10 text-center space-y-4" style={{ background: 'rgba(12,17,26,0.6)' }}>
            <div className="flex justify-center">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-2 border-red-500/20 border-t-red-500 animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-slate-700/50 border-b-slate-500 animate-spin" style={{ animationDirection:'reverse', animationDuration:'1.5s' }} />
              </div>
            </div>
            <p className="text-slate-400 text-sm">Classifying <span className="text-white font-medium">{logs.split('\n').filter(Boolean).length}</span> log entries with AI...</p>
            <p className="text-slate-600 text-xs">This usually takes 3–8 seconds</p>
          </div>
        )}

        {/* ── Live Monitor Feed ── */}
        {isMonitoring && (
          <div className="rounded-2xl border border-cyan-500/20 overflow-hidden" style={{ background: '#020608' }}>
            <div className="px-5 py-3 border-b border-cyan-500/15 flex items-center justify-between"
                 style={{ background: 'rgba(6,182,212,0.05)' }}>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                <span className="text-cyan-400 font-bold text-sm tracking-wider">LIVE THREAT MONITOR</span>
                <span className="text-[10px] text-slate-500 font-mono">{liveCount} events analyzed</span>
              </div>
              <button onClick={stopMonitor}
                      className="text-xs text-red-400 border border-red-500/30 px-2 py-1 rounded-lg hover:bg-red-950/30 transition-colors cursor-pointer">
                Stop
              </button>
            </div>
            <div className="p-4 space-y-3 font-mono" style={{ minHeight: '200px' }}>
              {liveEvents.length === 0 ? (
                <div className="text-slate-600 text-xs text-center py-8">Waiting for events...</div>
              ) : (
                liveEvents.map(e => <LiveEventCard key={e.id} event={e} />)
              )}
            </div>
          </div>
        )}

        {/* ── Dashboard ── */}
        {result && !loading && (
          <div className="space-y-6">

            {/* Coordinated Attack Banner */}
            {coordinatedIPs.length > 0 && (
              <div className="flex items-start gap-4 bg-orange-950/40 border border-orange-500/50 rounded-xl px-5 py-4"
                   style={{ boxShadow: '0 0 24px rgba(249,115,22,0.12)' }}>
                <WarningIcon className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-orange-300 font-bold text-sm">⚠️ Coordinated Attack Detected</div>
                  <p className="text-slate-300 text-sm mt-1">
                    {coordinatedIPs.length === 1
                      ? `IP ${coordinatedIPs[0]} appears in multiple threat events — coordinated campaign.`
                      : `IPs ${coordinatedIPs.join(', ')} each appear in multiple events — likely multi-vector attack.`}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {coordinatedIPs.map(ip => (
                      <span key={ip} className="font-mono text-xs bg-orange-900/50 border border-orange-700/50 text-orange-300 px-2 py-0.5 rounded">{ip}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Summary row + actions */}
            <div className="flex items-center justify-between flex-wrap gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-5 py-3.5">
              <div className="flex items-center gap-3">
                <ShieldIcon className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-slate-300">
                  Analysis complete — <span className="text-white font-semibold">{totalThreats} threat{totalThreats !== 1 ? 's' : ''}</span>
                  {' '}across <span className="text-white font-semibold">{result.threats.length}</span> log entries.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ExecutiveSummary result={result} apiKey={apiKey} />
                <button onClick={exportReport}
                        className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium transition-all cursor-pointer ${copied ? 'bg-emerald-600 text-white border border-emerald-500' : 'border border-slate-600 text-slate-300 hover:text-white bg-slate-800/60'}`}>
                  {copied ? <><CheckCircleIcon className="w-4 h-4" /> Copied!</> : <><CopyIcon /> Export</>}
                </button>
              </div>
            </div>

            {/* ── Attack Map ── */}
            <AttackMap threats={result.threats} />

            {/* ── Threat Level Meter ── */}
            <div className="rounded-2xl border border-slate-700/50 p-6 space-y-4" style={{ background: 'rgba(12,17,26,0.9)' }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-white font-semibold text-base">System Threat Level</h2>
                <span className={`text-sm font-bold tabular-nums ${threatMeta.color}`}>{threatPercent}% — {threatMeta.label}</span>
              </div>
              <div>
                <div className="relative h-5 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                  <div className="h-full rounded-full relative bar-shimmer"
                       style={{ width:`${barWidth}%`, background:threatMeta.bar, transition:'width 1.6s cubic-bezier(0.4,0,0.2,1)', boxShadow:`0 0 16px ${threatMeta.glow}` }} />
                  {[25,50,75].map(t => <div key={t} className="absolute top-0 bottom-0 w-px bg-slate-600/40" style={{ left:`${t}%` }} />)}
                </div>
                <div className="flex justify-between mt-1.5 px-0.5">
                  {['SECURE','ELEVATED','HIGH','CRITICAL'].map(l => <span key={l} className="text-[9px] text-slate-600 uppercase tracking-widest">{l}</span>)}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[{label:'Critical',val:result.summary.critical,color:'bg-red-500'},{label:'Medium',val:result.summary.medium,color:'bg-yellow-500'},{label:'Low',val:result.summary.low,color:'bg-emerald-500'},{label:'Clean',val:result.summary.false_positive,color:'bg-slate-500'}]
                  .map(({ label, val, color }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                    <span className="text-xs text-slate-500">{label}: <span className="text-slate-300 font-medium">{val}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Stat cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Critical"       count={result.summary.critical}       iconColor="text-red-400"     cardBorder="border-red-500/25"     cardBg="bg-red-950/30"     icon={<AlertIcon />} />
              <StatCard label="Medium"         count={result.summary.medium}         iconColor="text-yellow-400"  cardBorder="border-yellow-500/25"  cardBg="bg-yellow-950/20"  icon={<AlertIcon />} />
              <StatCard label="Low"            count={result.summary.low}            iconColor="text-emerald-400" cardBorder="border-emerald-600/25" cardBg="bg-emerald-950/15" icon={<InfoIcon />} />
              <StatCard label="False Positive" count={result.summary.false_positive} iconColor="text-slate-400"   cardBorder="border-slate-600/25"   cardBg="bg-slate-800/20"   icon={<CheckCircleIcon />} />
            </div>

            {/* ── Threat filter + cards ── */}
            {realThreats.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                  <h2 className="text-white font-semibold text-lg">
                    Threats Detected
                    <span className="ml-2 text-sm font-normal text-slate-500">({realThreats.length})</span>
                  </h2>
                  <div className="flex gap-1.5">
                    {[{label:'All',value:'ALL',count:realThreats.length},{label:'Critical',value:'CRITICAL',count:result.summary.critical},{label:'Medium',value:'MEDIUM',count:result.summary.medium},{label:'Low',value:'LOW',count:result.summary.low}]
                      .map(btn => (
                      <button key={btn.value} onClick={() => setFilter(btn.value)}
                              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${filter===btn.value ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.35)]' : 'text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500'}`}>
                        {btn.label}{btn.count > 0 && <span className="ml-1.5 opacity-60">{btn.count}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                {shown.length === 0
                  ? <div className="text-center text-slate-500 py-10 border border-slate-700/30 rounded-xl">No threats match this filter.</div>
                  : <div className="space-y-4">{shown.map((t, i) => <ThreatCard key={i} threat={t} />)}</div>
                }
              </div>
            )}

            {/* ── False positives ── */}
            {falsePositives.length > 0 && (
              <div>
                <h2 className="text-white font-semibold text-lg mb-4">
                  False Positives <span className="ml-2 text-sm font-normal text-slate-500">({falsePositives.length} benign)</span>
                </h2>
                <div className="space-y-3">{falsePositives.map((t, i) => <ThreatCard key={i} threat={t} />)}</div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800/60 mt-20 py-6 text-center text-xs text-slate-700">
        SecureAI — AI-Powered Threat Monitor &nbsp;·&nbsp; Llama 3.3 70B via Groq
      </footer>

      {/* ── Floating AI Chat ── */}
      <ChatAssistant result={result} apiKey={apiKey} />
    </div>
  );
}
