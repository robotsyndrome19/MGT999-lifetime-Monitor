/**
 * Analytics page — live telemetry charts for robot axes and gripper cylinders.
 * Receives a rolling `history` buffer (last 60 snapshots at 2 s cadence = 2 min window)
 * and the latest `data` snapshot so KPI cards always show the freshest values.
 *
 * Visual language follows the REDLINE MONITOR design:
 *   · light theme primary (full dark-mode support retained via `theme` prop)
 *   · two-tone section headers — accent word in red, rest in foreground
 *   · bar charts for per-axis temperature / torque / current
 *   · a real-time overview bar chart across the history window
 *   · colored legend badges top-right of each panel
 */

import { useState, useEffect } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LabelList,
  TooltipProps,
} from 'recharts';
import { Thermometer, Zap, CircleDot, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { RobotData, DataSnapshot } from './types';
import { useLang } from './i18n';

// ─── constants ───────────────────────────────────────────────────────────────

const RED = '#dc2626';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// Set to real API endpoint when available, e.g. 'https://your-api.com/sessions/weekly'
const SESSION_API_URL = '';

type SessionApiData = Record<string, Array<{ start: number; end: number | null }>>;

function generateMockSessionData(): SessionApiData {
  const todayIdx = (new Date().getDay() + 6) % 7;
  const allSessions: SessionApiData = {
    Mon: [{ start: 6,           end: 18 + 45/60 }],
    Tue: [{ start: 6,           end: 21 + 30/60 }],
    Wed: [{ start: 9,           end: 18 + 54/60 }],
    Thu: [{ start: 6,           end: 22 + 24/60 }],
    Fri: [{ start: 5 + 55/60,  end: 19 + 19/60 }],
    Sat: [{ start: 4 + 5/60,   end: 16 + 35/60 }],
    Sun: [],
  };
  return Object.fromEntries(
    WEEKDAYS.map((day, i) => {
      if (i > todayIdx) return [day, []];
      if (i === todayIdx) {
        const s = allSessions[day]?.[0];
        return [day, s ? [{ start: s.start, end: null }] : []];
      }
      return [day, allSessions[day] ?? []];
    })
  );
}

async function fetchSessionData(): Promise<SessionApiData> {
  if (!SESSION_API_URL) return generateMockSessionData();
  try {
    const res = await fetch(SESSION_API_URL);
    if (!res.ok) throw new Error('fetch failed');
    return res.json() as Promise<SessionApiData>;
  } catch {
    return generateMockSessionData();
  }
}

const AXIS_COLORS: Record<string, string> = {
  'Axis 1': '#ef4444',
  'Axis 2': '#f59e0b',
  'Axis 3': '#3b82f6',
  'Axis 5': '#10b981',
  'Axis 6': '#8b5cf6',
};

const HEALTH_THRESHOLDS = { warning: 45, critical: 48 } as const;

// ─── types ───────────────────────────────────────────────────────────────────

interface AnalyticsProps {
  data: RobotData;
  history: DataSnapshot[];
  theme: 'dark' | 'light';
  isRobotOn: boolean;
}

interface Session {
  date: string;
  start: number;
  end: number | null;
}

// ─── session helpers ──────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadSessions(): Session[] {
  try { return JSON.parse(localStorage.getItem('robot_sessions') ?? '[]'); }
  catch { return []; }
}

function saveSessions(s: Session[]): void {
  localStorage.setItem('robot_sessions', JSON.stringify(s.slice(-200)));
}

