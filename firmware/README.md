# AgriRover — ESP8266 Firmware & Hardware Wiring Guide

## Overview
This folder contains the complete, production-ready Arduino firmware for the **NodeMCU ESP8266** microcontroller controlling the Fertilizer Rover (Dual H-bridge motors and 3.3V relay spray pump).

---

## What Was Fixed (Addressing Connection Drops / Double Connect)

1. **Disabled Wi-Fi Modem Sleep (`WiFi.setSleepMode(WIFI_NONE_SLEEP)`)**:
   - By default, the ESP8266 enables modem sleep to save battery, shutting down the radio intermittently between beacon intervals. This was causing WebSocket TCP packet delays, timeouts, and unexpected disconnects.
   - Disabling sleep keeps the radio awake at full power for reliable, zero-drop WebSocket communication.

2. **Multi-Client Aware Safe-Stop (`serverPtr->count() == 0`)**:
   - Previously, when client #1 disconnected, the firmware called `stopMotors()` and `setPump(false)` immediately, even if client #2 was already connected (e.g. during a dashboard refresh or reconnect).
   - Now, the firmware only shuts down motors and cuts the pump when **all** active clients have disconnected.

3. **Dashboard React StrictMode Churn Removed**:
   - In development mode, React StrictMode intentionally mounted components twice (mount → cleanup/close → mount). Removing StrictMode ensures a single, persistent connection from the moment you open the dashboard until you close the tab.

4. **Bi-directional Heartbeat (Ping/Pong)**:
   - The dashboard now sends a small heartbeat (`{"ping":1}`) every 4 seconds. The ESP8266 immediately replies with `{"pong":1,"pump":"on"|"off"}` to keep the TCP socket open through routers and NAT gateways.

5. **CPU Loop Optimization**:
   - Removed redundant continuous motor GPIO writes from `loop()` so the ESP8266 CPU and background Wi-Fi/AsyncTCP stacks run smoothly without task starvation.

---

## Hardware Pinout Table

| ESP8266 Pin (NodeMCU) | GPIO   | Connected Component               | Notes                                      |
| :-------------------- | :----- | :-------------------------------- | :----------------------------------------- |
| **D0**                | GPIO16 | **Relay Module IN (Pump)**        | Active-LOW relay logic (LOW = ON, HIGH = OFF)|
| **D1**                | GPIO5  | Left Motor Driver IN1             | Direction control                          |
| **D2**                | GPIO4  | Left Motor Driver IN2             | Direction control                          |
| **D7**                | GPIO13 | Left Motor Driver ENA (PWM)       | PWM speed control                          |
| **D5**                | GPIO14 | Right Motor Driver IN1            | Direction control                          |
| **D6**                | GPIO12 | Right Motor Driver IN2            | Direction control                          |
| **D8**                | GPIO15 | Right Motor Driver ENB (PWM)      | Boot pin: Must stay LOW at boot            |
| **GND**               | GND    | Common Ground                     | Connect all GNDs together (ESP, Driver, Relay)|
| **VIN / 5V**          | Power  | Regulated 5V Supply               | Powers NodeMCU                             |

---

## Required Arduino Libraries
Install these in Arduino IDE via **Sketch → Include Library → Manage Libraries...** (or download from GitHub):
1. **ESP8266 Board Package** (v3.0.2 or later via Boards Manager)
2. **ESPAsyncTCP** (by dvarrel / me-no-dev)
3. **ESPAsyncWebServer** (by me-no-dev)
4. **Arduino_JSON** (by Arduino, v0.2.0 or later)

---

## Uploading Instructions
1. Open [`AgriRover_ESP8266.ino`](file:///c:/Users/mishr/OneDrive/Documents/Microproject/MacroProject/robocar/AgriRover/firmware/AgriRover_ESP8266/AgriRover_ESP8266.ino) in the Arduino IDE.
2. Select your board: **NodeMCU 1.0 (ESP-12E Module)**.
3. Configure settings:
   - CPU Frequency: **80 MHz** (or 160 MHz)
   - Flash Size: **4MB (FS:2MB OTA:~1019KB)**
   - Upload Speed: **115200** or **921600**
4. Connect the NodeMCU to your computer via micro-USB and select the correct COM port.
5. Click **Upload**.
6. Open the **Serial Monitor** at **115200 baud** to see the IP address printed upon connection.
7. Enter this IP address in the top bar of the dashboard.

## Dashboard connection requirements

The dashboard connects directly to `ws://<ESP8266_IP>/ws`. The browser and ESP8266
must be on the same Wi-Fi network, and the dashboard must be opened over HTTP.
Browsers block an insecure `ws://` connection from an HTTPS page such as the
GitHub Pages deployment. For local testing, run the dashboard with `npm run dev`
and open the HTTP URL shown by Vite, then enter the current IP printed by the
ESP8266 (for example `10.162.72.63`) in the IP control.
