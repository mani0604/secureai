import { useState, useRef, useEffect } from 'react';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

const QUICK_PROMPTS = [
  'Which IP is most dangerous?',
  'What should I fix first?',
  'Am I at risk of data breach?',
  'Summarize all threats',
];

function buildSystemPrompt(result) {
  if (!result) return 'You are a SOC analyst assistant. No threats have been analyzed yet.';
  const summary = result.summary;
  const threatList = result.threats.map(t =>
    `[${t.level}] ${t.type} — ${t.explanation} (Log: ${t.log})`
  ).join('\n');
  return `You are an expert SOC analyst assistant embedded in SecureAI. The system just completed threat analysis.

ANALYSIS RESULTS:
Critical: ${summary.critical} | Medium: ${summary.medium} | Low: ${summary.low} | False Positive: ${summary.false_positive}

DETECTED THREATS:
${threatList}

Answer the analyst's questions concisely (under 120 words). Be specific, direct, and actionable.
Reference specific IPs or attack types when relevant. Always prioritize critical threats first.`;
}

export default function ChatAssistant({ result, apiKey }) {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: result
        ? `Analysis complete. I see ${result.summary.critical} critical and ${result.summary.medium} medium threats. Ask me anything about them.`
        : 'Hello! Analyze some logs first, then ask me anything about the detected threats.' }
  ]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* Reset greeting when new result arrives */
  useEffect(() => {
    if (result) {
      setMessages([{
        role: 'assistant',
        content: `Analysis complete. I detected ${result.summary.critical} critical, ${result.summary.medium} medium, and ${result.summary.low} low threats. What would you like to know?`
      }]);
    }
  }, [result]);

  async function sendMessage(text) {
    const userText = (text || input).trim();
    if (!userText) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: userText });

    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'system', content: buildSystemPrompt(result) }, ...history],
          temperature: 0.4,
          max_tokens: 300,
        }),
      });
      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content || 'Sorry, I could not process that.';
      setMessages(prev => [...prev, { role: 'assistant', content }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-2xl transition-all hover:scale-110 cursor-pointer"
        style={{ background: 'linear-gradient(135deg,#dc2626,#7f1d1d)', boxShadow: '0 0 24px rgba(220,38,38,0.4)' }}
        title="AI Security Assistant"
      >
        {open ? (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        )}
        {!open && result && result.summary.critical > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center">
            {result.summary.critical}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chat-open fixed bottom-24 right-6 z-40 w-[360px] rounded-2xl border border-slate-700/60 flex flex-col overflow-hidden shadow-2xl"
             style={{ background: '#0c1120', height: '480px', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }}>

          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-700/60 flex items-center gap-3"
               style={{ background: 'rgba(220,38,38,0.12)' }}>
            <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="text-white text-sm font-semibold">SecureAI Assistant</div>
              <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                Online · Llama 3.3 70B
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-red-700/30 border border-red-600/30 text-slate-100'
                    : 'bg-slate-800/60 border border-slate-700/40 text-slate-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800/60 border border-slate-700/40 px-3 py-2 rounded-xl">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => (
                      <span key={i} className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                        className="text-[10px] px-2 py-1 rounded-lg border border-slate-600/60 text-slate-400 hover:text-white hover:border-red-500/50 transition-colors cursor-pointer">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex gap-2 bg-slate-800/60 border border-slate-600/50 rounded-xl px-3 py-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask about your threats..."
                disabled={loading}
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
              />
              <button onClick={() => sendMessage()}
                      disabled={loading || !input.trim()}
                      className="text-red-500 hover:text-red-400 disabled:opacity-30 transition-colors cursor-pointer">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
