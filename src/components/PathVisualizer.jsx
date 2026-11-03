import React, { useState, useRef, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket'; // <-- Import the hook
import { translateMotorCommand } from '../utils/hardwareMap';

export default function PathVisualizer() {
  const { isConnected, sendMessage, pumpState, setPump, togglePump } = useWebSocket();
  const canvasRef = useRef(null);
  const [shapes, setShapes] = useState([]);
  const [shapeType, setShapeType] = useState('rectangle');
  const [dimensions, setDimensions] = useState({ length: '', width: '', radius: '' });
  const [canvasSize] = useState({ width: 800, height: 600 });
  const [scale] = useState(50); // 1cm = 50 pixels
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx);
    shapes.forEach((shape, index) => drawShape(ctx, shape, index));
  }, [shapes]);

  const drawGrid = (ctx) => {
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvasSize.width; x += scale) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvasSize.height; y += scale) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize.width, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#9ca3af';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (let x = scale; x < canvasSize.width; x += scale) {
      ctx.fillText(`${x/scale}cm`, x, 15);
    }
    ctx.textAlign = 'right';
    for (let y = scale; y < canvasSize.height; y += scale) {
      ctx.fillText(`${y/scale}cm`, 45, y + 5);
    }
  };

  const drawShape = (ctx, shape, index) => {
    const colors = {
      'circle': '#10b981',
      'rectangle': '#f59e0b',
      'triangle': '#ef4444',
      'square': '#8b5cf6'
    };
    const color = colors[shape.type];
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '30';
    ctx.lineWidth = 3;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const offsetX = (index % 3) * 150 - 150;
    const offsetY = Math.floor(index / 3) * 150 - 100;
    ctx.beginPath();
    switch (shape.type) {
      case 'circle':
        const radius = shape.radius * scale;
        ctx.arc(centerX + offsetX, centerY + offsetY, radius, 0, 2 * Math.PI);
        break;
      case 'rectangle':
        const rectWidth = shape.length * scale;
        const rectHeight = shape.width * scale;
        const rectX = centerX + offsetX - rectWidth/2;
        const rectY = centerY + offsetY - rectHeight/2;
        ctx.rect(rectX, rectY, rectWidth, rectHeight);
        break;
      case 'square':
        const squareSize = shape.side * scale;
        const squareX = centerX + offsetX - squareSize/2;
        const squareY = centerY + offsetY - squareSize/2;
        ctx.rect(squareX, squareY, squareSize, squareSize);
        break;
      case 'triangle':
        const triSize = shape.side * scale;
        const triX = centerX + offsetX;
        const triY = centerY + offsetY;
        ctx.moveTo(triX, triY - triSize/2);
        ctx.lineTo(triX - triSize/2, triY + triSize/4);
        ctx.lineTo(triX + triSize/2, triY + triSize/4);
        ctx.closePath();
        break;
    }
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${shape.type.toUpperCase()} #${index + 1}`, 
      centerX + offsetX, 
      centerY + offsetY + 80
    );
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '12px sans-serif';
    let dimensionText = '';
    switch (shape.type) {
      case 'circle':
        dimensionText = `r=${shape.radius}cm`;
        break;
      case 'rectangle':
        dimensionText = `${shape.length}×${shape.width}cm`;
        break;
      case 'square':
        dimensionText = `${shape.side}×${shape.side}cm`;
        break;
      case 'triangle':
        dimensionText = `side=${shape.side}cm`;
        break;
    }
    ctx.fillText(dimensionText, centerX + offsetX, centerY + offsetY + 100);
  };

  const addShape = () => {
    if (!dimensions.length && !dimensions.radius && !dimensions.width) {
      alert('Please enter dimensions!');
      return;
    }
    let newShape;
    switch (shapeType) {
      case 'circle':
        if (!dimensions.radius) {
          alert('Please enter radius for circle!');
          return;
        }
        newShape = {
          type: 'circle',
          radius: parseFloat(dimensions.radius)
        };
        break;
      case 'rectangle':
        if (!dimensions.length || !dimensions.width) {
          alert('Please enter both length and width for rectangle!');
          return;
        }
        newShape = {
          type: 'rectangle',
          length: parseFloat(dimensions.length),
          width: parseFloat(dimensions.width)
        };
        break;
      case 'square':
        if (!dimensions.length) {
          alert('Please enter side length for square!');
          return;
        }
        newShape = {
          type: 'square',
          side: parseFloat(dimensions.length)
        };
        break;
      case 'triangle':
        if (!dimensions.length) {
          alert('Please enter side length for triangle!');
          return;
        }
        newShape = {
          type: 'triangle',
          side: parseFloat(dimensions.length)
        };
        break;
    }
    setShapes(prev => [...prev, newShape]);
    setDimensions({ length: '', width: '', radius: '' });
  };

  const clearAll = () => {
    setShapes([]);
  };

  const removeLastShape = () => {
    setShapes(prev => prev.slice(0, -1));
  };

  // --- Begin: Robot Path Execution Logic ---
  const generateAndRunCommands = async () => {
    if (!isConnected) {
      alert("Robot not connected!");
      return;
    }
    if (shapes.length === 0) {
      alert("Please add some shapes to create a path!");
      return;
    }

    const commands = [];
    const speedCmPerSecond = 10; // Robot's speed (adjust as needed)
    const turnTimeSeconds = 1.5; // Time for a 90-degree turn (adjust as needed)

    for (const shape of shapes) {
      switch (shape.type) {
        case 'rectangle':
          // Four sides: length, width, length, width
          commands.push({ direction: 'forward', moveTime: shape.length / speedCmPerSecond, stopTime: 0.5 });
          commands.push({ direction: 'right', moveTime: turnTimeSeconds, stopTime: 0.5 });
          commands.push({ direction: 'forward', moveTime: shape.width / speedCmPerSecond, stopTime: 0.5 });
          commands.push({ direction: 'right', moveTime: turnTimeSeconds, stopTime: 0.5 });
          commands.push({ direction: 'forward', moveTime: shape.length / speedCmPerSecond, stopTime: 0.5 });
          commands.push({ direction: 'right', moveTime: turnTimeSeconds, stopTime: 0.5 });
          commands.push({ direction: 'forward', moveTime: shape.width / speedCmPerSecond, stopTime: 0.5 });
          commands.push({ direction: 'right', moveTime: turnTimeSeconds, stopTime: 0.5 });
          break;
        case 'square':
          for (let i = 0; i < 4; i++) {
            commands.push({ direction: 'forward', moveTime: shape.side / speedCmPerSecond, stopTime: 0.5 });
            commands.push({ direction: 'right', moveTime: turnTimeSeconds, stopTime: 0.5 });
          }
          break;
        // You can add logic for 'circle' (approximate as polygon) and 'triangle' if needed
      }
    }

    setIsExecuting(true);
    for (const instruction of commands) {
      const moveCommand = {
        task: "drive_move",
        direction: translateMotorCommand(instruction.direction),
        duration: Math.round(instruction.moveTime * 1000),
      };
      sendMessage(moveCommand);
      await new Promise(resolve => setTimeout(resolve, (instruction.moveTime + instruction.stopTime) * 1000));
    }
    setIsExecuting(false);
    alert("Path complete!");
  };
  // --- End: Robot Path Execution Logic ---

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold mb-3 bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Geometric Path & Perimeter Spray
          </h1>
          <p className="text-slate-300 text-lg">Define geometric field boundaries, shapes, and execute timed paths</p>
        </div>

        {/* Pump Status Strip */}
        <div className="bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">💧</span>
            <div>
              <div className="text-sm font-bold text-white">Fertilizer Spray Pump</div>
              <div className="text-xs text-slate-400">
                Requested State: <span className={`font-mono font-bold ${pumpState === 'on' && isConnected ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {pumpState === 'on' && isConnected ? 'ON (ENERGIZED)' : 'OFF (STANDBY)'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => isConnected && togglePump()}
              disabled={!isConnected}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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

        {/* Shape Input Panel */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-xl border border-slate-700 mb-8">
          <h3 className="text-2xl font-semibold mb-6 text-center">Add Shape</h3>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Shape Selection */}
            <div>
              <label className="block text-gray-300 text-lg font-medium mb-4">Shape Type</label>
              <select
                value={shapeType}
                onChange={(e) => setShapeType(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400"
              >
                <option value="rectangle">Rectangle</option>
                <option value="square">Square</option>
                <option value="circle">Circle</option>
                <option value="triangle">Triangle (Equilateral)</option>
              </select>
            </div>
            {/* Dimensions Input */}
            <div>
              <label className="block text-gray-300 text-lg font-medium mb-4">Dimensions (cm)</label>
              <div className="space-y-3">
                {shapeType === 'circle' && (
                  <input
                    type="number"
                    placeholder="Radius (cm)"
                    value={dimensions.radius}
                    onChange={(e) => setDimensions(prev => ({ ...prev, radius: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                  />
                )}
                {shapeType === 'rectangle' && (
                  <>
                    <input
                      type="number"
                      placeholder="Length (cm)"
                      value={dimensions.length}
                      onChange={(e) => setDimensions(prev => ({ ...prev, length: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="number"
                      placeholder="Width (cm)"
                      value={dimensions.width}
                      onChange={(e) => setDimensions(prev => ({ ...prev, width: e.target.value }))}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                    />
                  </>
                )}
                {(shapeType === 'square' || shapeType === 'triangle') && (
                  <input
                    type="number"
                    placeholder={`${shapeType === 'square' ? 'Side' : 'Side'} Length (cm)`}
                    value={dimensions.length}
                    onChange={(e) => setDimensions(prev => ({ ...prev, length: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-400"
                  />
                )}
              </div>
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex justify-center space-x-4 mt-8">
            <button
              onClick={addShape}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 hover:scale-105"
            >
              ➕ Add Shape
            </button>
            <button
              onClick={removeLastShape}
              className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 hover:scale-105"
            >
              ↶ Remove Last
            </button>
            <button
              onClick={generateAndRunCommands}
              disabled={!isConnected || isExecuting}
              className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 hover:scale-105 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isExecuting ? "Executing Path..." : "Run Path on Robot"}
            </button>
            <button
              onClick={clearAll}
              className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-lg transition-all duration-200 hover:scale-105"
            >
              🗑️ Clear All
            </button>
          </div>
        </div>

        {/* Canvas Container */}
        <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700 mb-8">
          <h3 className="text-xl font-semibold mb-4 text-center">Canvas (1 grid square = 1cm)</h3>
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="border-2 border-slate-600 rounded-lg bg-slate-700"
            />
          </div>
          <p className="text-center text-gray-400 mt-4">
            Grid scale: 1 square = 1cm | Total shapes: <span className="text-blue-400 font-bold">{shapes.length}</span>
          </p>
        </div>

        {/* Shape List */}
        {shapes.length > 0 && (
          <div className="bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-700">
            <h3 className="text-xl font-semibold mb-4 text-center">Created Shapes</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shapes.map((shape, index) => (
                <div key={index} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-lg capitalize">{shape.type} #{index + 1}</h4>
                      <div className="text-gray-300 text-sm">
                        {shape.type === 'circle' && `Radius: ${shape.radius}cm`}
                        {shape.type === 'rectangle' && `${shape.length}cm × ${shape.width}cm`}
                        {shape.type === 'square' && `${shape.side}cm × ${shape.side}cm`}
                        {shape.type === 'triangle' && `Side: ${shape.side}cm`}
                      </div>
                    </div>
                    <button
                      onClick={() => setShapes(prev => prev.filter((_, i) => i !== index))}
                      className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}