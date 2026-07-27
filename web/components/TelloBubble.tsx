'use client'
// TelloBubble.tsx
// Tello — TrueFlow's AI assistant persona in the web app.
// Pulses twice on login, auto-opens once per session (desktop only),
// plays the welcome message word by word, then becomes a full chat interface
// calling /api/chat/message for all subsequent conversation.

import { useState, useEffect, useRef, useCallback } from 'react'
import { visibleCategories } from '@/lib/prompt-examples'
import { getPlanConfig } from '@/lib/plans'
import { fetchLivePlanConfig } from '@/lib/plans-client'

interface TelloBubbleProps {
  userId: string
  orgId: string
  isFirstTime: boolean
  plan?: string | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SESSION_KEY_OPENED = 'tello_auto_opened'
const SESSION_KEY_WELCOME = 'tello_welcome_msg'

export function TelloBubble({ userId, orgId, isFirstTime, plan }: TelloBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPulsing, setIsPulsing] = useState(false)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [welcomePlayed, setWelcomePlayed] = useState(false)
  const [unreadNudges, setUnreadNudges] = useState<{ id: string; content: string }[]>([])
  // Initialised from the static fallback (correct pre-live-fetch default),
  // then upgraded once fetchLivePlanConfig resolves — so a Super Admin
  // toggle in /admin/plans reflects here without a stale flash.
  const [canInviteTeam, setCanInviteTeam] = useState(getPlanConfig(plan).staffLimit !== 0)

  useEffect(() => {
    fetchLivePlanConfig(plan).then(cfg => setCanInviteTeam(cfg.staffLimit !== 0))
  }, [plan])

