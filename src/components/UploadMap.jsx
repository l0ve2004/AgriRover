import React, { useState, useRef, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket'; // <-- Import the hook
import { translateMotorCommand } from '../utils/hardwareMap';

export default function UploadMap() {
  const { isConnected, sendMessage, pumpState, setPump, togglePump } = useWebSocket();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const animationRef = useRef(null);
  const moveIntervalRef = useRef(null);
  const stopIntervalRef = useRef(null);

  // States for Drive Sequence (existing functionality)
  const [mapData, setMapData] = useState([]); // Keep existing name for compatibility
  const [driveMapData, setDriveMapData] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false); // <-- For real robot execution
  const [isExecutingDrive, setIsExecutingDrive] = useState(false);
  const [autoPumpOnDrive, setAutoPumpOnDrive] = useState(false); // Auto spray during drive
  const [currentStep, setCurrentStep] = useState(-1); // -1 when not running on robot
  const [carPosition, setCarPosition] = useState({ x: 600, y: 450 });
  const [carAngle, setCarAngle] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [driveFile, setDriveFile] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [pathTrace, setPathTrace] = useState([]);
  const [movementProgress, setMovementProgress] = useState({ elapsed: 0, total: 0, phase: 'stopped' });

  const canvasSize = { width: 1200, height: 900 };
  const carSize = 30;

  useEffect(() => {
    drawCanvas();
  }, [carPosition, carAngle, pathTrace, mapData, movementProgress, isExecuting, currentStep]);

  // Keep all existing canvas drawing functions
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid(ctx);
    
    // Draw path trace
    drawPathTrace(ctx);
    
    // Draw car
    drawCar(ctx);
    
    // Draw instructions panel
    drawInstructions(ctx);
    
    // Draw real-time status
    drawMovementStatus(ctx);
  };

  const drawGrid = (ctx) => {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= canvasSize.width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.height);
      ctx.stroke();
    }
    
    for (let y = 0; y <= canvasSize.height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.width, y);
      ctx.stroke();
    }
  };

  const drawPathTrace = (ctx) => {
    if (pathTrace.length < 2) return;
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw gradient trail
    for (let i = 1; i < pathTrace.length; i++) {
      const alpha = (i / pathTrace.length) * 0.8 + 0.2;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
      
      ctx.beginPath();
      ctx.moveTo(pathTrace[i-1].x, pathTrace[i-1].y);
      ctx.lineTo(pathTrace[i].x, pathTrace[i].y);
      ctx.stroke();
    }
    
    ctx.globalAlpha = 1;
  };

  const drawCar = (ctx) => {
    ctx.save();
    ctx.translate(carPosition.x, carPosition.y);
    ctx.rotate(carAngle);
    
    // Car shadow
    ctx.save();
    ctx.translate(3, 3);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-carSize/2, -carSize/3, carSize, carSize/1.5);
    ctx.restore();
    
    // Car body
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-carSize/2, -carSize/3, carSize, carSize/1.5);
    
    // Car outline
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 2;
    ctx.strokeRect(-carSize/2, -carSize/3, carSize, carSize/1.5);
    
    // Car direction indicator (front)
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(carSize/3, -carSize/6, carSize/6, carSize/3);
    
    // Headlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(carSize/2 - 2, -carSize/4, 2, carSize/8);
    ctx.fillRect(carSize/2 - 2, carSize/8, 2, carSize/8);
    
    ctx.restore();
    
    // Car emoji label
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚗', carPosition.x, carPosition.y - 40);
  };

  const drawInstructions = (ctx) => {
    if (mapData.length === 0) return;
    
    const currentInstruction = mapData[currentStep] || mapData[mapData.length - 1];
    
    // Larger instruction panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fillRect(20, 20, 400, 140);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 400, 140);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Current Instruction:', 35, 50);
    
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`Direction: ${currentInstruction?.direction || 'None'}`, 35, 80);
    ctx.fillText(`Move Time: ${currentInstruction?.moveTime || 0}s`, 35, 105);
    ctx.fillText(`Stop Time: ${currentInstruction?.stopTime || 0}s`, 35, 130);
    
    // Progress
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`Step: ${currentStep + 1}/${mapData.length}`, 280, 80);
    
    // Status indicator
    if (isPlaying) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = '14px sans-serif';
      ctx.fillText('🔄 RUNNING', 280, 105);
    }
  };

  const drawMovementStatus = (ctx) => {
    if (!isPlaying || mapData.length === 0) return;
    
    const currentInstruction = mapData[currentStep];
    if (!currentInstruction) return;
    
    // Large status display in center-top
    const statusWidth = 500;
    const statusHeight = 120;
    const statusX = (canvasSize.width - statusWidth) / 2;
    const statusY = 30;
    
    // Status background with glow effect
    ctx.save();
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.98)';
    ctx.fillRect(statusX, statusY, statusWidth, statusHeight);
    ctx.restore();
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.strokeRect(statusX, statusY, statusWidth, statusHeight);
    
    // Status text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    
    const centerX = statusX + statusWidth / 2;
    
    if (movementProgress.phase === 'moving') {
      ctx.fillStyle = '#10b981';
      ctx.fillText(`Moving ${currentInstruction.direction.toUpperCase()}`, centerX, statusY + 35);
      
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${movementProgress.elapsed.toFixed(1)}s / ${movementProgress.total.toFixed(1)}s`, centerX, statusY + 65);
      
      // Progress bar
      const barWidth = 300;
      const barHeight = 10;
      const barX = centerX - barWidth / 2;
      const barY = statusY + 75;
      
      ctx.fillStyle = '#374151';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const progress = movementProgress.elapsed / movementProgress.total;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
      
    } else if (movementProgress.phase === 'stopping') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`Stopping (${currentInstruction.direction.toUpperCase()})`, centerX, statusY + 35);
      
      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${movementProgress.elapsed.toFixed(1)}s / ${movementProgress.total.toFixed(1)}s`, centerX, statusY + 65);
      
      // Progress bar for stop time
      const barWidth = 300;
      const barHeight = 10;
      const barX = centerX - barWidth / 2;
      const barY = statusY + 75;
      
      ctx.fillStyle = '#374151';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const progress = movementProgress.elapsed / movementProgress.total;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);
    }
  };

  // Keep existing drive file parser
  const parseMapFile = (content) => {
    const lines = content.trim().split('\n');
    const instructions = [];
    
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      
      const parts = line.split(',').map(part => part.trim());
      if (parts.length >= 3) {
        const direction = parts[0].toLowerCase();
        const moveTime = parseFloat(parts[1]) || 0;
        const stopTime = parseFloat(parts[2]) || 0;
        
        if (['forward', 'backward', 'left', 'right'].includes(direction)) {
          instructions.push({ direction, moveTime, stopTime });
        }
      }
    }
    
    return instructions;
  };



  // Keep existing drive file upload handler
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setUploadedFile(file.name);
    setDriveFile(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const instructions = parseMapFile(content);
        setMapData(instructions);
        setDriveMapData(instructions);
        resetAnimation();
      } catch (error) {
        alert('Error reading file: ' + error.message);
      }
    };
    reader.readAsText(file);
  };



  // Keep all existing animation functions
  const resetAnimation = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setCarPosition({ x: 600, y: 450 }); // Centered for larger canvas
    setCarAngle(0);
    setPathTrace([{ x: 600, y: 450 }]);
    setMovementProgress({ elapsed: 0, total: 0, phase: 'stopped' });
    
    // Clear all intervals and timeouts
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
    }
    if (stopIntervalRef.current) {
      clearInterval(stopIntervalRef.current);
    }
  };

  const startAnimation = () => {
    if (mapData.length === 0) {
      alert('Please upload a map file first!');
      return;
    }
    
    setIsPlaying(true);
    setCurrentStep(0);
    executeStep(0);
  };

  const executeStep = (stepIndex) => {
    if (stepIndex >= mapData.length) {
      setIsPlaying(false);
      setMovementProgress({ elapsed: 0, total: 0, phase: 'stopped' });
      return;
    }

    const instruction = mapData[stepIndex];
    setCurrentStep(stepIndex);
    
    // Movement phase
    setMovementProgress({ elapsed: 0, total: instruction.moveTime, phase: 'moving' });
    
    const moveDistance = instruction.moveTime * 50 * speed; // Increased movement distance
    const steps = Math.floor(instruction.moveTime * 20 * speed); // More animation steps for smoother movement
    
    let stepCount = 0;
    const moveStartTime = Date.now();
    
    moveIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - moveStartTime) / 1000 / speed;
      setMovementProgress({ elapsed: Math.min(elapsed, instruction.moveTime), total: instruction.moveTime, phase: 'moving' });
      
      setCarPosition(prevPos => {
        const newPos = calculateNewPosition(prevPos, instruction.direction, moveDistance / steps);
        setCarAngle(getAngleForDirection(instruction.direction));
        
        // Add to path trace
        setPathTrace(prev => [...prev, newPos]);
        
        return newPos;
      });
      
      stepCount++;
      if (stepCount >= steps) {
        clearInterval(moveIntervalRef.current);
        
        // Stop phase
        if (instruction.stopTime > 0) {
          setMovementProgress({ elapsed: 0, total: instruction.stopTime, phase: 'stopping' });
          
          const stopStartTime = Date.now();
          stopIntervalRef.current = setInterval(() => {
            const elapsed = (Date.now() - stopStartTime) / 1000 / speed;
            setMovementProgress({ elapsed: Math.min(elapsed, instruction.stopTime), total: instruction.stopTime, phase: 'stopping' });
            
            if (elapsed >= instruction.stopTime) {
              clearInterval(stopIntervalRef.current);
              animationRef.current = setTimeout(() => {
                executeStep(stepIndex + 1);
              }, 100);
            }
          }, 50);
        } else {
          animationRef.current = setTimeout(() => {
            executeStep(stepIndex + 1);
          }, 100);
        }
      }
    }, 50 / speed); // Faster refresh rate for smoother animation
  };

  const calculateNewPosition = (pos, direction, distance) => {
    let newX = pos.x;
    let newY = pos.y;
    
    switch (direction) {
      case 'forward':
        newY = Math.max(carSize, pos.y - distance);
        break;
      case 'backward':
        newY = Math.min(canvasSize.height - carSize, pos.y + distance);
        break;
      case 'left':
        newX = Math.max(carSize, pos.x - distance);
        break;
      case 'right':
        newX = Math.min(canvasSize.width - carSize, pos.x + distance);
        break;
    }
    
    return { x: newX, y: newY };
  };

  const getAngleForDirection = (direction) => {
    switch (direction) {
      case 'forward': return 0;
      case 'backward': return Math.PI;
      case 'left': return -Math.PI/2;
      case 'right': return Math.PI/2;
      default: return 0;
    }
  };

  const stopAnimation = () => {
    setIsPlaying(false);
    setMovementProgress({ elapsed: 0, total: 0, phase: 'stopped' });
    
    // Clear all intervals and timeouts
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    if (moveIntervalRef.current) {
      clearInterval(moveIntervalRef.current);
    }
    if (stopIntervalRef.current) {
      clearInterval(stopIntervalRef.current);
    }
  };

  // Keep existing real robot execution logic
  const executeRealtimeCommands = async () => {
    if (!isConnected) {
      alert("Robot not connected!");
      return;
    }
    setIsExecuting(true);
    for (let i = 0; i < mapData.length; i++) {
      setCurrentStep(i);
      const instruction = mapData[i];

      // Send MOVE command
      if (instruction.moveTime > 0) {
        const moveCommand = {
          task: "move",
          direction: translateMotorCommand(instruction.direction),
          duration: instruction.moveTime * 1000, // ms
        };
        sendMessage(moveCommand);
        await new Promise(resolve => setTimeout(resolve, instruction.moveTime * 1000));
      }

      // Wait for the STOP duration
      if (instruction.stopTime > 0) {
        await new Promise(resolve => setTimeout(resolve, instruction.stopTime * 1000));
      }
    }
    setIsExecuting(false);
    setCurrentStep(-1);
    alert("Mission complete!");
  };

  // New drive sequence execution
  const executeDriveSequence = async () => {
    if (!isConnected) {
      alert("Robot not connected!");
      return;
    }
    setIsExecutingDrive(true);
    for (const instruction of driveMapData) {
      const moveCommand = { 
        task: "drive_move", 
        direction: translateMotorCommand(instruction.direction), 
        duration: instruction.moveTime * 1000 
      };
      sendMessage(moveCommand);
      await new Promise(resolve => setTimeout(resolve, (instruction.moveTime + instruction.stopTime) * 1000));
    }
    // If auto spray was enabled, turn pump OFF when drive mission finishes
    if (autoPumpOnDrive) {
      setPump('off');
    }
    setIsExecutingDrive(false);
    alert("Drive mission complete!");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-3 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Autonomous Route & Spray Visualizer
          </h1>
          <p className="text-slate-300 text-lg">
            Upload waypoint trajectories for field fertilizer coverage and verify paths in simulation
          </p>
        </div>

        {/* Vehicle Movement Section */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 mb-8">
          <h3 className="text-2xl font-semibold mb-6 text-center">Upload Vehicle Movement File</h3>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Upload Area */}
            <div>
              <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 text-lg"
                >
                  📁 Choose Movement File
                </button>
                {uploadedFile && (
                  <p className="mt-4 text-green-400 text-lg">✅ Uploaded: {uploadedFile}</p>
                )}
              </div>
            </div>

            {/* File Format Guide */}
            <div className="bg-slate-700 rounded-lg p-6">
              <h4 className="font-bold text-lg mb-4">File Format:</h4>
              <div className="text-sm text-gray-300 space-y-2">
                <p className="text-blue-400 font-mono text-base">direction, move_time, stop_time</p>
                <p><strong>Example:</strong></p>
                <div className="bg-slate-800 rounded p-3 font-mono text-sm">
                  forward, 2, 1<br />
                  right, 1.5, 0.5<br />
                  backward, 1, 2<br />
                  left, 1, 0
                </div>
                <p className="text-xs">• Directions: forward, backward, left, right<br />
                  • Times in seconds<br />
                  • One instruction per line</p>
              </div>
            </div>
          </div>
          <div className="text-center mt-6">
            <button
              onClick={executeDriveSequence}
              disabled={!isConnected || isExecutingDrive || driveMapData.length === 0}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed text-lg"
            >
              {isExecutingDrive ? "Drive Mission Running..." : "Run Drive Mission"}
            </button>
          </div>
        </div>

        {/* Fertilizer Pump Mission Integration */}
        <div className="bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl border border-emerald-500/30 mb-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl border border-emerald-500/30">
                💧
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Fertilizer Spray Pump Relay</h3>
                <p className="text-xs text-slate-400">
                  Control pump relay state during autonomous missions
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="text-right">
                <div className="text-xs text-slate-400">Requested State:</div>
                <div className={`text-xs font-mono font-bold ${pumpState === 'on' && isConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {pumpState === 'on' && isConnected ? '● ON (ENERGIZED)' : '○ OFF (STANDBY)'}
                </div>
              </div>

              <button
                onClick={() => setPump(pumpState === 'on' ? 'off' : 'on')}
                disabled={!isConnected}
                className={`py-2.5 px-5 rounded-xl font-bold text-xs transition-all ${
                  !isConnected
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                    : pumpState === 'on'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                }`}
              >
                {pumpState === 'on' ? 'Stop Pump' : 'Start Pump'}
              </button>
            </div>
          </div>
        </div>

        {/* Animation Controls */}
        {mapData.length > 0 && (
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 mb-8">
            <div className="flex flex-wrap justify-center items-center space-x-6 space-y-2">
              <button
                onClick={startAnimation}
                disabled={isPlaying || isExecuting}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed text-lg"
              >
                ▶️ Start Animation
              </button>
              <button
                onClick={stopAnimation}
                disabled={!isPlaying}
                className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed text-lg"
              >
                ⏸️ Stop
              </button>
              <button
                onClick={resetAnimation}
                className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 text-lg"
              >
                🔄 Reset
              </button>
              <button
                onClick={executeRealtimeCommands}
                disabled={!isConnected || isExecuting || mapData.length === 0}
                className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-bold py-4 px-8 rounded-lg transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed text-lg"
              >
                {isExecuting ? "Mission in Progress..." : "Run on Robot"}
              </button>
              
              <div className="flex items-center space-x-3">
                <label className="text-gray-300 text-lg">Speed:</label>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.5"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-24"
                  disabled={isPlaying || isExecuting}
                />
                <span className="text-blue-400 text-lg font-bold">{speed}x</span>
              </div>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-700 mb-8">
          <h3 className="text-2xl font-semibold mb-6 text-center">Robot Movement Visualization</h3>
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="border-2 border-slate-600 rounded-lg bg-slate-700 shadow-lg"
            />
          </div>
          <div className="flex justify-center items-center space-x-8 mt-6 text-base text-gray-400">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-3 bg-red-600 rounded"></div>
              <span>Robot Car</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-2 bg-blue-400 rounded"></div>
              <span>Path Trace</span>
            </div>
            <div className="font-semibold">
              Step: {currentStep >= 0 ? currentStep + 1 : 0}/{mapData.length || 0}
            </div>
          </div>
        </div>

        {/* Instructions List */}
        {mapData.length > 0 && (
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 mb-8">
            <h3 className="text-2xl font-semibold mb-6 text-center">Movement Instructions</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-80 overflow-y-auto">
              {mapData.map((instruction, index) => (
                <div
                  key={index}
                  className={`p-5 rounded-lg border transition-all duration-300 ${
                    index === currentStep && isExecuting
                      ? 'bg-yellow-600 border-yellow-400 shadow-lg transform scale-105'
                      : index === currentStep && isPlaying
                        ? 'bg-blue-600 border-blue-400 shadow-lg transform scale-105'
                        : index < currentStep
                          ? 'bg-green-700 border-green-500'
                          : 'bg-slate-700 border-slate-600'
                  }`}
                >
                  <div className="text-center">
                    <div className="font-bold text-lg mb-3">Step {index + 1}</div>
                    <div className="text-sm space-y-2">
                      <div>Direction: <span className="font-medium capitalize text-yellow-400">{instruction.direction}</span></div>
                      <div>Move: <span className="font-medium text-blue-400">{instruction.moveTime}s</span></div>
                      <div>Stop: <span className="font-medium text-orange-400">{instruction.stopTime}s</span></div>
                    </div>
                    {index === currentStep && isPlaying && (
                      <div className="mt-3 text-sm animate-pulse font-bold text-yellow-300">
                        🔄 Executing...
                      </div>
                    )}
                    {index === currentStep && isExecuting && (
                      <div className="mt-3 text-sm animate-pulse font-bold text-yellow-300">
                        🚗 Sending to Robot...
                      </div>
                    )}
                    {index < currentStep && (isPlaying || isExecuting) && (
                      <div className="mt-3 text-sm font-bold text-green-300">✅ Completed</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}



        {/* Sample Files */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Sample Movement File */}
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
            <h3 className="text-2xl font-semibold mb-6 text-center">Sample Movement File</h3>
            <div className="bg-slate-900 rounded-lg p-6 font-mono text-base">
              <div className="text-gray-400 mb-3"># Sample robot movement instructions</div>
              <div className="text-green-400">forward, 3, 1</div>
              <div className="text-green-400">right, 2, 0.5</div>
              <div className="text-green-400">forward, 2, 1</div>
              <div className="text-green-400">left, 1.5, 0</div>
              <div className="text-green-400">backward, 2, 2</div>
            </div>
            <p className="text-gray-400 text-base mt-4 text-center">
              Copy this to a .txt file to test the visualizer!
            </p>
          </div>

          {/* Agricultural Field Coverage Guide */}
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
            <h3 className="text-2xl font-semibold mb-6 text-center">Field Spray Coverage Example</h3>
            <div className="bg-slate-900 rounded-lg p-6 font-mono text-base">
              <div className="text-gray-400 mb-3"># Serpentine field coverage trajectory</div>
              <div className="text-emerald-400">forward, 4, 0.5</div>
              <div className="text-emerald-400">right, 1.2, 0.5</div>
              <div className="text-emerald-400">forward, 1, 0.5</div>
              <div className="text-emerald-400">right, 1.2, 0.5</div>
              <div className="text-emerald-400">forward, 4, 0.5</div>
            </div>
            <p className="text-gray-400 text-base mt-4 text-center">
              Rows format: direction, duration_seconds, pause_seconds
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}