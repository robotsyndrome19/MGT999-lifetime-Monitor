/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  Zap,
  Thermometer,
  Clock,
  CircleDot,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Bell,
  User,
  Box,
  Sun,
  Moon,
  X,
  Shield,
  FileText,
  HelpCircle,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { RobotData, RobotAxisData, CylinderData, DataSnapshot } from './types';
import Analytics from './Analytics';

interface MarkerPosition {
  x: number;
  y: number;
}

interface SystemLogEntry {
  id: string;
  level: 'info' | 'warn' | 'success';
  message: string;
  timestamp: string;
}

const ROBOT_AXIS_MARKERS: Record<string, MarkerPosition> = {
  'Axis 1': { x: 60, y: 39 },
  'Axis 2': { x: 39, y: 41 },
  'Axis 3': { x: 74, y: 16 },
  'Axis 5': { x: 31, y: 14.5 },
  'Axis 6': { x: 26.5, y: 12 },
};

const GRIPPER_MARKERS: Record<string, MarkerPosition> = {
  'Fork cylinder L': { x: 22.5, y: 26 },
  'Center cylinder L': { x: 26.5, y: 39.5 },
  'Pusher': { x: 50, y: 54 },
  'Center cylinder R': { x: 73.5, y: 39.5 },
  'Fork cylinder R': { x: 77.5, y: 26 },
};

// Mock data generator
const generateMockData = (): RobotData => {
  const axes: { [key: string]: RobotAxisData } = {};
  for (let i = 1; i <= 6; i++) {
    if (i === 4) continue;
    axes[`Axis ${i}`] = {
      temp: 35 + Math.random() * 15,
      torque: 10 + Math.random() * 40,
      current: 2 + Math.random() * 8,
    };
  }

  const cylinders: { [key: string]: CylinderData } = {
    'Fork cylinder L': { lifetime_act: 85000 + Math.floor(Math.random() * 100), limit_lifetime: 150000, reed_open: true, reed_close: false },
    'Center cylinder L': { lifetime_act: 42000 + Math.floor(Math.random() * 100), limit_lifetime: 150000, reed_open: false, reed_close: true },
    'Pusher': { lifetime_act: 120000 + Math.floor(Math.random() * 100), limit_lifetime: 150000, reed_open: true, reed_close: false },
    'Center cylinder R': { lifetime_act: 41500 + Math.floor(Math.random() * 100), limit_lifetime: 150000, reed_open: false, reed_close: true },
    'Fork cylinder R': { lifetime_act: 84000 + Math.floor(Math.random() * 100), limit_lifetime: 150000, reed_open: true, reed_close: false },
  };

  return {
    robot_lifetime: {
      runtime: 12450 + Math.random() * 10,
    },
    robot_axis: axes,
    gripper: cylinders,
  };
};

// Update this URL to point to the deployed Palletizer Monitor dashboard
const PALLETIZER_URL = 'https://palletizer-mgt-dashboard-monitor.up.railway.app/';

const INITIAL_DATA = generateMockData();

function createSnapshot(data: RobotData): DataSnapshot {
  const axisValues = Object.values(data.robot_axis);
  return {
    timestamp: Date.now(),
    label: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    axes: Object.fromEntries(
      Object.entries(data.robot_axis).map(([id, ax]) => [
        id,
        { temp: ax.temp, torque: ax.torque, current: ax.current },
      ])
    ),
    avgTemp: axisValues.reduce((s, a) => s + a.temp, 0) / axisValues.length,
    avgTorque: axisValues.reduce((s, a) => s + a.torque, 0) / axisValues.length,
    avgCurrent: axisValues.reduce((s, a) => s + a.current, 0) / axisValues.length,
  };
}

function formatLogTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function createLogEntry(level: SystemLogEntry['level'], message: string): SystemLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level,
    message,
    timestamp: formatLogTimestamp(),
  };
}

function createInitialLogs(data: RobotData): SystemLogEntry[] {
  return [
    createLogEntry('success', 'System initialization complete.'),
    createLogEntry('info', `${Object.keys(data.robot_axis).length} robot axes telemetry streams active.`),
    createLogEntry('info', `Runtime counter initialized at ${data.robot_lifetime.runtime.toFixed(2)} hours.`),
  ];
}