  const hasAutoOpenedRef = useRef(false)
  const wordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // Pre-fetch welcome message on mount, then pulse and auto-open
  useEffect(() => {
    // Check sessionStorage — if already opened this session, skip auto-open
    try {
      if (sessionStorage.getItem(SESSION_KEY_OPENED) === '1') {
        hasAutoOpenedRef.current = true
      }
      // Retrieve cached welcome if available
      const cached = sessionStorage.getItem(SESSION_KEY_WELCOME)
      if (cached) {
        setWelcomeMessage(cached)
        return // Skip re-fetching, still pulse and open
      }
    } catch {
      // sessionStorage unavailable (private browsing, etc.) — continue normally
    }

    fetch('/api/tello/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, orgId, isFirstTime }),
    })
      .then(r => r.json())
      .then((data: { message: string }) => {
        const msg = data.message || 'Welcome back! What can I help you with today?'
        setWelcomeMessage(msg)
        try { sessionStorage.setItem(SESSION_KEY_WELCOME, msg) } catch { /* noop */ }
      })
      .catch(() => {
        const fallback = 'Welcome back! What can I help you with today?'
        setWelcomeMessage(fallback)
        try { sessionStorage.setItem(SESSION_KEY_WELCOME, fallback) } catch { /* noop */ }
      })
  }, [userId, orgId, isFirstTime])

  // Check for unread proactive nudges (Inactivity Re-Engagement / Daily
  // Brief) once per mount — "next time they open the app," not a live push.
  useEffect(() => {
    fetch('/api/tello/unread')
      .then(r => r.json())
      .then((data: { messages?: { id: string; content: string }[] }) => {
        setUnreadNudges(data.messages ?? [])
      })
      .catch(() => {})
  }, [])

  // Once we have a welcome message, pulse then auto-open
  useEffect(() => {
    if (!welcomeMessage) return

    // Pulse exactly twice (600ms each = 1200ms total)
    setIsPulsing(true)
    const stopPulse = setTimeout(() => setIsPulsing(false), 1400)

    // Auto-open once per session on screens wider than 640px
    if (!hasAutoOpenedRef.current && typeof window !== 'undefined' && window.innerWidth >= 640) {
      const openTimer = setTimeout(() => {
        setIsOpen(true)
        hasAutoOpenedRef.current = true
        try { sessionStorage.setItem(SESSION_KEY_OPENED, '1') } catch { /* noop */ }
      }, 1600) // after pulse finishes + 200ms pause

      return () => { clearTimeout(stopPulse); clearTimeout(openTimer) }
    }

    return () => clearTimeout(stopPulse)
  }, [welcomeMessage])

  // Word-by-word animation when panel opens with a fresh welcome
  useEffect(() => {
    if (!isOpen || !welcomeMessage || welcomePlayed) return

    if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
    setDisplayedText('')
    setIsTyping(true)
    const words = welcomeMessage.split(' ')
    let idx = 0

    wordIntervalRef.current = setInterval(() => {
      if (idx < words.length) {
        setDisplayedText(prev => prev + (idx === 0 ? '' : ' ') + words[idx])
        idx++
        scrollToBottom()
      } else {
        clearInterval(wordIntervalRef.current!)
        wordIntervalRef.current = null
        setIsTyping(false)
        setWelcomePlayed(true)
        setMessages([{ role: 'assistant', content: welcomeMessage }])
        setDisplayedText('')
      }
    }, 38)

    return () => {
      if (wordIntervalRef.current) clearInterval(wordIntervalRef.current)
    }
  }, [isOpen, welcomeMessage, welcomePlayed, scrollToBottom])

  // Append any unread proactive nudges (Inactivity Re-Engagement / Daily
  // Brief) exactly once, whenever the welcome message has finished playing
  // AND we know about unread nudges — whichever of those two resolves
  // last. Runs after welcomePlayed so it never gets wiped by the welcome
  // effect's setMessages([...]) call, and works whether this is the very
  // first open this session or a later one.
  const nudgesAppendedRef = useRef(false)
  useEffect(() => {
    if (!welcomePlayed || nudgesAppendedRef.current || unreadNudges.length === 0) return
    nudgesAppendedRef.current = true
    setMessages(existing => [
      ...existing,
      ...unreadNudges.map(n => ({ role: 'assistant' as const, content: n.content })),
    ])
    fetch('/api/tello/unread', { method: 'POST' }).catch(() => {})
  }, [welcomePlayed, unreadNudges])

  // Focus input when panel opens after welcome finishes
  useEffect(() => {
    if (isOpen && welcomePlayed) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, welcomePlayed])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  function handleClose() {
    setIsOpen(false)
    if (wordIntervalRef.current) {
      clearInterval(wordIntervalRef.current)
      wordIntervalRef.current = null
      setIsTyping(false)
      // Snap the welcome text to full immediately if user closes mid-animation
      if (!welcomePlayed) {
        setWelcomePlayed(true)
        setMessages([{ role: 'assistant', content: welcomeMessage }])
        setDisplayedText('')
      }
    }
  }

  function handleBubbleClick() {
    setIsOpen(prev => !prev)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      const data = await res.json()
      const reply = data.reply || data.error || 'Something went wrong. Try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const showWelcomeAnimation = isOpen && !welcomePlayed && displayedText !== ''
  const showMessages = isOpen && welcomePlayed

  return (
    <>
      <style>{`
        @keyframes tello-pulse {
          0%   { transform: scale(1);    box-shadow: 0 4px 20px rgba(108,99,255,0.4), 0 0 0 0   rgba(108,99,255,0.3); }
          50%  { transform: scale(1.12); box-shadow: 0 4px 20px rgba(108,99,255,0.4), 0 0 0 12px rgba(108,99,255,0); }
          100% { transform: scale(1);    box-shadow: 0 4px 20px rgba(108,99,255,0.4), 0 0 0 0   rgba(108,99,255,0.3); }
        }
        .tello-bubble-pulsing {
          animation: tello-pulse 600ms ease-in-out 2;
        }
        @keyframes tello-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .tello-cursor {
          display: inline-block;
          width: 2px;
          height: 14px;
          background: #6C63FF;
          margin-left: 2px;
          vertical-align: middle;
          animation: tello-cursor 700ms ease-in-out infinite;
        }
      `}</style>

      {/* Chat panel */}
      {isOpen && (
        <div style={{
          position: 'fixed',
          bottom: '88px',
          right: '24px',
          width: '360px',
          maxHeight: '520px',
          background: '#16161C',
          border: '1px solid rgba(108,99,255,0.3)',
          borderRadius: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1000,
          overflow: 'hidden',
          fontFamily: 'Inter, DM Sans, system-ui, sans-serif',
        }}>

          {/* Header — always visible, X always works */}
          <div style={{
            padding: '14px 16px',
            background: '#6C63FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: '700',
                color: 'white',
                flexShrink: 0,
              }}>T</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: 'white', lineHeight: 1.2 }}>Tello</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.2 }}>TrueFlow AI Assistant</div>
              </div>
            </div>
            {/* X button — always visible, always works, never hidden */}
            <button
              onClick={handleClose}
              aria-label="Close Tello"
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                fontSize: '22px',
                lineHeight: 1,
                cursor: 'pointer',
                opacity: 0.85,
                padding: '4px 6px',
                borderRadius: '6px',
                transition: 'opacity 100ms',
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.85')}
            >×</button>
          </div>

          {/* Message area */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            minHeight: 0,
          }}>
            {/* Word-by-word welcome animation */}
            {showWelcomeAnimation && (
              <div style={{
                background: 'rgba(108,99,255,0.12)',
                border: '1px solid rgba(108,99,255,0.2)',
                borderRadius: '12px 12px 12px 3px',
                padding: '12px 14px',
                fontSize: '13px',
                color: '#E8E8F0',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
              }}>
                {displayedText}
                {isTyping && <span className="tello-cursor" />}
              </div>
            )}

            {/* Conversation messages after welcome */}
            {showMessages && messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '88%',
                  background: msg.role === 'user'
                    ? '#6C63FF'
                    : 'rgba(108,99,255,0.12)',
                  border: msg.role === 'user'
                    ? 'none'
                    : '1px solid rgba(108,99,255,0.2)',
                  borderRadius: msg.role === 'user'
                    ? '12px 12px 3px 12px'
                    : '12px 12px 12px 3px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: '#E8E8F0',
                  lineHeight: '1.65',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            ))}

            {/* Example cards (Requirement 4) — shown only before the user
                has sent their own first message this session, so they
                don't clutter an active conversation. Tapping fills the
                input rather than sending, since the user may just want to
                see the format before editing in their own details. */}
            {showMessages && !messages.some(m => m.role === 'user') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Try asking Tello
                </div>
                {visibleCategories(canInviteTeam).map(cat => (
                  <div key={cat.id}>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', marginBottom: '5px' }}>
                      {cat.emoji} {cat.label}
                    </div>
                    {cat.instructionOverride ? (
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
                        {cat.instructionOverride}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {cat.examples.map(ex => (
                          <button
                            key={ex}
                            onClick={() => { setInput(ex); setTimeout(() => inputRef.current?.focus(), 0) }}
                            style={{
                              textAlign: 'left',
                              background: 'rgba(108,99,255,0.08)',
                              border: '1px solid rgba(108,99,255,0.18)',
                              borderRadius: '10px',
                              padding: '8px 11px',
                              fontSize: '12.5px',
                              color: '#C9C5FF',
                              cursor: 'pointer',
                            }}
                          >
                            "{ex}"
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Typing indicator while waiting for Tello response */}
            {sending && (
              <div style={{
                alignSelf: 'flex-start',
                background: 'rgba(108,99,255,0.12)',
                border: '1px solid rgba(108,99,255,0.2)',
                borderRadius: '12px 12px 12px 3px',
                padding: '10px 14px',
                fontSize: '13px',
                color: 'rgba(255,255,255,0.4)',
              }}>
                Tello is thinking…
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{
            padding: '12px 14px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            gap: '8px',
            flexShrink: 0,
            background: '#16161C',
          }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask Tello anything…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '10px 13px',
                fontSize: '13px',
                color: '#E8E8F0',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              style={{
                background: sending || !input.trim() ? 'rgba(108,99,255,0.4)' : '#6C63FF',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 15px',
                color: 'white',
                fontSize: '13px',
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                transition: 'background 150ms',
                flexShrink: 0,
              }}
            >Send</button>
          </div>
        </div>
      )}

      {/* Unread proactive-nudge indicator — cleared the moment the bubble opens */}
      {!isOpen && unreadNudges.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '72px',
            right: '20px',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: '#FF6B6B',
            border: '2px solid #0A0A0F',
            zIndex: 1002,
          }}
        />
      )}

      {/* The bubble itself */}
      <button
        onClick={handleBubbleClick}
        className={isPulsing ? 'tello-bubble-pulsing' : ''}
        aria-label="Open Tello AI assistant"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: '#6C63FF',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1001,
          boxShadow: '0 4px 20px rgba(108,99,255,0.4)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          fontSize: '20px',
          fontWeight: '700',
          color: 'white',
          fontFamily: 'Space Grotesk, system-ui, sans-serif',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
        onMouseLeave={e => {
          if (!isPulsing) e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        T
      </button>
    </>
  )
}
