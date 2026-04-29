'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Video, MapPin, ExternalLink, X } from 'lucide-react';
import type { CalendarEvent } from '@/lib/services/calendar';

interface ThreeDayGridProps {
  events: CalendarEvent[];
  initialView?: '3day' | 'day';
}

const HOUR_START = 6;
const HOUR_END   = 22;
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => i + HOUR_START);
const ROW_H      = 48;
const GUTTER_W   = 44;

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  biz:      { bg: 'rgba(64,200,240,0.18)',  border: '#40c8f0', text: '#024878' },
  business: { bg: 'rgba(64,200,240,0.18)',  border: '#40c8f0', text: '#024878' },
  personal: { bg: 'rgba(184,144,42,0.15)',  border: '#b8902a', text: '#7a4418' },
  travel:   { bg: 'rgba(34,197,94,0.15)',   border: '#22c55e', text: '#166534' },
  music:    { bg: 'rgba(147,51,234,0.15)',  border: '#9333ea', text: '#581c87' },
  default:  { bg: 'rgba(64,200,240,0.12)',  border: '#7ab8d8', text: '#024878' },
};

function parseTimeToMinutes(timeStr: string | null): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim();
  const ampmMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'AM' && h === 12) h = 0;
    if (period === 'PM' && h !== 12) h += 12;
    return h * 60 + m;
  }
  const h24Match = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) return parseInt(h24Match[1], 10) * 60 + parseInt(h24Match[2], 10);
  return 0;
}

function dayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function getEventColor(event: CalendarEvent): typeof EVENT_COLORS['default'] {
  const title = event.title.toLowerCase();
  if (title.includes('music') || title.includes('studio') || title.includes('record')) return EVENT_COLORS.music;
  if (title.includes('travel') || title.includes('flight') || title.includes('hotel')) return EVENT_COLORS.travel;
  if (title.includes('personal') || title.includes('family') || title.includes('dinner')) return EVENT_COLORS.personal;
  if (title.includes('meeting') || title.includes('call') || title.includes('sync') || title.includes('review')) return EVENT_COLORS.biz;
  return EVENT_COLORS.default;
}

function formatHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  if (h < 12) return `${h}a`;
  return `${h - 12}p`;
}

function formatNowTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