function buildDynamicLogs(previousData: RobotData, nextData: RobotData): SystemLogEntry[] {
  const entries: SystemLogEntry[] = [];
  const hottestAxis = (Object.entries(nextData.robot_axis) as [string, RobotAxisData][])
    .sort(([, a], [, b]) => b.temp - a.temp)[0];
  const highestUsageCylinder = (Object.entries(nextData.gripper) as [string, CylinderData][])
    .sort(([, a], [, b]) => (b.lifetime_act / b.limit_lifetime) - (a.lifetime_act / a.limit_lifetime))[0];

  if (hottestAxis) {
    const [axisId, axis] = hottestAxis;
    const previousAxis = previousData.robot_axis[axisId];
    if (!previousAxis || Math.abs(axis.temp - previousAxis.temp) >= 1.5) {
      entries.push(createLogEntry(axis.temp >= 47 ? 'warn' : 'info', `${axisId} temperature updated to ${axis.temp.toFixed(1)}C.`));
    }
  }

  if (highestUsageCylinder) {
    const [cylinderId, cylinder] = highestUsageCylinder;
    const usagePercent = Math.round((cylinder.lifetime_act / cylinder.limit_lifetime) * 100);
    const previousCylinder = previousData.gripper[cylinderId];
    if (!previousCylinder || cylinder.lifetime_act !== previousCylinder.lifetime_act) {
      entries.push(createLogEntry(usagePercent >= 80 ? 'warn' : 'info', `${cylinderId} lifetime usage is now ${usagePercent}%.`));
    }
  }

  if (nextData.robot_lifetime.runtime - previousData.robot_lifetime.runtime >= 0.01) {
    entries.push(createLogEntry('success', `Runtime advanced to ${nextData.robot_lifetime.runtime.toFixed(2)} hours.`));
  }

  return entries.slice(0, 3);
}

