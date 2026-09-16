import React, { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { MessageCircle, X, Send, Loader2, Sparkles } from 'lucide-react';
import { api } from '../services/api';

/**
 * Pia — the in-product help assistant.
 *
 * A self-contained floating widget. It only calls the assistant endpoint and
 * shares no state with the scan, upload or rule-evaluation flows, so it cannot
 * affect compliance behaviour.
 */

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi, I'm Pia. I can help you scan a package, understand a compliance result, or explain any PCR 2011 or FSSR 2020 rule. What would you like to know?",
};

const SCAN_GREETING: Msg = {
  role: 'assistant',
  content:
    "Hi, I'm Pia. I can see the inspection you're viewing — ask me about its verdict, why a rule failed, or what to fix first.",
};

const SUGGESTIONS = [
  'How do I scan a package?',
  'What does "Needs verification" mean?',
  'Explain Rule 6(1)(e)',
];

// Shown when an inspection is open, so the obvious questions are one tap away.
const SCAN_SUGGESTIONS = [
  'Tell me about this inspection',
  'Why is it not compliant?',
  'What should I fix first?',
];

interface PiaAssistantProps {
  /** The inspection currently on screen, so Pia can answer about it. */
  scanId?: string | null;
}

export const PiaAssistant: React.FC<PiaAssistantProps> = ({ scanId }) => {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const greeting = scanId ? SCAN_GREETING : GREETING;
  const [messages, setMessages] = useState<Msg[]>([greeting]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api
      .getAssistantStatus()
      .then((s) => setEnabled(Boolean(s.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Swap the opening line when the user moves between an inspection and the
  // rest of the app, but only while the transcript is still untouched.
  useEffect(() => {
    setMessages((prev) =>
      prev.length === 1 && prev[0].role === 'assistant' ? [greeting] : prev,
    );
  }, [greeting]);

  // Close on Escape, returning focus to the launcher.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || sending) return;

    const next = [...messages, { role: 'user' as const, content: question }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      // Drop the local greeting: it is UI text, not conversation history.
      const history = next
        .filter((m) => m !== GREETING && m !== SCAN_GREETING)
        .map(({ role, content }) => ({ role, content }));
      const res = await api.askAssistant(history, scanId);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: "I couldn't reach the server just then. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  // Hidden entirely when the server has no key configured, rather than
  // offering a button that cannot work.
  if (enabled === false || enabled === null) return null;

  return (
    <>
      {!open && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Pia, the PackSure assistant"
          className="fixed bottom-5 right-5 z-40 h-12 w-12 rounded-full bg-gold-500 text-white dark:text-gov-950 shadow-lg border border-gold-600/40 flex items-center justify-center transition-transform duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gov-900 motion-reduce:transition-none motion-reduce:hover:scale-100"
        >
          <MessageCircle className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="Pia, the PackSure assistant"
          className="fixed bottom-5 right-5 z-40 w-[min(380px,calc(100vw-2.5rem))] h-[min(560px,calc(100vh-6rem))] flex flex-col bg-gov-850 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800 bg-gov-800 shrink-0">
            <span className="h-7 w-7 rounded-full bg-gold-500 text-white dark:text-gov-950 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-100 leading-tight">Pia</p>
              <p className="text-2xs text-slate-400 leading-tight">PackSure assistant</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Close assistant"
              className="h-7 w-7 rounded-md text-slate-400 hover:text-slate-100 hover:bg-gov-700 flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Transcript */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={clsx(
                    'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words',
                    m.role === 'user'
                      ? 'bg-gold-500 text-white dark:text-gov-950'
                      : 'bg-gov-800 text-slate-200 border border-slate-800',
                  )}
                >
                  <span className="sr-only">{m.role === 'user' ? 'You said: ' : 'Pia replied: '}</span>
                  {m.content}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-gov-800 border border-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-hidden="true" />
                  <span className="text-xs text-slate-400">Pia is typing…</span>
                </div>
              </div>
            )}

            {messages.length === 1 && !sending && (
              <div className="pt-1 space-y-1.5">
                {(scanId ? SCAN_SUGGESTIONS : SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full text-left text-xs text-slate-300 bg-gov-800 hover:bg-gov-700 border border-slate-800 rounded-md px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="border-t border-slate-800 p-2.5 flex items-center gap-2 shrink-0 bg-gov-850"
          >
            <label htmlFor="pia-input" className="sr-only">
              Ask Pia about PackSure
            </label>
            <input
              id="pia-input"
              ref={inputRef}
              type="text"
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about PackSure…"
              disabled={sending}
              className="flex-1 min-w-0 h-9 px-3 text-xs bg-gov-900 border border-slate-700 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-gold-500 focus-visible:ring-1 focus-visible:ring-gold-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send message"
              className="h-9 w-9 shrink-0 rounded-md bg-gold-500 text-white dark:text-gov-950 flex items-center justify-center transition-colors hover:bg-gold-600 disabled:bg-gov-700 disabled:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