function EventDetailModal({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff',
        border: '1px solid #b8e0f5',
        borderRadius: '16px',
        padding: '20px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 16px 48px rgba(0,50,100,0.18)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '14px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'var(--font-rajdhani)', fontWeight: 700, fontSize: '18px', color: '#024878', lineHeight: 1.2 }}>
              {event.title}
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#0470a0', marginTop: '4px' }}>
              {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'rgba(184,224,245,0.4)', border: 'none', borderRadius: '8px', padding: '4px', cursor: 'pointer', color: '#024878', display: 'flex' }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        {/* Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin style={{ width: 12, height: 12, color: '#0470a0', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#024878' }}>{event.location}</span>
            </div>
          )}
          {event.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#5a7a9a', lineHeight: 1.5 }}>
              {event.description}
            </p>
          )}
          {!event.location && !event.description && (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: '#9ab8cc', fontStyle: 'italic' }}>No additional details.</p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, background: '#0470a0', color: '#fff', borderRadius: '10px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}
            >
              <Video style={{ width: 12, height: 12 }} /> Join
            </a>
          )}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, background: 'rgba(64,200,240,0.12)', color: '#024878', border: '1px solid #7ab8d8', borderRadius: '10px', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none' }}
            >
              <ExternalLink style={{ width: 12, height: 12 }} /> Edit in Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreeDayGrid({ events, initialView = '3day' }: ThreeDayGridProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [offset, setOffset] = useState(-1);
  const [viewMode, setViewMode] = useState<'3day' | 'day'>(initialView);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (nowLineRef.current) {
      nowLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const days = useMemo(() => {
    if (viewMode === 'day') {
      return [addDays(today, offset)];
    }
    return [0, 1, 2].map((i) => addDays(today, offset + i));
  }, [today, offset, viewMode]);

  const eventsByDay = useMemo(() => {
    return days.map((day) => {
      return events.filter((ev) => {
        if (!ev.startDate) return false;
        const evDate = new Date(ev.startDate);
        evDate.setHours(0, 0, 0, 0);
        return isSameDay(evDate, day);
      });
    });
  }, [days, events]);

  const totalHeight = HOURS.length * ROW_H;
  const nowTopPx = ((nowMinutes - HOUR_START * 60) / 60) * ROW_H;
  const todayColIndex = days.findIndex((d) => isSameDay(d, today));
  const columnCount = days.length;
  const gridColumns = `${GUTTER_W}px repeat(${columnCount}, 1fr)`;
  const eventsColumns = `repeat(${columnCount}, 1fr)`;

  return (
    <>
      {selectedEvent && (
        <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
      <div style={{
        background: 'rgba(255,255,255,0.70)',
        border: '1px solid #b8d8e8',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 2px 16px rgba(64,168,200,0.08)',
        overflow: 'hidden',
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #b8e0f5' }}>
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #7ab8d8', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', color: '#085070', display: 'flex', alignItems: 'center' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, margin: '0 8px' }}>
            <div style={{ display: 'flex', border: '1px solid #7ab8d8', borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.5)' }}>
              <button
                type="button"
                onClick={() => {
                  setViewMode('3day');
                  setOffset(-1);
                }}
                style={{
                  border: 'none',
                  background: viewMode === '3day' ? 'rgba(4,112,160,0.14)' : 'transparent',
                  color: viewMode === '3day' ? '#024878' : '#5a7a9a',
                  padding: '5px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                3 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('day');
                  setOffset(0);
                }}
                style={{
                  border: 'none',
                  borderLeft: '1px solid #7ab8d8',
                  background: viewMode === 'day' ? 'rgba(4,112,160,0.14)' : 'transparent',
                  color: viewMode === 'day' ? '#024878' : '#5a7a9a',
                  padding: '5px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Day Zone
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: gridColumns, width: '100%' }}>
              <div />
              {days.map((day, i) => {
                const isToday = isSameDay(day, today);
                return (
                  <div key={i} style={{ textAlign: 'center', padding: '0 4px' }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      color: isToday ? 'var(--ice2)' : 'var(--ice-text3)',
                      letterSpacing: '0.08em',
                      marginBottom: '2px',
                    }}>
                      {dayLabel(day)}
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: isToday ? 'var(--ice)' : 'transparent',
                      fontFamily: 'var(--font-rajdhani)',
                      fontSize: '18px',
                      fontWeight: 700,
                      color: isToday ? '#fff' : 'var(--ice-text)',
                      lineHeight: 1,
                    }}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #7ab8d8', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', color: '#085070', display: 'flex', alignItems: 'center' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Grid body */}
        <div style={{ overflowY: 'auto', maxHeight: '360px', position: 'relative', overscrollBehavior: 'contain' }}>
          <div style={{ position: 'relative', height: totalHeight }}>
            {/* Hour grid lines */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: gridColumns }}>
              {HOURS.map((h, hi) => (
                <div key={h} style={{ display: 'contents' }}>
                  <div style={{
                    gridColumn: 1,
                    gridRow: hi + 1,
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    paddingRight: '6px',
                    paddingTop: '2px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    color: 'var(--ice-text3)',
                    opacity: 0.85,
                    borderTop: hi > 0 ? '1px solid rgba(184,224,245,0.4)' : 'none',
                  }}>
                    {formatHour(h)}
                  </div>
                  {days.map((_, col) => (
                    <div key={col} style={{
                      gridColumn: col + 2,
                      gridRow: hi + 1,
                      height: ROW_H,
                      borderTop: hi > 0 ? '1px solid rgba(184,224,245,0.4)' : 'none',
                      borderLeft: '1px solid rgba(184,224,245,0.25)',
                    }} />
                  ))}
                </div>
              ))}
            </div>

            {/* Events layer */}
            <div style={{ position: 'absolute', top: 0, left: GUTTER_W, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: eventsColumns }}>
              {eventsByDay.map((dayEvents, colIdx) => (
                <div key={colIdx} style={{ position: 'relative' }}>
                  {dayEvents.map((ev) => {
                    if (ev.isAllDay) return null;
                    const startMin = parseTimeToMinutes(ev.startTime);
                    const endMin = parseTimeToMinutes(ev.endTime);
                    const clampedStart = Math.max(startMin, HOUR_START * 60);
                    const clampedEnd = Math.min(endMin > 0 ? endMin : startMin + 60, HOUR_END * 60);
                    if (clampedStart >= HOUR_END * 60 || clampedEnd <= HOUR_START * 60) return null;
                    const topPx = ((clampedStart - HOUR_START * 60) / 60) * ROW_H;
                    const heightPx = Math.max(((clampedEnd - clampedStart) / 60) * ROW_H, 20);
                    const color = getEventColor(ev);

                    return (
                      <div
                        key={ev.id}
                        title={ev.title}
                        onClick={() => setSelectedEvent(ev)}
                        style={{
                          position: 'absolute',
                          top: topPx,
                          left: '2px',
                          right: '2px',
                          height: heightPx,
                          background: color.bg,
                          border: `1px solid ${color.border}`,
                          borderRadius: '4px',
                          padding: '2px 4px',
                          overflow: 'hidden',
                          zIndex: 2,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: color.text, fontWeight: 500, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.title}
                        </div>
                        {heightPx > 36 && ev.startTime && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '7px', color: color.text, opacity: 0.7, marginTop: '1px' }}>
                            {ev.startTime}{ev.endTime ? ` – ${ev.endTime}` : ''}
                          </div>
                        )}
                        {ev.meetingUrl && (
                          <Video style={{ width: 8, height: 8, position: 'absolute', bottom: 2, right: 2, color: color.text, opacity: 0.6 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Now-line — only on today column, position fixed with CSS calc */}
            {todayColIndex >= 0 && nowTopPx >= 0 && nowTopPx <= totalHeight && (
              <div
                ref={nowLineRef}
                style={{
                  position: 'absolute',
                  top: nowTopPx,
                  left: `calc(${GUTTER_W}px + ${todayColIndex} * (100% - ${GUTTER_W}px) / ${columnCount})`,
                  width: `calc((100% - ${GUTTER_W}px) / ${columnCount})`,
                  height: '2px',
                  background: 'var(--ice)',
                  zIndex: 10,
                  boxShadow: '0 0 4px rgba(64,200,240,0.6)',
                  pointerEvents: 'none',
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '-4px',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: 'var(--ice)',
                  boxShadow: '0 0 6px rgba(64,200,240,0.8)',
                }} />
                <span style={{
                  position: 'absolute',
                  left: '12px',
                  top: '-8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--ice2)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0 3px',
                  borderRadius: '3px',
                }}>
                  {formatNowTime(nowMinutes)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
/div>
    </>
  );
}