export default function App() {
  const [data, setData] = useState<RobotData>(INITIAL_DATA);
  const [logs, setLogs] = useState<SystemLogEntry[]>(() => createInitialLogs(INITIAL_DATA));
  const [activeTab, setActiveTab] = useState<'overview' | 'axes' | 'gripper' | 'analytics'>('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [activeModal, setActiveModal] = useState<'privacy' | 'logs' | 'support' | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeAxis, setActiveAxis] = useState<string | null>(null);
  const [activeCylinder, setActiveCylinder] = useState<string | null>(null);
  const [analyticsHistory, setAnalyticsHistory] = useState<DataSnapshot[]>(() => [createSnapshot(INITIAL_DATA)]);

  const notifications = [
    { id: 1, type: 'error', message: 'Axis 3: Critical temperature threshold exceeded (52.4°C)', time: '2 mins ago' },
    { id: 2, type: 'warning', message: 'Gripper Cylinder 2: Approaching lifetime limit (85%)', time: '15 mins ago' },
    { id: 3, type: 'info', message: 'System Update: Firmware v2.4.1 successfully installed', time: '1 hour ago' },
  ];

  const dynamicNotifications = logs.slice(0, 3).map((entry) => ({
    id: entry.id,
    type: entry.level === 'warn' ? 'warning' : entry.level,
    message: entry.message,
    time: entry.timestamp,
    isUnread: !readNotificationIds.includes(entry.id),
  }));

  const unreadNotificationsCount = dynamicNotifications.filter((entry) => entry.isUnread).length;

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    console.log('App mounted, starting updates');

    const interval = setInterval(() => {
      setData(prev => {
        if (!prev) return generateMockData();
        const newData = generateMockData();
        newData.robot_lifetime.runtime = prev.robot_lifetime.runtime + 0.01;
        setLogs(prevLogs => [...buildDynamicLogs(prev, newData), ...prevLogs].slice(0, 10));
        setAnalyticsHistory(prevHistory => [...prevHistory, createSnapshot(newData)].slice(-60));
        return newData;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 font-sans selection:bg-red-500/30 ${
      theme === 'dark' ? 'bg-[#050505] text-zinc-300' : 'bg-white text-zinc-800'
    }`}>
      {/* Background Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] blur-[120px] rounded-full transition-opacity duration-1000 ${
          theme === 'dark' ? 'bg-red-900/10' : 'bg-red-200/30'
        }`} />
        <div className={`absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] blur-[120px] rounded-full transition-opacity duration-1000 ${
          theme === 'dark' ? 'bg-red-900/10' : 'bg-red-200/30'
        }`} />
      </div>

      {/* Navigation */}
      <nav className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-all duration-500 ${
        theme === 'dark' ? 'border-red-900/20 bg-black/60' : 'border-red-100 bg-white/80'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className={`p-2 -ml-2 md:hidden rounded-full transition-colors ${
                theme === 'dark' ? 'hover:bg-zinc-900 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded flex items-center justify-center shrink-0">
              <img
                src="/dna_logo.png"
                alt="DNA logo"
                className="w-full h-full object-contain scale-125"
              />
            </div>
            <span className={`text-sm sm:text-lg font-semibold tracking-tight uppercase transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>
              Redline <span className={theme === 'dark' ? 'text-red-500' : 'text-red-700'}>Monitor</span>
            </span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            {(['overview', 'axes', 'gripper', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-sm font-medium transition-all hover:text-red-500 uppercase tracking-widest relative py-1 ${
                  activeTab === tab 
                    ? (theme === 'dark' ? 'text-red-500' : 'text-red-700') 
                    : (theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400')
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <motion.div 
                    layoutId="activeTab"
                    className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full ${theme === 'dark' ? 'bg-red-500' : 'bg-red-700'}`}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 sm:gap-4 relative">
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-colors ${
                theme === 'dark' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100'
              }`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-500" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-600" />
              )}
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`p-2 rounded-full transition-colors relative ${
                  theme === 'dark' ? 'hover:bg-zinc-900' : 'hover:bg-zinc-100'
                }`}
              >
                <Bell className={`w-4 h-4 sm:w-5 sm:h-5 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                {unreadNotificationsCount > 0 && (
                  <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-600 rounded-full border-2 ${
                    theme === 'dark' ? 'border-black' : 'border-white'
                  }`} />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setShowNotifications(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={`absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border shadow-2xl z-50 overflow-hidden transition-colors duration-500 ${
                        theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <div className={`p-4 border-b flex items-center justify-between ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
                        <span className={`text-xs font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Notifications</span>
                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">{unreadNotificationsCount} New</span>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {dynamicNotifications.map((notif) => (
                          <div 
                            key={notif.id}
                            className={`p-4 border-b last:border-0 transition-colors ${
                              notif.isUnread
                                ? (theme === 'dark' ? 'border-zinc-800 bg-white/5 hover:bg-white/10' : 'border-zinc-100 bg-red-50/60 hover:bg-red-50')
                                : (theme === 'dark' ? 'border-zinc-800 hover:bg-white/5' : 'border-zinc-100 hover:bg-zinc-50')
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                                notif.type === 'error' ? 'bg-red-500' : notif.type === 'warning' ? 'bg-amber-500' : notif.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
                              }`} />
                              <div className="space-y-1">
                                <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                                  {notif.message}
                                </p>
                                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{notif.time}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setReadNotificationIds((prev) => Array.from(new Set([...prev, ...dynamicNotifications.map((notif) => notif.id)])))}
                        className={`w-full p-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                        theme === 'dark' ? 'bg-black/20 text-zinc-500 hover:text-white' : 'bg-zinc-50 text-zinc-400 hover:text-zinc-900'
                      }`}
                      >
                        Mark all as read
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full border flex items-center justify-center transition-all duration-500 ${
              theme === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'
            }`}>
              <User className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`} />
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 left-0 bottom-0 w-72 z-[70] shadow-2xl transition-colors duration-500 ${
                theme === 'dark' ? 'bg-zinc-900 border-r border-zinc-800' : 'bg-white border-r border-zinc-200'
              }`}
            >
              <div className="p-6 flex flex-col h-full">
                <div className="flex items-center justify-between mb-10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
                      <Activity className="w-5 h-5 text-white" />
                    </div>
                    <span className={`font-bold uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>Menu</span>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`p-2 rounded-full ${theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-zinc-100 text-zinc-400'}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  {(['overview', 'axes', 'gripper', 'analytics'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl transition-all uppercase tracking-widest text-xs font-bold ${
                        activeTab === tab 
                          ? (theme === 'dark' ? 'bg-red-600/10 text-red-500' : 'bg-red-700/10 text-red-700') 
                          : (theme === 'dark' ? 'text-zinc-500 hover:bg-zinc-800' : 'text-zinc-400 hover:bg-zinc-50')
                      }`}
                    >
                      {tab}
                      {activeTab === tab && <ChevronRight className="w-4 h-4" />}
                    </button>
                  ))}
                </div>

                <div className="mt-auto pt-6 border-t border-zinc-800/50 space-y-2">
                  {/* Back to Home (DNA) */}
                  <button
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      window.history.length > 1 ? window.history.back() : (window.location.href = '/');
                    }}
                    className={`w-full flex items-center gap-2 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-colors ${
                      theme === 'dark'
                        ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0" />
                    Back to Home (DNA)
                  </button>

                  {/* Go to Palletizer Monitor Page */}
                  <a
                    href={PALLETIZER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`w-full flex items-center gap-2 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                      theme === 'dark'
                        ? 'text-red-400 border-red-900/40 bg-red-900/10 hover:bg-red-900/20 hover:border-red-700/50'
                        : 'text-red-700 border-red-700/25 bg-red-700/[0.07] hover:bg-red-700/[0.13]'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    Go to Palletizer Monitor Page
                  </a>

                  <div className={`p-4 rounded-xl ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                    <p className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>System Status</p>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className={`text-xs font-mono ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>All Systems Nominal</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-16 relative z-10">
        {/* Header Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8 sm:mb-10 min-w-0">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-6 rounded-2xl border backdrop-blur-sm transition-all duration-500 ${
              theme === 'dark' ? 'bg-zinc-900/40 border-red-900/10' : 'bg-zinc-50 border-red-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold uppercase tracking-widest ${
                theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}>System Runtime</span>
              <Clock className={theme === 'dark' ? 'text-red-500' : 'text-red-700'} />
            </div>
            <div className={`text-2xl sm:text-3xl font-light font-mono transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>
              {data.robot_lifetime.runtime.toFixed(2)} <span className="text-sm text-zinc-500">hrs</span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`p-6 rounded-2xl border backdrop-blur-sm transition-all duration-500 ${
              theme === 'dark' ? 'bg-zinc-900/40 border-red-900/10' : 'bg-zinc-50 border-red-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold uppercase tracking-widest ${
                theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}>Active Axes</span>
              <Cpu className={theme === 'dark' ? 'text-red-500' : 'text-red-700'} />
            </div>
            <div className={`text-2xl sm:text-3xl font-light font-mono transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>
              {String(Object.keys(data.robot_axis).length).padStart(2, '0')} <span className="text-sm text-zinc-500">Online</span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`p-6 rounded-2xl border backdrop-blur-sm transition-all duration-500 ${
              theme === 'dark' ? 'bg-zinc-900/40 border-red-900/10' : 'bg-zinc-50 border-red-100 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-semibold uppercase tracking-widest ${
                theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'
              }`}>System Health</span>
              <Activity className="text-emerald-500" />
            </div>
            <div className={`text-2xl sm:text-3xl font-light font-mono transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>
              98.4 <span className="text-sm text-zinc-500">%</span>
            </div>
          </motion.div>
        </div>

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 lg:gap-8"
            >
              {/* Left Column: Status Robot & Controller */}
              <div className="md:col-span-1 md:order-2 lg:order-none lg:col-span-3 flex flex-col gap-6">
                <div className={`rounded-2xl border overflow-hidden transition-all duration-500 flex flex-col h-full ${
                  theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
                }`}>
                  <div className={`p-4 text-center font-bold uppercase tracking-widest text-white transition-colors duration-500 ${
                    theme === 'dark' ? 'bg-red-600' : 'bg-red-700'
                  }`}>
                    Status Robot
                  </div>
                  <div className="p-6 flex-grow flex flex-col items-center justify-center gap-6">
                    <div className="w-full aspect-square relative flex items-center justify-center p-4">
                      {/* Controller Image */}
                      <img 
                        src="/controller.png" 
                        alt="KUKA Controller" 
                        className="max-w-full max-h-full object-contain drop-shadow-2xl"
                        onError={(e) => {
                          e.currentTarget.src = `https://placehold.co/400x400/${theme === 'dark' ? '18181b' : 'f4f4f5'}/${theme === 'dark' ? 'ef4444' : 'b91c1c'}?text=Controller+Image`;
                        }}
                      />
                    </div>
                    <div className={`w-full p-4 rounded-xl text-center ${theme === 'dark' ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
                      <p className={`text-xs uppercase tracking-widest mb-1 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>System State</p>
                      <p className={`font-mono font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'}`}>RUNNING - AUTO</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Column: Axis Cards */}
              <div className="md:col-span-1 md:order-3 lg:order-none lg:col-span-4 flex flex-col gap-4">
                {(Object.entries(data.robot_axis) as [string, RobotAxisData][])
                  .reverse()
                  .map(([id, axis], idx) => (
                  <AxisCard 
                    key={id} 
                    id={id} 
                    data={axis} 
                    index={idx} 
                    theme={theme} 
                    compact 
                    isActive={activeAxis === id}
                    onHover={() => setActiveAxis(id)}
                    onLeave={() => setActiveAxis(null)}
                  />
                ))}
              </div>

              {/* Right Column: Robot Arm Image */}
              <div className="md:col-span-2 md:order-1 lg:order-none lg:col-span-5 flex items-center justify-center p-4 lg:p-8 relative min-h-[280px] sm:min-h-[360px] lg:min-h-[400px]">
                {/* Decorative background circle */}
                <div className={`absolute inset-0 m-auto w-3/4 aspect-square rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${
                  theme === 'dark' ? 'bg-red-600' : 'bg-red-400'
                }`} />

                <div className="relative z-10 w-full max-w-[580px]">
                  <img 
                    src="/robot.png" 
                    alt="KUKA Robot Arm" 
                    className="w-full max-h-[600px] object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.src = `https://placehold.co/600x800/${theme === 'dark' ? '18181b' : 'f4f4f5'}/${theme === 'dark' ? 'ef4444' : 'b91c1c'}?text=Robot+Arm+Image`;
                    }}
                  />

                  {(Object.entries(data.robot_axis) as [string, RobotAxisData][])
                    .filter(([id]) => ROBOT_AXIS_MARKERS[id])
                    .map(([id, axis]) => (
                      <ImageMarker
                        key={id}
                        label={id}
                        position={ROBOT_AXIS_MARKERS[id]}
                        theme={theme}
                        isActive={activeAxis === id}
                        value={`${axis.temp.toFixed(1)}C`}
                        onMouseEnter={() => setActiveAxis(id)}
                        onMouseLeave={() => setActiveAxis(null)}
                      />
                    ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'axes' && (
            <motion.div
              key="axes"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 items-start"
            >
              <div className="xl:col-span-5 flex items-center justify-center p-4 lg:p-8 relative min-h-[280px] sm:min-h-[380px] xl:sticky xl:top-24">
                <div className={`absolute inset-0 m-auto w-3/4 aspect-square rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${
                  theme === 'dark' ? 'bg-red-600' : 'bg-red-400'
                }`} />

                <div className="relative z-10 w-full max-w-[580px]">
                  <img
                    src="/robot.png"
                    alt="KUKA Robot Arm"
                    className="w-full max-h-[600px] object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.src = `https://placehold.co/600x800/${theme === 'dark' ? '18181b' : 'f4f4f5'}/${theme === 'dark' ? 'ef4444' : 'b91c1c'}?text=Robot+Arm+Image`;
                    }}
                  />

                  {(Object.entries(data.robot_axis) as [string, RobotAxisData][])
                    .filter(([id]) => ROBOT_AXIS_MARKERS[id])
                    .map(([id, axis]) => (
                      <ImageMarker
                        key={id}
                        label={id}
                        position={ROBOT_AXIS_MARKERS[id]}
                        theme={theme}
                        isActive={activeAxis === id}
                        value={`${axis.temp.toFixed(1)}C`}
                        onMouseEnter={() => setActiveAxis(id)}
                        onMouseLeave={() => setActiveAxis(null)}
                      />
                    ))}
                </div>
              </div>

              <div className="xl:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {(Object.entries(data.robot_axis) as [string, RobotAxisData][]).map(([id, axis], idx) => (
                  <AxisCard 
                    key={id} 
                    id={id} 
                    data={axis} 
                    index={idx} 
                    theme={theme}
                    isActive={activeAxis === id}
                    onHover={() => setActiveAxis(id)}
                    onLeave={() => setActiveAxis(null)}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Analytics data={data} history={analyticsHistory} theme={theme} />
            </motion.div>
          )}

          {activeTab === 'gripper' && (
            <motion.div
              key="gripper"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start lg:items-center"
            >
              {/* Left Column: Gripper Image */}
              <div className="flex items-center justify-center p-4 relative min-h-[280px] md:min-h-[380px] lg:min-h-[500px]">
                <div className={`absolute inset-0 m-auto w-2/3 aspect-square rounded-full blur-3xl opacity-20 transition-colors duration-1000 ${
                  theme === 'dark' ? 'bg-red-600' : 'bg-red-400'
                }`} />
                <div className="relative z-10 w-full max-w-[680px]">
                  <img 
                    src="/gripper.png" 
                    alt="Robot Gripper" 
                    className="w-full max-h-[500px] object-contain drop-shadow-2xl"
                    onError={(e) => {
                      e.currentTarget.src = `https://placehold.co/800x600/${theme === 'dark' ? '18181b' : 'f4f4f5'}/${theme === 'dark' ? 'ef4444' : 'b91c1c'}?text=Gripper+Image`;
                    }}
                  />

                  {(Object.entries(data.gripper) as [string, CylinderData][])
                    .filter(([id]) => GRIPPER_MARKERS[id])
                    .map(([id, cylinder]) => (
                      <ImageMarker
                        key={id}
                        label={id}
                        position={GRIPPER_MARKERS[id]}
                        theme={theme}
                        isActive={activeCylinder === id}
                        value={`${Math.round((cylinder.lifetime_act / cylinder.limit_lifetime) * 100)}%`}
                        onMouseEnter={() => setActiveCylinder(id)}
                        onMouseLeave={() => setActiveCylinder(null)}
                      />
                    ))}
                </div>
              </div>

              {/* Right Column: Gripper Lifetime List */}
              <div className={`rounded-2xl border overflow-hidden transition-all duration-500 ${
                theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
              }`}>
                <div className={`p-4 sm:p-6 text-center font-bold uppercase tracking-widest text-white transition-colors duration-500 ${
                  theme === 'dark' ? 'bg-red-600' : 'bg-red-700'
                }`}>
                  Gripper Lifetime
                </div>
                <div className="p-4 sm:p-6 space-y-2">
                  {(Object.entries(data.gripper) as [string, CylinderData][]).map(([id, cylinder], idx) => (
                    <div 
                      key={id}
                      onMouseEnter={() => setActiveCylinder(id)}
                      onMouseLeave={() => setActiveCylinder(null)}
                      className={`flex items-center justify-between p-4 rounded-xl transition-colors cursor-pointer ${
                        activeCylinder === id
                          ? (theme === 'dark' ? 'bg-red-900/20 border-red-900/50' : 'bg-red-50 border-red-200')
                          : (theme === 'dark' ? 'hover:bg-zinc-800/50 border-transparent' : 'hover:bg-zinc-50 border-transparent')
                      } border`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          theme === 'dark' ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-500'
                        }`}>
                          {idx + 1}
                        </div>
                        <span className={`font-medium ${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                          {id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="w-20 sm:w-32 h-2 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min((cylinder.lifetime_act / cylinder.limit_lifetime) * 100, 100)}%` }}
                            className={`h-full rounded-full ${
                              (cylinder.lifetime_act / cylinder.limit_lifetime) > 0.8 
                                ? 'bg-red-500' 
                                : 'bg-emerald-500'
                            }`}
                          />
                        </div>
                        <span className={`text-xs font-mono w-12 text-right ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {Math.round((cylinder.lifetime_act / cylinder.limit_lifetime) * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className={`border-t pb-14 transition-all duration-500 ${
        theme === 'dark' ? 'border-red-900/10 bg-black/40' : 'border-red-100 bg-zinc-50'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 py-8">
          <div className={`text-xs uppercase tracking-[0.2em] transition-colors duration-500 ${
            theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'
          }`}>
            © 2026 Redline Industrial Systems. All rights reserved.
          </div>
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-[10px] uppercase tracking-widest transition-colors duration-500">
            <button
              onClick={() => setActiveModal('privacy')}
              className={`transition-colors text-left ${theme === 'dark' ? 'text-zinc-500 hover:text-red-500' : 'text-zinc-400 hover:text-red-700'}`}
            >
              Privacy Policy
            </button>
            <button
              onClick={() => setActiveModal('logs')}
              className={`transition-colors text-left ${theme === 'dark' ? 'text-zinc-500 hover:text-red-500' : 'text-zinc-400 hover:text-red-700'}`}
            >
              System Logs
            </button>
            <button
              onClick={() => setActiveModal('support')}
              className={`transition-colors text-left ${theme === 'dark' ? 'text-zinc-500 hover:text-red-500' : 'text-zinc-400 hover:text-red-700'}`}
            >
              Support
            </button>
          </div>
        </div>
      </footer>

      {/* Sticky navigation bar — always visible at the bottom of the viewport */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-xl transition-all duration-500 ${
        theme === 'dark' ? 'border-red-900/20 bg-black/80' : 'border-red-100 bg-white/90'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-2 overflow-hidden">
          {/* Back to Home (DNA) */}
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : (window.location.href = '/')}
            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest py-1.5 px-2 sm:px-3 rounded-lg transition-colors shrink-0 min-h-[36px] ${
              theme === 'dark'
                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/60'
            }`}
          >
            <ChevronLeft className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden xs:inline">Back to Home (DNA)</span>
            <span className="xs:hidden">Home</span>
          </button>

          {/* Go to Palletizer Monitor Page */}
          <a
            href={PALLETIZER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest py-1.5 px-2 sm:px-3 rounded-lg border transition-colors shrink-0 min-h-[36px] ${
              theme === 'dark'
                ? 'text-red-400 border-red-900/40 bg-red-900/10 hover:bg-red-900/20 hover:border-red-700/50 hover:text-red-300'
                : 'text-red-700 border-red-700/25 bg-red-700/[0.07] hover:bg-red-700/[0.13] hover:border-red-700/40'
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Go to Palletizer Monitor</span>
            <span className="sm:hidden">Palletizer</span>
          </a>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <Modal 
            type={activeModal} 
            logs={logs}
            onClose={() => setActiveModal(null)} 
            theme={theme} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface ModalProps {
  logs: SystemLogEntry[];
  type: 'privacy' | 'logs' | 'support';
  onClose: () => void;
  theme: 'dark' | 'light';
}

interface ImageMarkerProps {
  isActive: boolean;
  key?: React.Key;
  label: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  position: MarkerPosition;
  theme: 'dark' | 'light';
  value: string;
}

function ImageMarker({
  isActive,
  label,
  onMouseEnter,
  onMouseLeave,
  position,
  theme,
  value,
}: ImageMarkerProps) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      <span className="relative flex items-center justify-center">
        <span
          className={`absolute h-10 w-10 rounded-full transition-all duration-300 ${
            isActive
              ? 'scale-100 bg-red-500/20'
              : 'scale-75 bg-red-500/0'
          }`}
        />
        <span
          className={`relative flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-300 ${
            isActive
              ? 'scale-125 border-red-300 bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.85)]'
              : theme === 'dark'
                ? 'border-red-500 bg-[#050505] shadow-[0_0_12px_rgba(239,68,68,0.45)]'
                : 'border-red-600 bg-white shadow-[0_0_10px_rgba(185,28,28,0.25)]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-red-500'}`} />
        </span>

        <span
          className={`absolute left-1/2 top-full mt-3 min-w-max -translate-x-1/2 rounded-xl border px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.22em] transition-all duration-300 ${
            isActive
              ? 'opacity-100 translate-y-0'
              : 'pointer-events-none opacity-0 -translate-y-1'
          } ${
            theme === 'dark'
              ? 'border-red-900/50 bg-black/85 text-zinc-100'
              : 'border-red-200 bg-white/95 text-zinc-900'
          }`}
        >
          <span className="block">{label}</span>
          <span className="mt-1 block tracking-[0.18em] text-red-500">{value}</span>
        </span>
      </span>
    </button>
  );
}

function Modal({ type, logs, onClose, theme }: ModalProps) {
  const content = {
    privacy: {
      title: 'Privacy Policy',
      icon: <Shield className="w-6 h-6 text-red-500" />,
      body: (
        <div className="space-y-4 text-sm leading-relaxed">
          <p>At Redline Industrial Systems, we prioritize the security and privacy of your industrial data. This policy outlines how we handle telemetry and diagnostic information.</p>
          <h4 className="font-bold uppercase tracking-tight">1. Data Collection</h4>
          <p>We collect real-time telemetry from robot axes and gripper cylinders solely for monitoring, predictive maintenance, and performance optimization.</p>
          <h4 className="font-bold uppercase tracking-tight">2. Data Security</h4>
          <p>All telemetry data is encrypted in transit and at rest. Access is restricted to authorized personnel only.</p>
          <h4 className="font-bold uppercase tracking-tight">3. Third-Party Disclosure</h4>
          <p>We do not sell or share your operational data with third parties without explicit consent, except as required for essential system updates.</p>
        </div>
      )
    },
    logs: {
      title: 'System Logs',
      icon: <FileText className="w-6 h-6 text-red-500" />,
      body: (
        <div className="space-y-2 font-mono text-[10px] bg-black/20 p-4 rounded-lg overflow-y-auto max-h-[300px]">
          <p className="text-zinc-500">[2026-03-25 01:50:12] INFO: System initialization complete.</p>
          <p className="text-zinc-500">[2026-03-25 01:51:05] INFO: Axis 0-6 telemetry stream active.</p>
          <p className="text-zinc-500">[2026-03-25 01:52:44] WARN: Axis 3 temperature spike detected (48.2°C).</p>
          <p className="text-zinc-500">[2026-03-25 01:53:10] INFO: Cooling system engaged for Axis 3.</p>
          <p className="text-zinc-500">[2026-03-25 01:55:22] INFO: Gripper Cylinder 2 cycle count reached 85,000.</p>
          <p className="text-emerald-500">[2026-03-25 01:57:01] SUCCESS: Weekly diagnostic report generated.</p>
          <p className="text-zinc-500">[2026-03-25 01:58:15] INFO: User switched to {theme} theme.</p>
          <p className="text-zinc-500 animate-pulse">_</p>
        </div>
      )
    },
    support: {
      title: 'System Support',
      icon: <HelpCircle className="w-6 h-6 text-red-500" />,
      body: (
        <div className="space-y-4 text-sm leading-relaxed">
          <p>Need assistance with your Redline Monitor? Our technical team is available 24/7 for critical system failures.</p>
          <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
            <p className="font-bold text-red-500 mb-1">Emergency Hotline</p>
            <p className="text-lg font-mono">+1 (800) RED-LINE</p>
          </div>
          <div className={`p-4 rounded-lg border ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}>
            <p className="font-bold text-red-500 mb-1">Technical Documentation</p>
            <a href="#" className="underline hover:text-red-500 transition-colors">docs.redline-industrial.com</a>
          </div>
          <p className="text-xs text-zinc-500 italic">Please have your System ID (RL-9921-X) ready when contacting support.</p>
        </div>
      )
    }
  };

  const active = content[type];

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className={`w-full max-w-lg mx-4 rounded-2xl border shadow-2xl overflow-hidden transition-colors duration-500 ${
          theme === 'dark' ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-800'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-6 border-b flex items-center justify-between ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
          <div className="flex items-center gap-3">
            {active.icon}
            <h3 className={`text-lg font-bold uppercase tracking-tight italic ${theme === 'dark' ? 'text-white' : 'text-zinc-900'}`}>
              {active.title}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-zinc-800 text-zinc-500' : 'hover:bg-zinc-100 text-zinc-400'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-8">
          {type === 'logs' ? (
            <div className={`space-y-2 font-mono text-[10px] p-4 rounded-lg overflow-y-auto max-h-[300px] ${
              theme === 'dark' ? 'bg-black/20' : 'bg-zinc-100'
            }`}>
              {logs.map((entry) => (
                <p
                  key={entry.id}
                  className={
                    entry.level === 'success'
                      ? 'text-emerald-500'
                      : entry.level === 'warn'
                        ? 'text-amber-500'
                        : 'text-zinc-500'
                  }
                >
                  [{entry.timestamp}] {entry.level.toUpperCase()}: {entry.message}
                </p>
              ))}
              <p className="text-zinc-500 animate-pulse">_</p>
            </div>
          ) : (
            active.body
          )}
        </div>
        <div className={`p-4 bg-black/5 flex justify-end ${theme === 'dark' ? 'border-t border-zinc-800' : 'border-t border-zinc-100'}`}>
          <button 
            onClick={onClose}
            className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-900'
            }`}
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface AxisCardProps {
  id: string;
  data: RobotAxisData;
  index: number;
  theme: 'dark' | 'light';
  compact?: boolean;
  isActive?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  key?: React.Key;
}

function AxisCard({ id, data, index, theme, compact = false, isActive = false, onHover, onLeave }: AxisCardProps) {
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05 }}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        className={`rounded-xl border overflow-hidden transition-all duration-500 cursor-pointer ${
          isActive
            ? (theme === 'dark' ? 'bg-zinc-800/80 border-red-500/50 ring-1 ring-red-500/50' : 'bg-red-50 border-red-500/50 ring-1 ring-red-500/50')
            : (theme === 'dark' ? 'bg-zinc-900/40 border-zinc-800 hover:border-red-600/50' : 'bg-white border-zinc-200 hover:border-red-700/50 shadow-sm')
        }`}
      >
        <div className={`px-4 py-2 text-sm font-bold uppercase tracking-widest text-white transition-colors duration-500 ${
          theme === 'dark' ? 'bg-red-600/80' : 'bg-red-700/90'
        }`}>
          {id}
        </div>
        <div className="p-3 grid grid-cols-3 gap-1 divide-x divide-zinc-500/20">
          <div className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Temp</div>
            <div className={`text-xs font-mono leading-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{data.temp.toFixed(1)}°C</div>
          </div>
          <div className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Torque</div>
            <div className={`text-xs font-mono leading-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{data.torque.toFixed(1)}%</div>
          </div>
          <div className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Current</div>
            <div className={`text-xs font-mono leading-tight ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{data.current.toFixed(2)}A</div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className={`group p-5 rounded-xl border transition-all duration-500 cursor-pointer ${
        isActive
          ? (theme === 'dark' ? 'bg-zinc-800/80 border-red-500/50 ring-1 ring-red-500/50' : 'bg-red-50 border-red-500/50 ring-1 ring-red-500/50')
          : (theme === 'dark' ? 'bg-zinc-900/30 border-zinc-800/50 hover:border-red-600/30' : 'bg-white border-zinc-200 hover:border-red-700/30 shadow-sm')
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            theme === 'dark' ? 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.6)]' : 'bg-red-700 shadow-[0_0_8px_rgba(185,28,28,0.4)]'
          }`} />
          <span className={`text-xs font-bold uppercase tracking-tighter transition-colors duration-500 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}>{id.replace('_', ' ')}</span>
        </div>
        <ChevronRight className={`w-3 h-3 transition-colors ${
          theme === 'dark' ? 'text-zinc-700 group-hover:text-red-500' : 'text-zinc-300 group-hover:text-red-700'
        }`} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <Thermometer className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-medium">Temp</span>
          </div>
          <span className={`text-sm font-mono transition-colors duration-500 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}>{data.temp.toFixed(1)}°C</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-medium">Torque</span>
          </div>
          <span className={`text-sm font-mono transition-colors duration-500 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}>{data.torque.toFixed(1)}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-zinc-500">
            <CircleDot className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-widest font-medium">Current</span>
          </div>
          <span className={`text-sm font-mono transition-colors duration-500 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}>{data.current.toFixed(2)}A</span>
        </div>
      </div>

      {/* Mini Progress Bar */}
      <div className={`mt-6 h-1 w-full rounded-full overflow-hidden transition-colors duration-500 ${
        theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
      }`}>
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${Math.min((data.temp / 80) * 100, 100)}%` }}
          className={`h-full rounded-full transition-all duration-1000 ${
            data.temp > 45 
              ? (theme === 'dark' ? 'bg-red-600' : 'bg-red-700') 
              : (theme === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300')
          }`}
        />
      </div>
    </motion.div>
  );
}

interface CylinderCardProps {
  id: string;
  data: CylinderData;
  index: number;
  theme: 'dark' | 'light';
  key?: React.Key;
}

function CylinderCard({ id, data, index, theme }: CylinderCardProps) {
  const lifetimePercent = Math.min((data.lifetime_act / data.limit_lifetime) * 100, 100);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={`p-5 rounded-xl border transition-all duration-500 ${
        theme === 'dark' 
          ? 'bg-zinc-900/30 border-zinc-800/50 hover:border-red-600/30' 
          : 'bg-white border-zinc-200 hover:border-red-700/30 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Box className={theme === 'dark' ? 'text-red-500' : 'text-red-700'} />
          <span className={`text-xs font-bold uppercase tracking-tighter transition-colors duration-500 ${
            theme === 'dark' ? 'text-white' : 'text-zinc-900'
          }`}>{id.replace('_', ' ')}</span>
        </div>
        <div className="flex gap-1.5">
          <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest transition-all duration-500 ${
            data.reed_open 
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
              : (theme === 'dark' ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
          }`}>Open</div>
          <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest transition-all duration-500 ${
            data.reed_close 
              ? (theme === 'dark' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-red-700/10 text-red-700 border border-red-700/20')
              : (theme === 'dark' ? 'bg-zinc-800 text-zinc-600' : 'bg-zinc-100 text-zinc-400')
          }`}>Close</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-widest font-medium text-zinc-500 mb-2">
            <span>Lifetime Usage</span>
            <span className={theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}>{lifetimePercent.toFixed(1)}%</span>
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden transition-colors duration-500 ${
            theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'
          }`}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${lifetimePercent}%` }}
              className={`h-full rounded-full transition-all duration-1000 ${
                lifetimePercent > 80 
                  ? (theme === 'dark' ? 'bg-red-600' : 'bg-red-700') 
                  : (theme === 'dark' ? 'bg-red-900/60' : 'bg-red-200')
              }`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Actual</div>
            <div className={`text-xs font-mono transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>{data.lifetime_act.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest mb-1">Limit</div>
            <div className={`text-xs font-mono transition-colors duration-500 ${
              theme === 'dark' ? 'text-white' : 'text-zinc-900'
            }`}>{data.limit_lifetime.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
