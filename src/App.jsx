import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import LiveControl from './components/LiveControl';
import StatusPanel from './components/StatusPanel';
import Header from './components/Header';
import PathVisualizer from './components/PathVisualizer';
import UploadMap from './components/UploadMap';
import { WebSocketProvider } from './context/WebSocketContext';

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <div className="App min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
          <Header />
          <Routes>
            <Route path="/" element={<StatusPanel />} />
            <Route path="/live-control" element={<LiveControl />} />
            <Route path="/upload-map" element={<UploadMap />} />
            <Route path="/path-visualizer" element={<PathVisualizer />} />
          </Routes>
        </div>
      </Router>
    </WebSocketProvider>
  );
}

export default App;