import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingIp, setIsEditingIp] = useState(false);
  const { isConnected, connectionStatus, pumpState, togglePump, espIp, setEspIp, reconnect, wsUrl } = useWebSocket();
  const [tempIp, setTempIp] = useState(espIp);
  const location = useLocation();

  const navigationItems = [
    { name: 'System Status', href: '/', icon: '📊' },
    { name: 'Live Control', href: '/live-control', icon: '🎮' },
    { name: 'Mission Map', href: '/upload-map', icon: '🗺️' },
    { name: 'Path Visualizer', href: '/path-visualizer', icon: '📐' }
  ];

  const handleIpSave = (e) => {
    e.preventDefault();
    if (tempIp && tempIp.trim()) {
      const nextIp = tempIp.trim();
      const isSameIp = nextIp.replace(/^ws:\/\//i, '').replace(/\/ws\/?$/i, '').replace(/\/$/, '') === espIp;
      setEspIp(nextIp);
      setIsEditingIp(false);
      if (isSameIp) reconnect();
    }
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo and Rover Branding */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              🌱
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-extrabold tracking-wide bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  AgriRover
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ESP8266
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Fertilizer Rover & Spray Controller</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-2">
            {navigationItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                    isActive
                      ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-inner'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Quick Status Badges & IP Config */}
          <div className="hidden sm:flex items-center space-x-3">
            {/* Quick Pump State Badge & Toggle */}
            <button
              onClick={() => isConnected && togglePump()}
              disabled={!isConnected}
              title={
                !isConnected
                  ? 'WebSocket disconnected - pump controls locked'
                  : pumpState === 'on'
                  ? 'Click to turn pump OFF'
                  : 'Click to turn pump ON'
              }
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 transition-all ${
                !isConnected
                  ? 'bg-slate-800/60 text-slate-500 border-slate-700/60 cursor-not-allowed opacity-60'
                  : pumpState === 'on'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${pumpState === 'on' && isConnected ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`}></span>
              <span>💧 Pump: {pumpState === 'on' && isConnected ? 'ON (Req)' : 'OFF'}</span>
            </button>

            {/* IP Address Pill / Config */}
            <div className="relative">
              <button
                onClick={() => {
                  setTempIp(espIp);
                  setIsEditingIp(!isEditingIp);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-mono flex items-center space-x-1.5 transition-colors"
                title="Click to change ESP8266 IP address"
              >
                <span className="text-slate-400">IP:</span>
                <span className="text-cyan-400 font-bold">{espIp}</span>
                <span className="text-slate-400 text-[10px]">⚙️</span>
              </button>

              {/* IP Configuration Dropdown Modal */}
              {isEditingIp && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
                  <h4 className="text-sm font-bold text-white mb-1 flex items-center space-x-2">
                    <span>📡 Target ESP8266 IP</span>
                  </h4>
                  <p className="text-xs text-slate-400 mb-3">
                    Enter the IP address from the Arduino Serial Monitor (e.g. 192.168.1.105):
                  </p>
                  <form onSubmit={handleIpSave} className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        value={tempIp}
                        onChange={(e) => setTempIp(e.target.value)}
                        placeholder="192.168.1.105"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                        autoFocus
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      Endpoint: {wsUrl}
                    </div>
                    <div className="flex justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditingIp(false)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30"
                      >
                        Save & Connect
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Connection Status Pill with Reconnect */}
            <div className="flex items-center space-x-1.5">
              <div
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 ${
                  isConnected
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                    : connectionStatus === 'connecting'
                    ? 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                    : 'bg-rose-950/60 text-rose-400 border-rose-500/30'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400 animate-pulse'
                      : connectionStatus === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-500'
                  }`}
                ></div>
                <span className="capitalize">
                  {isConnected ? 'Online' : connectionStatus === 'connecting' ? 'Connecting...' : 'Offline'}
                </span>
              </div>

              {!isConnected && (
                <button
                  onClick={reconnect}
                  title="Reconnect to ESP8266"
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition-colors"
                >
                  🔄
                </button>
              )}
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              }`}
            ></div>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-slate-300 hover:text-white p-2 rounded-lg bg-slate-800 focus:outline-none"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-slate-800 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {navigationItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium flex items-center space-x-2 ${
                      isActive
                        ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {/* Mobile Controls & IP editor */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Target IP:</span>
                <span className="text-xs font-mono text-cyan-400">{espIp}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Connection:</span>
                <span className={`text-xs font-semibold ${isConnected ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Requested Pump State:</span>
                <span className={`text-xs font-bold ${pumpState === 'on' ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {pumpState === 'on' ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;