function fmtTimeDot(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}.${String(mm).padStart(2, '0')}`;
}

// ─── helpers ─────────────────────────────────────────────────────────────────


function formatAxisLabel(id: string): string {
  const m = id.match(/(\d+)/);
  if (m) return `AXIS_${m[1].padStart(2, '0')}`;
  return id.toUpperCase().replace(/\s+/g, '_');
}

// ─── sub-components ──────────────────────────────────────────────────────────

function BarTooltip({
  active,
  payload,
  label,
  unit,
  isDark,
}: TooltipProps<number, string> & { unit?: string; isDark: boolean }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-xs shadow-2xl min-w-[96px] ${
        isDark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
      }`}
    >
      <p
        className={`font-mono mb-1 text-[10px] uppercase tracking-widest ${
          isDark ? 'text-zinc-500' : 'text-zinc-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`font-mono font-semibold tabular-nums ${
          isDark ? 'text-white' : 'text-zinc-900'
        }`}
      >
        {typeof v === 'number' ? v.toFixed(1) : v}
        {unit}
      </p>
    </div>
  );
}

function AxisCategoryTick({
  x = 0,
  y = 0,
  payload,
  highlight,
  isDark,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  highlight: string;
  isDark: boolean;
}) {
  const value = payload?.value ?? '';
  const hi = value === highlight;
  return (
    <text
      x={x}
      y={y + 12}
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, monospace"
      fontSize={10}
      fontWeight={hi ? 700 : 400}
      fill={hi ? RED : isDark ? '#a1a1aa' : '#71717a'}
    >
      {value}
    </text>
  );
}

function SectionHeader({
  accent,
  rest,
  sub,
  legend,
  isDark,
}: {
  accent: string;
  rest?: string;
  sub: string;
  legend?: { label: string; color: string };
  isDark: boolean;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-widest">
          <span className="text-red-600">{accent}</span>
          {rest ? (
            <span className={isDark ? ' text-white' : ' text-zinc-900'}>
              {` ${rest}`}
            </span>
          ) : null}
        </h3>
        <p
          className={`text-[10px] mt-0.5 uppercase tracking-widest ${
            isDark ? 'text-zinc-600' : 'text-zinc-400'
          }`}
        >
          {sub}
        </p>
      </div>
      {legend && (
        <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
          <span
            className="w-2.5 h-2.5 rounded-[2px] inline-block"
            style={{ background: legend.color }}
          />
          <span
            className={`text-[10px] font-semibold uppercase tracking-widest ${
              isDark ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {legend.label}
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyState({ isDark, message }: { isDark: boolean; message: string }) {
  return (
    <div
      className={`flex items-center justify-center h-40 text-xs uppercase tracking-widest ${
        isDark ? 'text-zinc-700' : 'text-zinc-400'
      }`}
    >
      <span className="animate-pulse">{message}</span>
    </div>
  );
}

// ─── Semi-circle SVG Gauge ───────────────────────────────────────────────────
// Arc from 9 o'clock → 12 o'clock → 3 o'clock (sweep=1 = clockwise in SVG).

function SemiGauge({ pct, color, isDark }: { pct: number; color: string; isDark: boolean }) {
  const r = 52;
  const cx = 80;
  const cy = 74;
  const sw = 13;

  const bgD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const theta = Math.PI * (1 - Math.min(pct, 100) / 100);
  const endX = cx + r * Math.cos(theta);
  const endY = cy - r * Math.sin(theta);
  const fgD =
    pct <= 0
      ? ''
      : pct >= 100
        ? bgD
        : `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${endX} ${endY}`;

  return (
    <svg viewBox="0 0 160 84" className="w-full">
      <path d={bgD} fill="none" stroke={isDark ? '#27272a' : '#e5e7eb'} strokeWidth={sw} strokeLinecap="round" />
      {pct > 0 && (
        <path d={fgD} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      )}
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fill={isDark ? '#ffffff' : '#111827'}
        fontFamily="ui-monospace, monospace"
      >
        {pct}%
      </text>
    </svg>
  );
}

// ─── Horizontal Temperature Bar ──────────────────────────────────────────────

const TEMP_SCALE = 100;

function cylinderLabel(id: string): string {
  return id
    .replace(' cylinder', '')
    .replace(' left', ' L')
    .replace(' right', ' R')
    .toUpperCase();
}

function TempBar({ label, current, avg, min, max, isDark }: { label: string; current: number; avg: number; min: number; max: number; isDark: boolean }) {
  const range = max - min || 1;
  const fillPct = Math.min(100, Math.max(0, ((current - min) / range) * 100));
  const avgPct = Math.min(100, Math.max(0, ((avg - min) / range) * 100));

  return (
    <div className="flex items-start gap-3">
      <span className={`w-14 pt-4 text-xs font-bold uppercase tracking-widest flex-shrink-0 text-right ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
        {label.toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        {/* Floating labels */}
        <div className="relative h-5 select-none">
          <span className={`absolute left-0 text-[11px] font-semibold uppercase tracking-widest leading-none ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            MIN
          </span>
          <span
            className="absolute text-[11px] font-semibold uppercase tracking-widest text-emerald-500 leading-none"
            style={{ left: `${avgPct}%`, transform: 'translateX(-50%)' }}
          >
            AVG
          </span>
          <span className={`absolute right-0 text-[11px] font-semibold uppercase tracking-widest leading-none ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
            MAX
          </span>
        </div>
        {/* Bar */}
        <div className={`relative h-3.5 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-red-600 transition-all duration-700"
            style={{ width: `${fillPct}%` }}
          />
          <div
            className="absolute top-0 h-full w-[2px] bg-emerald-500 z-10 -translate-x-px"
            style={{ left: `${avgPct}%` }}
          />
          <span
            className="absolute z-20 text-[11px] font-mono font-bold pointer-events-none whitespace-nowrap"
            style={{
              left: `${fillPct}%`,
              top: '50%',
              transform: fillPct > 85
                ? 'translateX(-110%) translateY(-50%)'
                : 'translateX(4px) translateY(-50%)',
              color: fillPct > 85 ? '#fff' : '#ef4444',
            }}
          >
            {current.toFixed(1)}
          </span>
        </div>
        {/* Scale numbers */}
        <div className="relative mt-1">
          <span className={`text-[11px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{min.toFixed(1)}</span>
          <span
            className="absolute text-[11px] font-mono text-emerald-500 -translate-x-1/2"
            style={{ left: `${avgPct}%` }}
          >
            {avg.toFixed(1)}
          </span>
          <span className={`absolute right-0 text-[11px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>{max.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Analytics({ data, history, theme, isRobotOn }: AnalyticsProps) {
  const isDark = theme === 'dark';
  const { t } = useLang();

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => {
    const date = todayStr();
    const hours = new Date().getHours() + new Date().getMinutes() / 60;
    const sessions = loadSessions();
    const hasOpenToday = sessions.some((s) => s.date === date && s.end === null);

    if (isRobotOn && !hasOpenToday) {
      sessions.push({ date, start: hours, end: null });
      saveSessions(sessions);
    } else if (!isRobotOn && hasOpenToday) {
      for (let i = sessions.length - 1; i >= 0; i--) {
        if (sessions[i].date === date && sessions[i].end === null) {
          sessions[i].end = hours;
          break;
        }
      }
      saveSessions(sessions);
    }
  }, [isRobotOn]);

  const [sessionApiData, setSessionApiData] = useState<SessionApiData>(() => generateMockSessionData());
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const d = await fetchSessionData();
      if (alive) setSessionApiData(d);
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── derived values ────────────────────────────────────────────────────────
  const axisEntries = Object.entries(data.robot_axis);
  const axisValues = axisEntries.map(([, a]) => a);
  const axisIds = axisEntries.map(([id]) => id);

  const avgTemp = axisValues.reduce((s, a) => s + a.temp, 0) / axisValues.length;
  const avgTorque = axisValues.reduce((s, a) => s + a.torque, 0) / axisValues.length;
  const avgCurrent = axisValues.reduce((s, a) => s + a.current, 0) / axisValues.length;
  const peakTemp = Math.max(...axisValues.map((a) => a.temp));
  const peakTorque = Math.max(...axisValues.map((a) => a.torque));
  const peakCurrent = Math.max(...axisValues.map((a) => a.current));

  const pickMaxId = (key: 'temp' | 'torque' | 'current') => {
    let id = '';
    let mx = -Infinity;
    axisEntries.forEach(([k, a]) => {
      if (a[key] > mx) { mx = a[key]; id = k; }
    });
    return formatAxisLabel(id);
  };
  const hotTempLabel = pickMaxId('temp');
  const hotTorqueLabel = pickMaxId('torque');
  const hotCurrentLabel = pickMaxId('current');

  const tempBarData = axisEntries.map(([id, a]) => ({
    label: formatAxisLabel(id),
    value: parseFloat(a.temp.toFixed(1)),
  }));
  const torqueBarData = axisEntries.map(([id, a]) => ({
    label: formatAxisLabel(id),
    value: parseFloat(a.torque.toFixed(1)),
  }));
  const currentBarData = axisEntries.map(([id, a]) => ({
    label: formatAxisLabel(id),
    value: parseFloat(a.current.toFixed(2)),
  }));

  const todayIdx = (new Date().getDay() + 6) % 7;
  const nowHours = new Date().getHours() + new Date().getMinutes() / 60;
  const storedSessions = loadSessions();

  const MONTH_ABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'] as const;

  const overviewData = WEEKDAYS.map((day, i) => {
    const status = i < todayIdx ? 'past' as const : i === todayIdx ? 'today' as const : 'future' as const;
    const d = new Date();
    d.setDate(d.getDate() - (todayIdx - i));
    const dateStr = d.toISOString().slice(0, 10);
    const dateLabel = `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;

    const apiSessions = (sessionApiData[day] ?? []).map((s) => ({
      start: s.start,
      end: s.end ?? nowHours,
    }));

    if (status === 'future') {
      return { label: day, dateLabel, sessions: apiSessions, status };
    }

    const stored = storedSessions
      .filter((s) => s.date === dateStr)
      .map((s) => ({ start: s.start, end: s.end ?? nowHours }));

    return { label: day, dateLabel, sessions: apiSessions.length > 0 ? apiSessions : stored, status };
  });

  const overviewRowData = overviewData.map(({ label, sessions, status, dateLabel }) => {
    const totalHrs = sessions.reduce((s, seg) => s + (seg.end - seg.start), 0);
    return { label, sessions, status, totalHrs, dateLabel };
  });
  const maxHrsOverview = Math.max(
    ...overviewRowData.filter((r) => r.sessions.length > 0).map((r) => r.totalHrs),
    1,
  );
  const longestDayLabel = overviewRowData.reduce<typeof overviewRowData[0] | null>((best, r) => {
    if (r.sessions.length === 0 || r.status === 'future') return best;
    return r.totalHrs > (best?.totalHrs ?? 0) ? r : best;
  }, null)?.label;

  const healthCounts = axisValues.reduce(
    (acc, a) => {
      if (a.temp >= HEALTH_THRESHOLDS.critical) acc.critical++;
      else if (a.temp >= HEALTH_THRESHOLDS.warning) acc.warning++;
      else acc.normal++;
      return acc;
    },
    { normal: 0, warning: 0, critical: 0 },
  );

  const pieData = [
    { name: t.analytics.normal, value: healthCounts.normal, color: '#10b981' },
    { name: t.analytics.warning, value: healthCounts.warning, color: '#f59e0b' },
    { name: t.analytics.critical, value: healthCounts.critical, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  const cylinderBarData = Object.entries(data.gripper).map(([id, c]) => ({
    name: id.replace(' cylinder', ''),
    usage: Math.round((c.lifetime_act / c.limit_lifetime) * 100),
    fill: c.lifetime_act / c.limit_lifetime > 0.8 ? '#ef4444' : '#10b981',
  }));

  const axisStats = axisEntries.map(([id, a]) => {
    const temps = history
      .map((s) => s.axes[id]?.temp)
      .filter((v): v is number => v !== undefined);
    return {
      id,
      color: AXIS_COLORS[id] ?? '#6b7280',
      live: a.temp,
      min: temps.length ? Math.min(...temps) : a.temp,
      max: temps.length ? Math.max(...temps) : a.temp,
      avg: temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : a.temp,
    };
  });

  // Per-axis stats for TempBar (used in Figma section)
  const axisBarStats = axisEntries.map(([id, a]) => {
    const temps = history
      .map((s) => s.axes[id]?.temp)
      .filter((v): v is number => v !== undefined);
    return {
      id,
      current: a.temp,
      min: temps.length ? Math.min(...temps) : a.temp,
      max: temps.length ? Math.max(...temps) : a.temp,
      avg: temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : a.temp,
    };
  });

  // Gripper
  const cylinderEntries = Object.entries(data.gripper);
  const openCount = cylinderEntries.filter(([, c]) => c.reed_open).length;

  // ── theme tokens ──────────────────────────────────────────────────────────
  const grid = isDark ? '#27272a' : '#eef0f2';
  const tick = isDark ? '#71717a' : '#a1a1aa';
  const torqueFill = isDark ? '#e4e4e7' : '#3f3f46';
  const currentFill = isDark ? '#71717a' : '#a1a1aa';

  const card = `rounded-2xl border transition-colors duration-500 ${
    isDark ? 'bg-zinc-900/40 border-red-900/10' : 'bg-white border-zinc-200 shadow-sm'
  }`;
  const labelCls = `text-[10px] font-semibold uppercase tracking-widest ${
    isDark ? 'text-zinc-500' : 'text-zinc-400'
  }`;
  const valueCls = `text-2xl sm:text-3xl font-light font-mono mt-2 min-w-0 truncate ${
    isDark ? 'text-white' : 'text-zinc-900'
  }`;
  const subCls = `text-[10px] mt-1.5 uppercase tracking-widest ${
    isDark ? 'text-zinc-600' : 'text-zinc-400'
  }`;

  const tickProps = { fill: tick, fontSize: 10 };
  const tooltipCursor = {
    fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  };

  return (
    <div className="space-y-5 pb-4">
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              label: t.analytics.avgTemp,
              value: avgTemp.toFixed(1),
              unit: '°C',
              sub: `${t.analytics.peak} ${peakTemp.toFixed(1)} °C`,
              warn: peakTemp >= HEALTH_THRESHOLDS.critical,
              icon: <Thermometer size={18} className={isDark ? 'text-red-500' : 'text-red-600'} />,
              delay: 0,
            },
            {
              label: t.analytics.avgTorque,
              value: avgTorque.toFixed(1),
              unit: '%',
              sub: `${t.analytics.peak} ${peakTorque.toFixed(1)} %`,
              icon: <Zap size={18} className={isDark ? 'text-amber-500' : 'text-amber-600'} />,
              delay: 0.05,
            },
            {
              label: t.analytics.avgCurrent,
              value: avgCurrent.toFixed(2),
              unit: 'A',
              sub: `${t.analytics.peak} ${peakCurrent.toFixed(2)} A`,
              icon: <CircleDot size={18} className={isDark ? 'text-blue-500' : 'text-blue-600'} />,
              delay: 0.1,
            },
            {
              label: t.analytics.systemRuntime,
              value: data.robot_lifetime.runtime.toFixed(2),
              unit: 'hrs',
              sub: `${history.length} ${t.analytics.samplesCollected}`,
              icon: <Clock size={18} className={isDark ? 'text-emerald-500' : 'text-emerald-600'} />,
              delay: 0.15,
            },
          ] as const
        ).map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: kpi.delay }}
            className={`${card} p-5`}
          >
            <div className="flex items-center justify-between">
              <span className={labelCls}>{kpi.label}</span>
              {kpi.icon}
            </div>
            <div className={valueCls}>
              {kpi.value}
              <span className="text-sm text-zinc-500 ml-1">{kpi.unit}</span>
            </div>
            <p className={`${subCls} ${'warn' in kpi && kpi.warn ? 'text-amber-500' : ''}`}>
              {kpi.sub}
            </p>
          </motion.div>
        ))}
      </div>

      {/* ── Overview real-time ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`${card} p-5`}
      >
        <SectionHeader
          accent={t.analytics.overviewAccent}
          rest={t.analytics.overviewRest}
          sub={t.analytics.overviewSub}
          isDark={isDark}
        />

        {/* column headers */}
        <div
          className={`grid items-center mb-1 text-[9px] font-semibold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}
          style={{ gridTemplateColumns: '64px 52px 64px 1fr 52px', gap: '0 12px' }}
        >
          <span>{t.analytics.colDateDay}</span>
          <span>{t.analytics.colOpen}</span>
          <span>{t.analytics.colClose}</span>
          <span>{t.analytics.colActiveHours}</span>
          <span className="text-right">{t.analytics.colHours}</span>
        </div>

        {/* rows */}
        <div className="space-y-0.5">
          {overviewRowData.map(({ label, sessions, status, totalHrs, dateLabel }) => {
            const isToday = status === 'today';
            const isClosed = sessions.length === 0;
            const isActive = isToday && isRobotOn;
            const isLongest = label === longestDayLabel && !isActive;

            const barColor = isClosed
              ? 'transparent'
              : isActive ? '#22c55e'
              : isLongest ? '#dc2626'
              : isDark ? '#52525b' : '#71717a';

            const hoursColor = isActive ? '#22c55e'
              : isLongest ? '#dc2626'
              : isClosed ? (isDark ? '#52525b' : '#d1d5db')
              : isDark ? '#a1a1aa' : '#52525b';

            const openStr = isClosed ? '-' : fmtTimeDot(sessions[0].start);
            const closeStr = isClosed ? '-'
              : isActive ? t.analytics.now
              : fmtTimeDot(sessions[sessions.length - 1].end);
            const hoursStr = isClosed ? t.analytics.closedLabel : totalHrs.toFixed(1);
            const barPct = isClosed ? 0 : (totalHrs / maxHrsOverview) * 100;

            const dayColor = isActive
              ? '#22c55e'
              : isDark ? '#a1a1aa' : '#52525b';

            return (
              <div
                key={label}
                className="grid items-center py-2"
                style={{ gridTemplateColumns: '64px 52px 64px 1fr 52px', gap: '0 12px' }}
              >
                {/* DATE / DAY cell — two lines */}
                <div className="flex flex-col leading-none gap-0.5">
                  <span
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: dayColor }}
                  >
                    {label}
                  </span>
                  <span className={`text-[9px] uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    {dateLabel}
                  </span>
                </div>

                <span className={`text-[10px] font-mono ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  {openStr}
                </span>

                <span
                  className="text-[10px] font-mono font-semibold"
                  style={{ color: isActive ? '#22c55e' : isDark ? '#71717a' : '#71717a' }}
                >
                  {closeStr}
                </span>

                <div className={`relative h-3 sm:h-5 rounded ${isDark ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                  {barPct > 0 && (
                    <div
                      className="absolute left-0 top-0 h-full rounded"
                      style={{ width: `${barPct}%`, background: barColor }}
                    />
                  )}
                </div>

                <span className="text-[10px] font-mono font-semibold text-right" style={{ color: hoursColor }}>
                  {hoursStr}
                </span>
              </div>
            );
          })}
        </div>

        {/* legend */}
        <div className={`flex items-center gap-5 mt-4 pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-100'}`}>
          {[
            { label: t.analytics.legendActive, color: '#22c55e' },
            { label: t.analytics.legendComplete, color: isDark ? '#52525b' : '#71717a' },
            { label: t.analytics.legendLongest, color: '#dc2626' },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: color }} />
              <span className={`text-[9px] font-semibold uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Temperature trend (2/3) + Health donut (1/3) ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        <div className={`${card} p-5 lg:col-span-2`}>
          <SectionHeader
            accent={t.analytics.tempAccent}
            rest={t.analytics.tempRest}
            sub={t.analytics.tempSub}
            legend={{ label: t.analytics.avgTemp, color: RED }}
            isDark={isDark}
          />
          <div className="w-full aspect-[5/2] min-h-[150px] max-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={tempBarData}
                margin={{ top: isMobile ? 18 : 4, right: 8, left: -22, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: grid }}
                  interval={0}
                  tick={<AxisCategoryTick highlight={hotTempLabel} isDark={isDark} />}
                />
                <YAxis
                  tick={tickProps}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  unit="°"
                />
                <Tooltip
                  cursor={tooltipCursor}
                  content={(p) => <BarTooltip {...(p as TooltipProps<number, string>)} unit="°C" isDark={isDark} />}
                />
                <Bar
                  dataKey="value"
                  fill={RED}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={32}
                  isAnimationActive={false}
                >
                  {isMobile && (
                    <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => `${v.toFixed(1)}°`} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={`text-xs mt-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            <span className="font-bold" style={{ color: RED }}>{hotTempLabel}</span>
            {' – '}{t.analytics.highestTemp} ({peakTemp.toFixed(1)}°C)
          </p>
        </div>

        <div className={`${card} p-5 flex flex-col`}>
          <SectionHeader
            accent={t.analytics.healthAccent}
            rest={t.analytics.healthRest}
            sub={t.analytics.healthSub}
            isDark={isDark}
          />
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full h-[140px] sm:h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={4}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name: string) => [`${v} axes`, name]}
                    contentStyle={{
                      background: isDark ? '#18181b' : '#fff',
                      border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
                      borderRadius: '0.75rem',
                      fontSize: 11,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full flex items-center justify-center gap-4 mt-4">
              {[
                { name: t.analytics.normal, color: '#10b981' },
                { name: t.analytics.warning, color: '#f59e0b' },
                { name: t.analytics.critical, color: '#ef4444' },
              ].map((row) => (
                <div key={row.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm flex-shrink-0"
                    style={{ background: row.color }}
                  />
                  <span
                    className={`text-[10px] uppercase tracking-widest ${
                      isDark ? 'text-zinc-400' : 'text-zinc-500'
                    }`}
                  >
                    {row.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Torque load ───────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`${card} p-5`}
      >
        <SectionHeader
          accent={t.analytics.torqueAccent}
          rest={t.analytics.torqueRest}
          sub={t.analytics.torqueSub}
          legend={{ label: t.analytics.avgTorque, color: torqueFill }}
          isDark={isDark}
        />
        <div className="w-full aspect-[16/5] min-h-[160px] max-h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={torqueBarData}
              margin={{ top: isMobile ? 18 : 4, right: 8, left: -22, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: grid }}
                interval={0}
                tick={<AxisCategoryTick highlight={hotTorqueLabel} isDark={isDark} />}
              />
              <YAxis tick={tickProps} tickLine={false} axisLine={false} unit="%" />
              <Tooltip
                cursor={tooltipCursor}
                content={(p) => <BarTooltip {...(p as TooltipProps<number, string>)} unit="%" isDark={isDark} />}
              />
              <Bar
                dataKey="value"
                fill={torqueFill}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              >
                {isMobile && (
                  <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={`text-xs mt-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <span className="font-bold" style={{ color: RED }}>{hotTorqueLabel}</span>
          {' – '}{t.analytics.highestTorque} ({peakTorque.toFixed(1)}%)
        </p>
      </motion.div>

      {/* ── Current draw ──────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className={`${card} p-5`}
      >
        <SectionHeader
          accent={t.analytics.currentAccent}
          rest={t.analytics.currentRest}
          sub={t.analytics.currentSub}
          legend={{ label: t.analytics.avgCurrent, color: currentFill }}
          isDark={isDark}
        />
        <div className="w-full aspect-[16/5] min-h-[160px] max-h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={currentBarData}
              margin={{ top: isMobile ? 18 : 4, right: 8, left: -18, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: grid }}
                interval={0}
                tick={<AxisCategoryTick highlight={hotCurrentLabel} isDark={isDark} />}
              />
              <YAxis tick={tickProps} tickLine={false} axisLine={false} unit="A" />
              <Tooltip
                cursor={tooltipCursor}
                content={(p) => <BarTooltip {...(p as TooltipProps<number, string>)} unit="A" isDark={isDark} />}
              />
              <Bar
                dataKey="value"
                fill={currentFill}
                radius={[3, 3, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              >
                {isMobile && (
                  <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: tick }} formatter={(v: number) => `${v.toFixed(2)}A`} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={`text-xs mt-3 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          <span className="font-bold" style={{ color: RED }}>{hotCurrentLabel}</span>
          {' – '}{t.analytics.highestCurrent} ({peakCurrent.toFixed(2)} A)
        </p>
      </motion.div>

      {/* ── Temperature Statistics (Figma) ───────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.38 }}
        className={`${card} p-6`}
      >
        <SectionHeader
          accent={t.analytics.tempStatsAccent}
          rest={t.analytics.tempStatsRest}
          sub={`${t.analytics.tempStatsSub} · ${history.length} ${t.analytics.samples}`}
          isDark={isDark}
        />
        <div className="space-y-2">
          {axisBarStats.map((ax) => (
            <TempBar key={ax.id} label={ax.id} current={ax.current} min={ax.min} max={ax.max} avg={ax.avg} isDark={isDark} />
          ))}
        </div>
      </motion.div>

      {/* ── Gripper Lifetime (Figma gauges) ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={`${card} p-6`}
      >
        <SectionHeader
          accent={t.analytics.gripperAccent}
          rest={t.analytics.gripperRest}
          sub={t.analytics.gripperSub}
          isDark={isDark}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {cylinderEntries.map(([id, c]) => {
            const pct = Math.min(
              100,
              Math.round((c.lifetime_act / c.limit_lifetime) * 100),
            );
            const color = pct >= 70 ? '#dc2626' : '#22c55e';
            const name = cylinderLabel(id);
            return (
              <div
                key={id}
                className={`flex flex-col items-center rounded-xl border py-3 px-2 ${
                  isDark ? 'border-zinc-800' : 'border-zinc-100'
                }`}
              >
                <SemiGauge pct={pct} color={color} isDark={isDark} />
                <p
                  className={`text-[9.5px] font-bold uppercase tracking-widest mt-1 ${
                    isDark ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {name}
                </p>
                <p
                  className={`text-[9.5px] font-bold uppercase tracking-widest mt-0.5 ${
                    c.reed_open
                      ? 'text-emerald-500'
                      : isDark
                        ? 'text-zinc-600'
                        : 'text-zinc-300'
                  }`}
                >
                  {t.analytics.openCyl}
                </p>
              </div>
            );
          })}
          {/* Summary card */}
          <div
            className={`flex flex-col rounded-xl border py-3 px-4 ${
              isDark ? 'border-zinc-800' : 'border-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-[9.5px] font-bold uppercase tracking-widest ${
                  isDark ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                {t.analytics.summary}
              </span>
              <span className="text-[9.5px] font-bold uppercase tracking-widest text-red-500">
                {t.analytics.status}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center py-2">
              <span
                className={`text-5xl font-bold font-mono ${
                  isDark ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {openCount}/{cylinderEntries.length}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

    </div>
  );
}
