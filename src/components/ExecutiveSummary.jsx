import { useState } from 'react';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

function buildPrompt(result) {
  const threats = result.threats.map(t =>
    `[${t.level}] ${t.type}: ${t.explanation}`
  ).join('\n');

  return `You are a CISO preparing an executive security incident report. Based on these detected threats, generate a professional summary.

Respond ONLY with valid JSON in exactly this format:
{
  "overview": "2-3 sentence executive overview of the incident",
  "riskScore": 78,
  "riskRationale": "one sentence explaining the risk score",
  "priorityActions": [
    "First priority action with specific steps",
    "Second priority action",
    "Third priority action"
  ],
  "improvements": [
    "Security improvement recommendation 1",
    "Security improvement recommendation 2",
    "Security improvement recommendation 3"
  ],
  "estimatedRemediation": "2-4 hours",
  "complianceNote": "One sentence about compliance/regulatory impact"
}

Detected threats:
${threats}

Summary: Critical=${result.summary.critical}, Medium=${result.summary.medium}, Low=${result.summary.low}`;
}

function RiskMeter({ score }) {
  const color = score >= 75 ? '#ef4444' : score >= 50 ? '#f97316' : score >= 25 ? '#eab308' : '#10b981';
  const label = score >= 75 ? 'CRITICAL RISK' : score >= 50 ? 'HIGH RISK' : score >= 25 ? 'ELEVATED' : 'MANAGED';

  return (
    <div className="flex items-center gap-4">
      {/* Circular gauge */}
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
                  strokeDasharray={`${2.51 * score} 251`}
                  strokeLinecap="round"
                  style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{score}</span>
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">/100</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-bold" style={{ color }}>{label}</div>
        <div className="text-xs text-slate-400 mt-0.5 max-w-[200px] leading-relaxed" id="risk-rationale" />
      </div>
    </div>
  );
}

export default function ExecutiveSummary({ result, apiKey }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport]   = useState(null);
  const [error, setError]     = useState('');

  async function generate() {
    setOpen(true);
    if (report) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: buildPrompt(result) }],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });
      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content || '';
      const match   = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Unexpected AI response format.');
      const parsed  = JSON.parse(match[0]);
      setReport(parsed);
    } catch (e) {
      setError(e.message || 'Failed to generate report.');
    } finally {
      setLoading(false);
    }
  }

  async function printReport() {
    window.print();
  }

  const scoreColor = (s) => s >= 75 ? 'text-red-400' : s >= 50 ? 'text-orange-400' : s >= 25 ? 'text-yellow-400' : 'text-emerald-400';

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={generate}
        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all hover:brightness-110"
        style={{ background: 'linear-gradient(135deg,#7c3aed,#4c1d95)', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
        Executive Report
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/60 shadow-2xl"
               style={{ background: '#0c1120' }}>

            {/* Modal header */}
            <div className="sticky top-0 z-10 px-6 py-4 border-b border-slate-700/50 flex items-center justify-between"
                 style={{ background: 'rgba(12,17,32,0.95)', backdropFilter: 'blur(8px)' }}>
              <div>
                <h2 className="text-white font-bold text-lg">Executive Security Report</h2>
                <div className="text-xs text-slate-500 mt-0.5">{new Date().toLocaleString()} · Confidential</div>
              </div>
              <div className="flex items-center gap-2">
                {report && (
                  <button onClick={printReport}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white transition-colors cursor-pointer">
                    Print / PDF
                  </button>
                )}
                <button onClick={() => setOpen(false)}
                        className="w-8 h-8 rounded-lg border border-slate-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">

              {/* Loading */}
              {loading && (
                <div className="text-center py-12 space-y-4">
                  <div className="flex justify-center">
                    <div className="relative w-12 h-12">
                      <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 border-t-purple-500 animate-spin" />
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm">AI is generating your executive report...</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-4">{error}</div>
              )}

              {/* Report content */}
              {report && (
                <div className="space-y-6">

                  {/* Risk score */}
                  <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Overall Risk Score</div>
                    <div className="flex items-center gap-4">
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                          <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="10" />
                          <circle cx="50" cy="50" r="40" fill="none"
                                  stroke={report.riskScore >= 75 ? '#ef4444' : report.riskScore >= 50 ? '#f97316' : report.riskScore >= 25 ? '#eab308' : '#10b981'}
                                  strokeWidth="10"
                                  strokeDasharray={`${2.513 * report.riskScore} 251.3`}
                                  strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-white tabular-nums">{report.riskScore}</span>
                          <span className="text-[9px] text-slate-500">/100</span>
                        </div>
                      </div>
                      <div>
                        <div className={`text-sm font-bold mb-1 ${scoreColor(report.riskScore)}`}>
                          {report.riskScore >= 75 ? 'CRITICAL RISK' : report.riskScore >= 50 ? 'HIGH RISK' : report.riskScore >= 25 ? 'ELEVATED RISK' : 'MANAGED RISK'}
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">{report.riskRationale}</p>
                      </div>
                    </div>
                  </div>

                  {/* Overview */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Incident Overview</div>
                    <p className="text-slate-300 text-sm leading-relaxed bg-slate-800/30 border border-slate-700/30 rounded-xl p-4">
                      {report.overview}
                    </p>
                  </div>

                  {/* Priority Actions */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Priority Actions</div>
                    <div className="space-y-2">
                      {report.priorityActions?.map((action, i) => (
                        <div key={i} className="flex items-start gap-3 bg-red-950/20 border border-red-700/20 rounded-xl p-3">
                          <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <p className="text-slate-300 text-sm leading-relaxed">{action}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Improvements */}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Security Improvements</div>
                    <div className="space-y-2">
                      {report.improvements?.map((item, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-emerald-500 mt-0.5 flex-shrink-0">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <p className="text-slate-300 text-sm leading-relaxed">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4">
                      <div className="text-xs text-slate-500 mb-1">Est. Remediation Time</div>
                      <div className="text-white font-bold">{report.estimatedRemediation}</div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4">
                      <div className="text-xs text-slate-500 mb-1">Compliance Impact</div>
                      <div className="text-yellow-400 text-sm leading-relaxed">{report.complianceNote}</div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 text-center border-t border-slate-800 pt-4">
                    Report generated by SecureAI · {new Date().toLocaleString()} · Powered by Llama 3.3 70B via Groq
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
