import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { translateMotorCommand } from '../utils/hardwareMap';

export default function LiveControl() {
  const [activeCommand, setActiveCommand] = useState('');
  const [speed, setSpeed] = useState(78); // default ~200/255 (78%)
  const activeCommandRef = useRef('');
  const activePointerIdRef = useRef(null);
  const activeTargetRef = useRef(null);

  const {
    isConnected,
    pumpState,
    setPump,
    togglePump,
    emergencyStop,
    sendMessage,
    setLastCommand,
    wsUrl
  } = useWebSocket();

  // Instant and fail-safe stop movement command
  const stopMovement = useCallback((force = false) => {
    const wasMoving = Boolean(activeCommandRef.current);
    const prevCommand = activeCommandRef.current;

    activeCommandRef.current = '';
    activePointerIdRef.current = null;
    activeTargetRef.current = null;
    setActiveCommand('');

    if (wasMoving || force) {
      console.log(`[LiveControl] STOP sent (previous: ${prevCommand || 'none'}, forced: ${force})`);
      sendMessage({ command: 'stop' });
      if (setLastCommand) setLastCommand('STOPPED');

      // Fast redundant safety stop after 60ms to guarantee motors halt even if packet jitter occurs
      setTimeout(() => {
        if (!activeCommandRef.current) {
          sendMessage({ command: 'stop' });
        }
      }, 60);
    }
  }, [sendMessage, setLastCommand]);

  // Start movement command with hardware motor mapping
  const startMovement = useCallback((command) => {
    if (!isConnected) return;
    if (activeCommandRef.current === command) return;

    // If already moving in a different direction, send stop first
    if (activeCommandRef.current) {
      sendMessage({ command: 'stop' });
    }

    activeCommandRef.current = command;
    setActiveCommand(command);
    if (setLastCommand) setLastCommand(command.toUpperCase());

    const wireCommand = translateMotorCommand(command);
    console.log(`[LiveControl] START ${command.toUpperCase()} -> sending wire command: {"command":"${wireCommand}"}`);
    sendMessage({ command: wireCommand });
  }, [isConnected, sendMessage, setLastCommand]);

  // Pointer Down on a direction button
  const handlePointerDown = (event, command) => {
    // Only primary mouse button (left click) or touch/stylus
    if (event.button !== undefined && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    activePointerIdRef.current = event.pointerId;
    activeTargetRef.current = event.currentTarget;

    // Safely capture pointer so small thumb wiggles keep moving
    try {
      if (event.currentTarget && event.currentTarget.setPointerCapture) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
    } catch (e) {
      // Ignored: window listeners provide guaranteed safety net
    }

    startMovement(command);
  };

  // Pointer Up / thumb lifted from direction button
  const handlePointerUp = (event, command) => {
    event.preventDefault();

    if (event.currentTarget && event.pointerId !== undefined) {
      try {
        if (event.currentTarget.hasPointerCapture && event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch (e) {
        // ignore
      }
    }

    // Stop if this command was active or this pointer was active
    if (!command || activeCommandRef.current === command || activePointerIdRef.current === event.pointerId) {
      stopMovement();
    }
  };

  // Pointer Cancel (gesture takeover, palm rejection, etc.)
  const handlePointerCancel = (event) => {
    event.preventDefault();
    stopMovement();
  };

  // Center STOP Button
  const handleCenterStop = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    stopMovement(true);
  };

  // Emergency safe-stop
  const handleEmergencyStop = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    activeCommandRef.current = '';
    activePointerIdRef.current = null;
    activeTargetRef.current = null;
    setActiveCommand('');
    emergencyStop();
  };

  // Global window listeners: Guaranteed stop when thumb/mouse is released anywhere, window blurs, or tab changes
  useEffect(() => {
    const handleGlobalPointerUp = (event) => {
      if (activeCommandRef.current) {
        if (activePointerIdRef.current === null || activePointerIdRef.current === event.pointerId || event.pointerType === 'mouse') {
          stopMovement();
        }
      }
    };

    const handleGlobalPointerCancel = () => {
      if (activeCommandRef.current) {
        stopMovement();
      }
    };

    const handleGlobalTouchEnd = (event) => {
      // If no touch contacts remain on screen, stop immediately
      if (event.touches && event.touches.length === 0 && activeCommandRef.current) {
        stopMovement();
      }
    };

    const handleGlobalTouchCancel = () => {
      if (activeCommandRef.current) {
        stopMovement();
      }
    };

    const handleGlobalMouseUp = (event) => {
      if (event.button === 0 && activeCommandRef.current) {
        stopMovement();
      }
    };

    const handleBlur = () => {
      stopMovement();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopMovement();
      }
    };

    // Kill contextmenu (long-press menu) on hold
    const handleContextMenu = (e) => {
      if (activeCommandRef.current) {
        e.preventDefault();
        stopMovement();
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerUp, { passive: true });
    window.addEventListener('pointercancel', handleGlobalPointerCancel, { passive: true });
    window.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleGlobalTouchCancel, { passive: true });
    window.addEventListener('mouseup', handleGlobalMouseUp, { passive: true });
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerCancel);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
      window.removeEventListener('touchcancel', handleGlobalTouchCancel);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('contextmenu', handleContextMenu);
      stopMovement();
    };
  }, [stopMovement]);

  // Global Keyboard Control (WASD + Arrow Keys + Space/Esc to Stop)
  useEffect(() => {
    const keyMap = {
      ArrowUp: 'forward',
      KeyW: 'forward',
      w: 'forward',
      W: 'forward',

      ArrowDown: 'backward',
      KeyS: 'backward',
      s: 'backward',
      S: 'backward',

      ArrowLeft: 'left',
      KeyA: 'left',
      a: 'left',
      A: 'left',

      ArrowRight: 'right',
      KeyD: 'right',
      d: 'right',
      D: 'right'
    };

    const handleKeyDown = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || event.target?.isContentEditable) {
        return;
      }

      if (event.key === ' ' || event.code === 'Space' || event.key === 'Escape') {
        event.preventDefault();
        stopMovement(true);
        return;
      }

      const command = keyMap[event.code] || keyMap[event.key];
      if (command) {
        event.preventDefault();
        if (!event.repeat) {
          startMovement(command);
        }
      }
    };

    const handleKeyUp = (event) => {
      const targetTag = event.target?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || event.target?.isContentEditable) {
        return;
      }

      const command = keyMap[event.code] || keyMap[event.key];
      if (command && activeCommandRef.current === command) {
        event.preventDefault();
        stopMovement();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startMovement, stopMovement]);

  const handleSpeedChange = (e) => {
    const newSpeed = Number(e.target.value);
    setSpeed(newSpeed);
    if (isConnected) {
      // Map 0-100% to 0-255 PWM
      const pwmValue = Math.round((newSpeed / 100) * 255);
      sendMessage({ speed: pwmValue });
    }
  };

  // Touch and selection suppression styles for controls
  const touchStyles = {
    touchAction: 'none',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent'
  };

  const directionButtonClass = (command) => `
    relative overflow-hidden font-bold transition-all duration-100 select-none
    ${activeCommand === command
      ? 'scale-95 bg-emerald-600 border-emerald-400 text-white shadow-xl shadow-emerald-500/40 ring-4 ring-emerald-500/50'
      : 'bg-slate-800 hover:bg-slate-700/90 border-slate-700 text-slate-100 hover:border-emerald-500/50 hover:shadow-md'
    }
    ${!isConnected ? 'opacity-40 cursor-not-allowed hover:scale-100 hover:bg-slate-800' : 'cursor-pointer active:scale-95'}
    border-2 rounded-2xl flex flex-col items-center justify-center touch-none select-none
  `;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Top Header Card */}
        <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-3xl">🚜</span>
                <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                  Live Rover & Spray Control
                </h1>
              </div>
              <p className="text-sm text-slate-400">
                Direct teleoperation for dual H-bridge motors and fail-safe fertilizer pump relay
              </p>
            </div>

            {/* Connection and Endpoint Badge */}
            <div className="flex items-center space-x-3">
              <div className="text-right hidden md:block">
                <div className="text-xs text-slate-400 font-mono">{wsUrl}</div>
                <div className="text-xs text-slate-500">ESP8266 NodeMCU</div>
              </div>
              <div
                className={`px-4 py-2 rounded-2xl border text-sm font-semibold flex items-center space-x-2.5 ${
                  isConnected
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                    : 'bg-rose-950/60 text-rose-400 border-rose-500/40'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                  }`}
                ></div>
                <span>{isConnected ? 'Online & Linked' : 'Disconnected'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PUMP CONTROL SECTION */}
        {/* ========================================================================= */}
        <section aria-labelledby="pump-control-heading" className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-850 rounded-3xl p-6 sm:p-8 shadow-2xl border-2 border-emerald-500/30 relative overflow-hidden">
          
          {/* Subtle decorative glow */}
          <div className={`absolute -right-16 -top-16 w-56 h-56 rounded-full blur-3xl pointer-events-none transition-opacity duration-500 ${
            pumpState === 'on' && isConnected ? 'bg-emerald-500/20 opacity-100' : 'bg-emerald-500/5 opacity-40'
          }`} />

          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
            <div className="flex items-center space-x-3.5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 shadow-lg ${
                pumpState === 'on' && isConnected
                  ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/40 animate-pulse scale-105'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                💧
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h2 id="pump-control-heading" className="text-2xl font-bold text-white tracking-wide">
                    Fertilizer Spray Pump Control
                  </h2>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    Relay: D0 (GPIO16)
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Operate fertilizer pump through 3.3V relay logic (Independent of wheel movement)
                </p>
              </div>
            </div>

            {/* Live Requested State Pill */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Requested State:
              </span>
              <div
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono tracking-wider transition-all duration-300 flex items-center space-x-2 border ${
                  !isConnected
                    ? 'bg-slate-800/80 text-slate-500 border-slate-700/80'
                    : pumpState === 'on'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    !isConnected
                      ? 'bg-slate-600'
                      : pumpState === 'on'
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-slate-500'
                  }`}
                />
                <span>
                  {!isConnected
                    ? 'DISCONNECTED (FAIL-SAFE OFF)'
                    : pumpState === 'on'
                    ? 'REQUESTED: ON'
                    : 'REQUESTED: OFF'}
                </span>
              </div>
            </div>
          </div>

          {/* Pump Control Grid */}
          <div className="grid lg:grid-cols-12 gap-8 items-center">
            
            {/* Visualizer & Feedback Column */}
            <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center">
              <div className="relative mb-4">
                <div
                  className={`w-28 h-28 rounded-full flex items-center justify-center text-5xl transition-all duration-500 ${
                    pumpState === 'on' && isConnected
                      ? 'bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/30 scale-105 shadow-2xl shadow-emerald-500/30'
                      : 'bg-slate-800/60 text-slate-600 ring-2 ring-slate-700'
                  }`}
                >
                  {pumpState === 'on' && isConnected ? '💦' : '💧'}
                </div>
                {pumpState === 'on' && isConnected && (
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                  </span>
                )}
              </div>

              <div className="text-base font-bold text-white mb-1">
                {pumpState === 'on' && isConnected ? (
                  <span className="text-emerald-400">Spray Pump Energized</span>
                ) : (
                  <span className="text-slate-400">Spray Pump Standby (OFF)</span>
                )}
              </div>
              <p className="text-xs text-slate-400 max-w-xs">
                Protocol: <code className="text-cyan-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded">
                  {pumpState === 'on' && isConnected ? '{"pump":"on"}' : '{"pump":"off"}'}
                </code>
              </p>

              {/* Safe State Clarification Callout */}
              <div className="mt-4 p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-[11px] text-slate-400 text-left leading-relaxed">
                <strong className="text-slate-300">ℹ️ Safety & Feedback Notice:</strong> Displays the requested command state over WebSocket. Physical fertilizer spraying requires relay contact, pump DC power, and fluid in the tank. ESP8266 auto-resets pump to OFF upon disconnection.
              </div>
            </div>

            {/* Interactive Buttons & Master Switch Column */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              
              {/* Dual Action Buttons */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Turn Pump ON Button */}
                <button
                  type="button"
                  onClick={() => setPump('on')}
                  disabled={!isConnected}
                  className={`py-5 px-6 rounded-2xl font-extrabold text-base transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg ${
                    !isConnected
                      ? 'bg-slate-800/60 border border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      : pumpState === 'on'
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-emerald-600/40 scale-[1.02]'
                      : 'bg-slate-800 hover:bg-emerald-600/90 hover:text-white border-2 border-emerald-500/50 text-emerald-400 hover:shadow-emerald-600/30 active:scale-95 cursor-pointer'
                  }`}
                >
                  <span className="text-2xl">💧</span>
                  <div className="text-left">
                    <div>PUMP ON</div>
                    <div className="text-[11px] font-normal opacity-80 font-mono">send &#123;"pump":"on"&#125;</div>
                  </div>
                </button>

                {/* Turn Pump OFF Button */}
                <button
                  type="button"
                  onClick={() => setPump('off')}
                  disabled={!isConnected}
                  className={`py-5 px-6 rounded-2xl font-extrabold text-base transition-all duration-200 flex items-center justify-center space-x-3 shadow-lg ${
                    !isConnected
                      ? 'bg-slate-800/60 border border-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                      : pumpState === 'off'
                      ? 'bg-rose-950/70 text-rose-300 border-2 border-rose-500/50 shadow-rose-900/20'
                      : 'bg-slate-800 hover:bg-rose-600 hover:text-white border-2 border-slate-700 text-slate-300 hover:shadow-rose-600/30 active:scale-95 cursor-pointer'
                  }`}
                >
                  <span className="text-2xl">🛑</span>
                  <div className="text-left">
                    <div>PUMP OFF</div>
                    <div className="text-[11px] font-normal opacity-80 font-mono">send &#123;"pump":"off"&#125;</div>
                  </div>
                </button>
              </div>

              {/* Master Tactile Toggle Bar */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-slate-200">Master Spray Toggle</div>
                  <div className="text-xs text-slate-400">Click switch to toggle between ON and OFF</div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className={`text-xs font-bold ${pumpState === 'off' || !isConnected ? 'text-slate-300' : 'text-slate-500'}`}>
                    OFF
                  </span>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pumpState === 'on' && isConnected}
                    onClick={() => isConnected && togglePump()}
                    disabled={!isConnected}
                    className={`relative inline-flex h-9 w-18 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                      !isConnected
                        ? 'bg-slate-800 border-slate-700 opacity-40 cursor-not-allowed'
                        : pumpState === 'on'
                        ? 'bg-emerald-500 border-emerald-400 shadow-lg shadow-emerald-500/30'
                        : 'bg-slate-800 border-slate-750 hover:bg-slate-700'
                    }`}
                  >
                    <span className="sr-only">Toggle pump</span>
                    <span
                      className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-300 ease-in-out flex items-center justify-center text-xs ${
                        pumpState === 'on' && isConnected ? 'translate-x-9 text-emerald-700 font-extrabold' : 'translate-x-0.5 text-slate-600'
                      }`}
                    >
                      {pumpState === 'on' && isConnected ? '✓' : '✕'}
                    </span>
                  </button>

                  <span className={`text-xs font-bold ${pumpState === 'on' && isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                    ON
                  </span>
                </div>
              </div>

              {/* Connection Warning if offline */}
              {!isConnected && (
                <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 flex items-center space-x-2">
                  <span>⚠️</span>
                  <span>
                    WebSocket connection unavailable. Pump controls are locked in fail-safe OFF mode until link is restored.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* VEHICLE DRIVE CONTROL PANEL */}
        {/* ========================================================================= */}
        <section
          aria-labelledby="drive-control-heading"
          style={touchStyles}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl touch-none select-none"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
            <div>
              <h2 id="drive-control-heading" className="text-2xl font-bold text-white flex items-center space-x-3">
                <span>🎮 Manual Vehicle Drive</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Hold button to drive; release or remove thumb to stop instantly ({'{"command":"forward|backward|left|right|stop"}'})
              </p>
            </div>

            {/* Rover Status Indicator */}
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 uppercase font-semibold">Motion:</span>
              <span className={`px-3 py-1 rounded-xl text-xs font-mono font-bold transition-colors ${
                activeCommand ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {activeCommand ? activeCommand.toUpperCase() : 'STOPPED'}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center">
            {/* Rover Visual & Status */}
            <div className="mb-6 text-center select-none">
              <div
                className={`text-6xl transition-all duration-150 inline-block select-none ${
                  activeCommand ? 'animate-bounce scale-110' : ''
                }`}
              >
                🚜
              </div>
              <p className="text-sm text-slate-400 mt-2 font-medium">
                {activeCommand ? (
                  <span className="text-emerald-400 font-bold">Driving {activeCommand.toUpperCase()} (held)</span>
                ) : (
                  <span>Hold a direction to drive; remove thumb to stop immediately</span>
                )}
              </p>
            </div>

            {/* D-Pad Layout with strict touch & context prevention */}
            <div
              className="w-full max-w-sm select-none touch-none"
              style={touchStyles}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
            >
              {/* Forward Button */}
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  style={touchStyles}
                  onPointerDown={(event) => handlePointerDown(event, 'forward')}
                  onPointerUp={(event) => handlePointerUp(event, 'forward')}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  aria-pressed={activeCommand === 'forward'}
                  className={`${directionButtonClass('forward')} w-28 h-20 rounded-t-3xl`}
                  disabled={!isConnected}
                  title="Forward (Hold W or ↑)"
                >
                  <span className="text-2xl mb-1 pointer-events-none">⬆️</span>
                  <span className="text-xs tracking-wider pointer-events-none">FORWARD</span>
                </button>
              </div>

              {/* Left, Stop, Right Row */}
              <div className="flex justify-center items-center space-x-3 mb-3">
                {/* Left */}
                <button
                  type="button"
                  style={touchStyles}
                  onPointerDown={(event) => handlePointerDown(event, 'left')}
                  onPointerUp={(event) => handlePointerUp(event, 'left')}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  aria-pressed={activeCommand === 'left'}
                  className={`${directionButtonClass('left')} w-28 h-20 rounded-l-3xl`}
                  disabled={!isConnected}
                  title="Pivot Left (Hold A or ←)"
                >
                  <span className="text-2xl mb-1 pointer-events-none">⬅️</span>
                  <span className="text-xs tracking-wider pointer-events-none">LEFT</span>
                </button>

                {/* Center Stop */}
                <button
                  type="button"
                  style={touchStyles}
                  onPointerDown={handleCenterStop}
                  onClick={handleCenterStop}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  className="w-24 h-24 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-xs border-4 border-rose-400 shadow-xl shadow-rose-600/30 transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none touch-none"
                  disabled={!isConnected}
                  title="Stop Motors Immediately (Space or Esc)"
                >
                  <span className="text-2xl mb-0.5 pointer-events-none">🛑</span>
                  <span className="pointer-events-none">STOP</span>
                </button>

                {/* Right */}
                <button
                  type="button"
                  style={touchStyles}
                  onPointerDown={(event) => handlePointerDown(event, 'right')}
                  onPointerUp={(event) => handlePointerUp(event, 'right')}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  aria-pressed={activeCommand === 'right'}
                  className={`${directionButtonClass('right')} w-28 h-20 rounded-r-3xl`}
                  disabled={!isConnected}
                  title="Pivot Right (Hold D or →)"
                >
                  <span className="text-2xl mb-1 pointer-events-none">➡️</span>
                  <span className="text-xs tracking-wider pointer-events-none">RIGHT</span>
                </button>
              </div>

              {/* Backward Button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  style={touchStyles}
                  onPointerDown={(event) => handlePointerDown(event, 'backward')}
                  onPointerUp={(event) => handlePointerUp(event, 'backward')}
                  onPointerCancel={handlePointerCancel}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  aria-pressed={activeCommand === 'backward'}
                  className={`${directionButtonClass('backward')} w-28 h-20 rounded-b-3xl`}
                  disabled={!isConnected}
                  title="Backward (Hold S or ↓)"
                >
                  <span className="text-2xl mb-1 pointer-events-none">⬇️</span>
                  <span className="text-xs tracking-wider pointer-events-none">REVERSE</span>
                </button>
              </div>

              {/* Keyboard Control Legend */}
              <div className="mt-5 flex items-center justify-center space-x-3 text-[11px] text-slate-400 font-mono">
                <span>⌨️ Keyboard: <strong className="text-slate-300">W / A / S / D</strong> or <strong className="text-slate-300">Arrows</strong></span>
                <span>•</span>
                <span><strong className="text-rose-400">Space</strong> to Stop</span>
              </div>
            </div>
          </div>
        </section>

        {/* Speed & Emergency Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Speed Regulation */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-white mb-2 flex items-center space-x-2">
                <span>⚡ Drive Speed Regulation</span>
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Configures motor PWM duty cycle (0 - 255)
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                <span>Slow (Min)</span>
                <span className="text-cyan-400 font-mono text-sm">{speed}% Speed (PWM ~{Math.round(speed * 2.55)})</span>
                <span>Fast (Max)</span>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={speed}
                onChange={handleSpeedChange}
                disabled={!isConnected}
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 disabled:opacity-40"
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-4 text-center">
              NodeMCU pins D7 (Left EN) & D8 (Right EN)
            </div>
          </div>

          {/* Emergency Safety Controls */}
          <div className="bg-slate-900/90 border border-rose-950/60 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
            <div>
              <h3 className="text-xl font-bold text-rose-300 mb-2 flex items-center space-x-2">
                <span>🚨 Emergency Safe-Stop</span>
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Cuts motor PWM to 0 and immediately disarms the pump relay
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onPointerDown={handleEmergencyStop}
                onClick={handleEmergencyStop}
                disabled={!isConnected}
                className="bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white font-extrabold py-4 px-4 rounded-2xl text-sm transition-all duration-150 hover:shadow-lg hover:shadow-rose-600/40 active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>🚨</span>
                <span>HALT ALL SYSTEMS</span>
              </button>

              <button
                type="button"
                onClick={() => setPump('off')}
                disabled={!isConnected}
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-850 text-slate-200 font-bold py-4 px-4 rounded-2xl text-sm border border-slate-700 transition-all active:scale-95 flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>💧</span>
                <span>CUT PUMP ONLY</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 mt-4 text-center">
              Fail-safe trigger also executes automatically on Wi-Fi/WS drop
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}