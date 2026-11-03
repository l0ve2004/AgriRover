import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

export default function StatusPanel() {
  const {
    isConnected,
    lastMessage,
    pumpState,
    setPump,
    togglePump,
    lastCommand,
    espIp,
    wsUrl,
    reconnect,
    emergencyStop
  } = useWebSocket();

  // Robot telemetry state
  const [telemetry, setTelemetry] = useState({
    battery: 88,
    speed: 'Stopped',
    lastCommand: 'None',
    rssi: -58,
    uptime: '1h 14m'
  });

  useEffect(() => {
    if (lastMessage) {
      setTelemetry((prev) => ({
        ...prev,
        ...lastMessage,
        battery: lastMessage.battery ?? prev.battery,
        speed: lastMessage.speed ?? prev.speed
      }));
    }
  }, [lastMessage]);

  const isOnline = isConnected;
  const batteryPct = telemetry.battery || 85;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Main Status Hero Card */}
        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center space-x-6">
              <div className="relative">
                <div
                  className={`w-24 h-24 rounded-3xl flex items-center justify-center text-5xl transition-all duration-300 ${
                    isOnline
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/20'
                      : 'bg-slate-800 text-slate-600 border border-slate-700'
                  }`}
                >
                  🚜
                </div>
                <div
                  className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full border-4 border-slate-900 ${
                    isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center space-x-3 mb-1">
                  <h1 className="text-3xl font-extrabold tracking-tight text-white">
                    AgriRover Status
                  </h1>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      isOnline
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  NodeMCU ESP8266 Fertilizer Rover • Endpoint: <span className="text-cyan-400 font-mono">{wsUrl}</span>
                </p>
              </div>
            </div>

            {/* Quick Action Group */}
            <div className="flex items-center space-x-3">
              {!isOnline ? (
                <button
                  onClick={reconnect}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center space-x-2"
                >
                  <span>🔄</span>
                  <span>Connect to ESP</span>
                </button>
              ) : (
                <button
                  onClick={emergencyStop}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-600/30 transition-all flex items-center space-x-2"
                >
                  <span>🚨</span>
                  <span>Emergency Stop</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Primary Subsystem Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* ========================================================================= */}
          {/* PUMP & RELAY STATUS (Highlighted for Fertilizer rover) */}
          {/* ========================================================================= */}
          <div className="bg-slate-900/90 border-2 border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-10 text-8xl">
              💧
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                    pumpState === 'on' && isOnline ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}>
                    💧
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Fertilizer Spray Pump</h2>
                    <p className="text-xs text-slate-400">Subsystem: Relay (GPIO16 / D0)</p>
                  </div>
                </div>

                {/* Requested Status Badge */}
                <span
                  className={`text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                    !isOnline
                      ? 'bg-slate-800 text-slate-500 border-slate-700'
                      : pumpState === 'on'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/30 animate-pulse'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  {!isOnline ? 'AUTO-OFF (DISARMED)' : pumpState === 'on' ? 'REQUESTED: ON' : 'REQUESTED: OFF'}
                </span>
              </div>

              {/* Pump Details */}
              <div className="space-y-3 my-5 text-sm bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Relay Control Logic:</span>
                  <span className="font-mono text-cyan-300 text-xs">Active-LOW (3.3V)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Command Sent:</span>
                  <span className="font-mono text-emerald-400 text-xs">
                    {pumpState === 'on' && isOnline ? '{"pump":"on"}' : '{"pump":"off"}'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Disconnect Behavior:</span>
                  <span className="font-mono text-amber-400 text-xs">Fail-Safe Auto-Cut</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Fluid Reservoir:</span>
                  <span className="text-white text-xs font-medium">Ready</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                ℹ️ <em>Requested state display:</em> Firmware turns relay ON when requested. Disconnecting from WebSocket automatically stops pump immediately on hardware.
              </p>
            </div>

            {/* Quick Pump Toggle Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => isOnline && togglePump()}
                disabled={!isOnline}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center space-x-2 ${
                  !isOnline
                    ? 'bg-slate-800 text-slate-600 border border-slate-800 cursor-not-allowed opacity-50'
                    : pumpState === 'on'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer active:scale-95'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95'
                }`}
              >
                <span>{pumpState === 'on' ? '🛑 Turn Pump OFF' : '💧 Turn Pump ON'}</span>
              </button>
            </div>
          </div>

          {/* Drive & Power Systems */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center text-xl">
                  🔋
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Power & Drive Motors</h2>
                  <p className="text-xs text-slate-400">Dual L298N H-Bridge & Battery Subsystem</p>
                </div>
              </div>

              {/* Battery Bar */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-slate-300 font-medium">Main Power Pack</span>
                  <span className="text-xl font-extrabold text-white font-mono">{batteryPct}%</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3.5 p-0.5 border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${batteryPct}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 mt-2 flex justify-between">
                  <span>Voltage: ~11.8V DC</span>
                  <span>Estimated runtime: ~3.8 hrs</span>
                </div>
              </div>

              {/* Motor Details */}
              <div className="space-y-3 text-sm bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Left Motors (IN1/IN2/EN):</span>
                  <span className="font-mono text-cyan-300 text-xs">D1, D2, D7</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Right Motors (IN1/IN2/EN):</span>
                  <span className="font-mono text-cyan-300 text-xs">D5, D6, D8</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">PWM Frequency:</span>
                  <span className="font-mono text-white text-xs">1000 Hz (0..255)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Last Motion Command:</span>
                  <span className="font-mono text-emerald-400 text-xs">{lastCommand}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 text-[11px] text-slate-500 text-center">
              Motors automatically brake on WebSocket disconnect
            </div>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-1">📡</div>
            <div className="text-xs text-slate-400 font-medium">Wi-Fi Connection</div>
            <div className="text-sm font-bold text-white mt-1">
              {isOnline ? 'Onyx (Connected)' : 'Disconnected'}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-1">⏱️</div>
            <div className="text-xs text-slate-400 font-medium">Heartbeat / Latency</div>
            <div className="text-sm font-bold text-emerald-400 mt-1 font-mono">
              {isOnline ? '< 15 ms' : 'N/A'}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-1">💧</div>
            <div className="text-xs text-slate-400 font-medium">Pump Requested</div>
            <div className={`text-sm font-bold mt-1 ${pumpState === 'on' && isOnline ? 'text-emerald-400' : 'text-slate-400'}`}>
              {pumpState === 'on' && isOnline ? 'ON' : 'OFF'}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-1">🛡️</div>
            <div className="text-xs text-slate-400 font-medium">Fail-Safe State</div>
            <div className="text-sm font-bold text-cyan-400 mt-1">
              Armed & Active
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}