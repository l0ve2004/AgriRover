import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const WebSocketContext = createContext(null);

const DEFAULT_IP = import.meta.env.VITE_ESP8266_IP || import.meta.env.VITE_ESP32_IP || '10.162.72.63';
const LEGACY_DEFAULT_IP = '10.149.91.63';

export const WebSocketProvider = ({ children }) => {
  const [espIp, setEspIpState] = useState(() => {
    if (typeof window !== 'undefined') {
      const storedIp = localStorage.getItem('agrirover_esp_ip');
      return storedIp && storedIp !== LEGACY_DEFAULT_IP ? storedIp : DEFAULT_IP;
    }
    return DEFAULT_IP;
  });

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting' | 'connected' | 'disconnected' | 'error'
  const [lastMessage, setLastMessage] = useState(null);
  const [pumpState, setPumpState] = useState('off'); // 'on' | 'off'
  const [lastCommand, setLastCommand] = useState('None');
  const [errorMessage, setErrorMessage] = useState('');

  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isExplicitCloseRef = useRef(false);

  // Helper to normalize IP input
  const cleanIpAddress = (raw) => {
    if (!raw) return DEFAULT_IP;
    return raw
      .trim()
      .replace(/^ws:\/\//i, '')
      .replace(/^http:\/\//i, '')
      .replace(/\/ws\/?$/i, '')
      .replace(/\/$/, '');
  };

  const setEspIp = (newIp) => {
    const cleaned = cleanIpAddress(newIp);
    if (cleaned === espIp) return;
    setEspIpState(cleaned);
    if (typeof window !== 'undefined') {
      localStorage.setItem('agrirover_esp_ip', cleaned);
    }
  };

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Guard: If socket is already OPEN or CONNECTING, do not recreate!
    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      console.log('[AgriRover WS] Socket already active or connecting. Reusing connection.');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const currentIp = cleanIpAddress(espIp);
    const wsUrl = `ws://${currentIp}/ws`;

    console.log(`[AgriRover WS] Initiating persistent connection to: ${wsUrl}`);
    setConnectionStatus('connecting');
    setErrorMessage(
      window.location.protocol === 'https:'
        ? 'This HTTPS dashboard cannot connect directly to the ESP8266 using ws://. Open the dashboard over HTTP on the same Wi-Fi network or configure a secure WebSocket proxy.'
        : ''
    );
    isExplicitCloseRef.current = false;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[AgriRover WS] Connected successfully and holding open.');
        setIsConnected(true);
        setConnectionStatus('connected');
        setErrorMessage('');

        // Send a ping to confirm bidirectional communication
        try {
          ws.send(JSON.stringify({ ping: 1 }));
        } catch (e) {
          // ignore
        }
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setLastMessage(parsed);

          // Synchronize pump state from ESP8266 feedback
          if (parsed && typeof parsed.pump !== 'undefined') {
            const pState =
              parsed.pump === true || parsed.pump === 'on' || parsed.pump === 1
                ? 'on'
                : 'off';
            setPumpState(pState);
          }
        } catch (err) {
          setLastMessage({ raw: event.data });
        }
      };

      ws.onclose = (event) => {
        console.log(`[AgriRover WS] Connection closed (code: ${event.code})`);
        setIsConnected(false);
        setConnectionStatus('disconnected');

        // Only reset pump to off when connection actually drops
        setPumpState('off');

        // Automatic retry if not closed explicitly
        if (!isExplicitCloseRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[AgriRover WS] Auto-reconnecting...');
            connect();
          }, 3500);
        }
      };

      ws.onerror = (error) => {
        console.error('[AgriRover WS] Socket error:', error);
        setIsConnected(false);
        setConnectionStatus('error');
        setErrorMessage(
          window.location.protocol === 'https:'
            ? 'This HTTPS dashboard cannot connect directly to the ESP8266 using ws://. Open the dashboard over HTTP on the same Wi-Fi network or configure a secure WebSocket proxy.'
            : `Cannot reach ws://${currentIp}/ws`
        );
      };
    } catch (err) {
      console.error('[AgriRover WS] Connect exception:', err);
      setIsConnected(false);
      setConnectionStatus('error');
      setErrorMessage(err.message || 'Connection error');
    }
  }, [espIp]);

  // Initial connection
  useEffect(() => {
    connect();

    return () => {
      isExplicitCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // Heartbeat keep-alive timer: sends a ping every 4 seconds to maintain TCP connection
  useEffect(() => {
    const heartbeatTimer = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ ping: 1 }));
        } catch (e) {
          // ignore transient error
        }
      }
    }, 4000);

    return () => clearInterval(heartbeatTimer);
  }, []);

  // Send message helper
  const sendMessage = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const payload = typeof message === 'string' ? message : JSON.stringify(message);
      socketRef.current.send(payload);
      return true;
    } else {
      console.warn('[AgriRover WS] Socket not open. Cannot send:', message);
      return false;
    }
  }, []);

  // Dedicated Pump Control Function
  const setPump = useCallback((targetState) => {
    const isOn = targetState === 'on' || targetState === true;
    const commandValue = isOn ? 'on' : 'off';

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ pump: commandValue }));
      setPumpState(commandValue);
      setLastCommand(`Pump ${commandValue.toUpperCase()}`);
      console.log(`[AgriRover WS] Sent pump command: {"pump":"${commandValue}"}`);
      return true;
    } else {
      console.warn('[AgriRover WS] Cannot control pump: WebSocket is not connected');
      setPumpState('off');
      return false;
    }
  }, []);

  const togglePump = useCallback(() => {
    const nextState = pumpState === 'on' ? 'off' : 'on';
    return setPump(nextState);
  }, [pumpState, setPump]);

  // Emergency Stop: stops vehicle and shuts off pump immediately
  const emergencyStop = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ command: 'stop' }));
      socketRef.current.send(JSON.stringify({ pump: 'off' }));
    }
    setPumpState('off');
    setLastCommand('EMERGENCY STOP (Motors & Pump OFF)');
  }, []);

  const reconnect = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        // ignore
      }
      socketRef.current = null;
    }
    connect();
  }, [connect]);

  const value = {
    isConnected,
    connectionStatus,
    lastMessage,
    pumpState,
    setPump,
    togglePump,
    emergencyStop,
    lastCommand,
    setLastCommand,
    espIp,
    setEspIp,
    reconnect,
    errorMessage,
    sendMessage,
    wsUrl: `ws://${cleanIpAddress(espIp)}/ws`
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
