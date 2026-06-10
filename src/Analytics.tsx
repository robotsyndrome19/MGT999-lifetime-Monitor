/**
 * Analytics page — live telemetry charts for robot axes and gripper cylinders.
 * Receives a rolling `history` buffer (last 60 snapshots at 2 s cadence = 2 min window)
 * and the latest `data` snapshot so KPI cards always show the freshest values.
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  TooltipProps,
} from 'recharts';
import { Thermometer, Zap, CircleDot, Clock, TrendingUp, BarChart2 } from 'lucide-react';
import { motion } from 'motion/react';
import { RobotData, DataSnapshot } from './types';

// ─── constants ──────────────────────────────────────────────────────────────

const AXIS_COLORS: Record<string, string> = {
  'Axis 1': '#ef4444',
  'Axis 2': '#f59e0b',
  'Axis 3': '#3b82f6',
  'Axis 5': '#10b981',
  'Axis 6': '#8b5cf6',
};

const HEALTH_THRESHOLDS = { warning: 45, critical: 48 } as const;

// ─── types ──────────────────────────────────────────────────────────────────

interface AnalyticsProps {
  data: RobotData;
  history: DataSnapshot[];
  theme: 'dark' | 'light';
}

// recharts custom tooltip payload shape
interface TooltipEntry {
  dataKey: string;
  value: number;
  color: string;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  isDark,
}: TooltipProps<number, string> & { unit?: string; isDark: boolean }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-xs shadow-2xl min-w-[120px] ${
        isDark
          ? 'bg-zinc-900 border-zinc-700 text-zinc-300'
          : 'bg-white border-zinc-200 text-zinc-700'
      }`}
    >
      <p className={`font-mono mb-2 text-[10px] uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
        {label}
      </p>
      {(payload as TooltipEntry[]).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0"
              style={{ background: p.color }}
            />
            <span className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{p.dataKey}</span>
          </div>
          <span className="font-mono font-semibold tabular-nums">
            {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  sub,
  icon,
  isDark,
}: {
  title: string;
  sub: string;
  icon: React.ReactNode;
  isDark: boolean;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3
          className={`text-xs font-bold uppercase tracking-widest ${
            isDark ? 'text-white' : 'text-zinc-900'
          }`}
        >
          {title}
        </h3>
        <p className={`text-[10px] mt-0.5 uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
          {sub}
        </p>
      </div>
      <div className={isDark ? 'text-zinc-700' : 'text-zinc-300'}>{icon}</div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Analytics({ data, history, theme }: AnalyticsProps) {
  const isDark = theme === 'dark';

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

  // Health distribution
  const healthCounts = axisValues.reduce(
    (acc, a) => {
      if (a.temp >= HEALTH_THRESHOLDS.critical) acc.critical++;
      else if (a.temp >= HEALTH_THRESHOLDS.warning) acc.warning++;
      else acc.normal++;
      return acc;
    },
    { normal: 0, warning: 0, critical: 0 }
  );

  const pieData = [
    { name: 'Normal', value: healthCounts.normal, color: '#10b981' },
    { name: 'Warning', value: healthCounts.warning, color: '#f59e0b' },
    { name: 'Critical', value: healthCounts.critical, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Gripper cylinder bar data
  const cylinderBarData = Object.entries(data.gripper).map(([id, c]) => ({
    name: id.replace(' cylinder', ''),
    usage: Math.round((c.lifetime_act / c.limit_lifetime) * 100),
    fill: c.lifetime_act / c.limit_lifetime > 0.8 ? '#ef4444' : '#10b981',
  }));

  // Per-axis stats over history window
  const axisStats = axisEntries.map(([id, a]) => {
    const temps = history.map((s) => s.axes[id]?.temp).filter((v): v is number => v !== undefined);
    return {
      id,
      color: AXIS_COLORS[id] ?? '#6b7280',
      live: a.temp,
      min: temps.length ? Math.min(...temps) : a.temp,
      max: temps.length ? Math.max(...temps) : a.temp,
      avg: temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : a.temp,
    };
  });

  // History series for line charts — reshape into recharts row objects
  const tempSeries = history.map((snap) => {
    const row: Record<string, number | string> = { label: snap.label };
    axisIds.forEach((id) => {
      row[id] = parseFloat((snap.axes[id]?.temp ?? 0).toFixed(1));
    });
    return row;
  });

  const torqueSeries = history.map((snap) => {
    const row: Record<string, number | string> = { label: snap.label };
    axisIds.forEach((id) => {
      row[id] = parseFloat((snap.axes[id]?.torque ?? 0).toFixed(1));
    });
    return row;
  });

  const currentSeries = history.map((snap) => {
    const row: Record<string, number | string> = { label: snap.label };
    axisIds.forEach((id) => {
      row[id] = parseFloat((snap.axes[id]?.current ?? 0).toFixed(2));
    });
    return row;
  });

  // ── theme tokens ──────────────────────────────────────────────────────────
  const grid = isDark ? '#27272a' : '#e4e4e7';
  const tick = isDark ? '#71717a' : '#a1a1aa';
  const card = `rounded-2xl border backdrop-blur-sm transition-colors duration-500 ${
    isDark ? 'bg-zinc-900/40 border-red-900/10' : 'bg-white border-zinc-200 shadow-sm'
  }`;
  const labelCls = `text-[10px] font-semibold uppercase tracking-widest ${
    isDark ? 'text-zinc-500' : 'text-zinc-400'
  }`;
  const valueCls = `text-2xl sm:text-3xl font-light font-mono mt-2 min-w-0 truncate ${isDark ? 'text-white' : 'text-zinc-900'}`;
  const subCls = `text-[10px] mt-1.5 uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`;

  // shared XAxis / YAxis tick props
  const tickProps = { fill: tick, fontSize: 10 };

  return (
    <div className="space-y-5 pb-4">
      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          {
            label: 'Avg Temperature',
            value: avgTemp.toFixed(1),
            unit: '°C',
            sub: `Peak ${peakTemp.toFixed(1)} °C`,
            warn: peakTemp >= HEALTH_THRESHOLDS.critical,
            icon: <Thermometer size={18} className={isDark ? 'text-red-500' : 'text-red-700'} />,
            delay: 0,
          },
          {
            label: 'Avg Torque',
            value: avgTorque.toFixed(1),
            unit: '%',
            sub: `Peak ${peakTorque.toFixed(1)} %`,
            icon: <Zap size={18} className={isDark ? 'text-amber-500' : 'text-amber-600'} />,
            delay: 0.05,
          },
          {
            label: 'Avg Current',
            value: avgCurrent.toFixed(2),
            unit: 'A',
            sub: `Peak ${peakCurrent.toFixed(2)} A`,
            icon: <CircleDot size={18} className={isDark ? 'text-blue-500' : 'text-blue-600'} />,
            delay: 0.1,
          },
          {
            label: 'System Runtime',
            value: data.robot_lifetime.runtime.toFixed(2),
            unit: 'hrs',
            sub: `${history.length} samples collected`,
            icon: <Clock size={18} className={isDark ? 'text-emerald-500' : 'text-emerald-600'} />,
            delay: 0.15,
          },
        ] as const).map((kpi) => (
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
            <p className={`${subCls} ${'warn' in kpi && kpi.warn ? 'text-amber-500' : ''}`}>{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Temperature trend (2/3) + Health donut (1/3) ─────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Temperature line chart */}
        <div className={`${card} p-5 lg:col-span-2`}>
          <SectionHeader
            title="Temperature Trend"
            sub="Live axis temps · °C · last 2 min"
            icon={<TrendingUp size={16} />}
            isDark={isDark}
          />
          {history.length < 2 ? (
            <EmptyState isDark={isDark} message="Collecting data…" />
          ) : (
            <div className="w-full aspect-[5/2] min-h-[150px] max-h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tempSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis
                  dataKey="label"
                  tick={tickProps}
                  tickLine={false}
                  axisLine={{ stroke: grid }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={tickProps}
                  tickLine={false}
                  axisLine={false}
                  domain={['auto', 'auto']}
                  unit="°"
                />
                <Tooltip content={(p) => <ChartTooltip {...p} unit="°C" isDark={isDark} />} />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 10, color: tick, paddingTop: 10 }}
                />
                {axisIds.map((id) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={AXIS_COLORS[id] ?? '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Health donut */}
        <div className={`${card} p-5 flex flex-col`}>
          <SectionHeader
            title="Axis Health"
            sub="Temperature threshold status"
            icon={<CircleDot size={16} />}
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

            <div className="w-full space-y-2 mt-1">
              {[
                { name: 'Normal', count: healthCounts.normal, color: '#10b981', range: '< 45 °C' },
                { name: 'Warning', count: healthCounts.warning, color: '#f59e0b', range: '45–48 °C' },
                { name: 'Critical', count: healthCounts.critical, color: '#ef4444', range: '≥ 48 °C' },
              ].map((row) => (
                <div key={row.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: row.color }}
                    />
                    <span className={`text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {row.name}
                      <span className={`ml-1 ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
                        ({row.range})
                      </span>
                    </span>
                  </div>
                  <span
                    className={`text-xs font-mono font-semibold tabular-nums ${
                      isDark ? 'text-zinc-300' : 'text-zinc-700'
                    }`}
                  >
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Gripper lifetime bar + Axis stats table ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Cylinder bar chart */}
        <div className={`${card} p-5`}>
          <SectionHeader
            title="Gripper Lifetime"
            sub="Cylinder usage · % of max cycles"
            icon={<BarChart2 size={16} />}
            isDark={isDark}
          />
          <div className="w-full aspect-[2/1] min-h-[140px] max-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={cylinderBarData}
              layout="vertical"
              margin={{ top: 0, right: 20, left: 4, bottom: 0 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={tickProps}
                tickLine={false}
                axisLine={{ stroke: grid }}
                unit="%"
              />
              <YAxis
                dataKey="name"
                type="category"
                tick={tickProps}
                tickLine={false}
                axisLine={false}
                width={84}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, 'Usage']}
                contentStyle={{
                  background: isDark ? '#18181b' : '#fff',
                  border: `1px solid ${isDark ? '#3f3f46' : '#e4e4e7'}`,
                  borderRadius: '0.75rem',
                  fontSize: 11,
                }}
              />
              <Bar dataKey="usage" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {cylinderBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className={`mt-3 flex items-center gap-5 ${labelCls}`}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
              Normal &lt; 80 %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />
              Replace ≥ 80 %
            </span>
          </div>
        </div>

        {/* Axis stats table */}
        <div className={`${card} p-5`}>
          <SectionHeader
            title="Temperature Statistics"
            sub={`Session window · ${history.length} samples`}
            icon={<Thermometer size={16} />}
            isDark={isDark}
          />
          <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[260px]">
          <div
            className={`grid grid-cols-5 gap-2 pb-2 mb-1 border-b text-[10px] uppercase tracking-widest font-semibold ${
              isDark ? 'border-zinc-800 text-zinc-600' : 'border-zinc-100 text-zinc-400'
            }`}
          >
            <span>Axis</span>
            <span className="text-right">Live</span>
            <span className="text-right">Min</span>
            <span className="text-right">Max</span>
            <span className="text-right">Avg</span>
          </div>
          {axisStats.map((ax) => (
            <div
              key={ax.id}
              className={`grid grid-cols-5 gap-2 py-2.5 text-xs border-b last:border-0 ${
                isDark ? 'border-zinc-800/40' : 'border-zinc-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: ax.color }}
                />
                <span className={`font-mono text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {ax.id}
                </span>
              </div>
              <span
                className={`text-right font-mono tabular-nums ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                {ax.live.toFixed(1)}
              </span>
              <span
                className={`text-right font-mono tabular-nums ${
                  isDark ? 'text-zinc-500' : 'text-zinc-500'
                }`}
              >
                {ax.min.toFixed(1)}
              </span>
              <span
                className={`text-right font-mono tabular-nums ${
                  ax.max >= HEALTH_THRESHOLDS.critical
                    ? 'text-red-500'
                    : ax.max >= HEALTH_THRESHOLDS.warning
                    ? 'text-amber-500'
                    : isDark
                    ? 'text-zinc-500'
                    : 'text-zinc-500'
                }`}
              >
                {ax.max.toFixed(1)}
              </span>
              <span
                className={`text-right font-mono tabular-nums ${
                  isDark ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                {ax.avg.toFixed(1)}
              </span>
            </div>
          ))}
          <p className={`mt-3 text-[10px] uppercase tracking-widest ${isDark ? 'text-zinc-700' : 'text-zinc-400'}`}>
            All values in °C — max shown red if ≥ {HEALTH_THRESHOLDS.critical} °C
          </p>
          </div>
          </div>
        </div>
      </motion.div>

      {/* ── Torque trend + Current draw trend ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <div className={`${card} p-5`}>
          <SectionHeader
            title="Torque Load"
            sub="Axis torque · % of rated"
            icon={<Zap size={16} />}
            isDark={isDark}
          />
          {history.length < 2 ? (
            <EmptyState isDark={isDark} message="Collecting data…" />
          ) : (
            <div className="w-full aspect-[2/1] min-h-[140px] max-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={torqueSeries} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis
                  dataKey="label"
                  tick={tickProps}
                  tickLine={false}
                  axisLine={{ stroke: grid }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={tickProps} tickLine={false} axisLine={false} unit="%" />
                <Tooltip content={(p) => <ChartTooltip {...p} unit="%" isDark={isDark} />} />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 10, color: tick, paddingTop: 8 }}
                />
                {axisIds.map((id) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={AXIS_COLORS[id] ?? '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className={`${card} p-5`}>
          <SectionHeader
            title="Current Draw"
            sub="Axis current · amperes"
            icon={<CircleDot size={16} />}
            isDark={isDark}
          />
          {history.length < 2 ? (
            <EmptyState isDark={isDark} message="Collecting data…" />
          ) : (
            <div className="w-full aspect-[2/1] min-h-[140px] max-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={currentSeries} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} />
                <XAxis
                  dataKey="label"
                  tick={tickProps}
                  tickLine={false}
                  axisLine={{ stroke: grid }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={tickProps} tickLine={false} axisLine={false} unit="A" />
                <Tooltip content={(p) => <ChartTooltip {...p} unit="A" isDark={isDark} />} />
                <Legend
                  iconType="circle"
                  iconSize={7}
                  wrapperStyle={{ fontSize: 10, color: tick, paddingTop: 8 }}
                />
                {axisIds.map((id) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={AXIS_COLORS[id] ?? '#6b7280'}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Gripper status strip ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className={`${card} p-5`}
      >
        <SectionHeader
          title="Gripper Cylinder Status"
          sub="Real-time reed sensor states"
          icon={<BarChart2 size={16} />}
          isDark={isDark}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Object.entries(data.gripper).map(([id, c]) => {
            const pct = Math.round((c.lifetime_act / c.limit_lifetime) * 100);
            const overLimit = pct >= 80;
            return (
              <div
                key={id}
                className={`rounded-xl border p-3 transition-colors duration-300 ${
                  overLimit
                    ? isDark
                      ? 'border-red-900/50 bg-red-900/10'
                      : 'border-red-200 bg-red-50'
                    : isDark
                    ? 'border-zinc-800 bg-zinc-800/30'
                    : 'border-zinc-100 bg-zinc-50'
                }`}
              >
                <p
                  className={`text-[10px] font-semibold uppercase tracking-tight truncate mb-2 ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                >
                  {id.replace(' cylinder', '')}
                </p>
                <p
                  className={`text-xl font-mono font-light tabular-nums mb-2 ${
                    overLimit ? 'text-red-500' : isDark ? 'text-white' : 'text-zinc-900'
                  }`}
                >
                  {pct}%
                </p>
                <div
                  className={`h-1 w-full rounded-full mb-2 ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      overLimit ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex gap-1 mt-1">
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest ${
                      c.reed_open
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : isDark
                        ? 'bg-zinc-800 text-zinc-600'
                        : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    Open
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest ${
                      c.reed_close
                        ? isDark
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-red-100 text-red-600'
                        : isDark
                        ? 'bg-zinc-800 text-zinc-600'
                        : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    Close
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

// ─── helper ──────────────────────────────────────────────────────────────────

function EmptyState({ isDark, message }: { isDark: boolean; message: string }) {
  return (
    <div className={`flex items-center justify-center h-40 text-xs uppercase tracking-widest ${
      isDark ? 'text-zinc-700' : 'text-zinc-400'
    }`}>
      <span className="animate-pulse">{message}</span>
    </div>
  );
}
