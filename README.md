
# Stock Broker Client Dashboard

A real-time stock monitoring dashboard built with **React**, **Node.js**, and **WebSockets**.  
Users can log in, subscribe to supported stocks, view live price updates, analyze trends through charts, and visualize portfolio movement using pie charts and bar charts.

---

## Features

### User Login
- Simple email-based login  
- Validates that email contains `@` and a domain (e.g., `.com`)  
- Session persists via `localStorage`

### Live Stock Price Updates
- Real-time prices via WebSockets (simulated generator)  
- Prices updated every second without page refresh  
- Multi-client support — open multiple browser windows to test asynchronous updates

### Charts & Visual Insights
- Real-time line chart for selected ticker  
- Portfolio allocation pie chart  
- Up/Down movement pie chart  
- Percentage movement bar graph  
- Historical price preservation (unsubscribing does not delete history)

### UI & UX
- Clean, modern layout (left = controls, right = analytics)  
- Color-coded indicators (green = up, red = down)  
- Small sparkline previews for tickers

---

## How to Run the Project

### 1. Start the Backend

cd backend
npm install
node server.js

### Backend WebSocket server starts at:

ws://localhost:4000

### 2. Start the Frontend

Open a new terminal:

cd frontend
npm install
npm start


App opens at:

http://localhost:3000


### 3.Login

Enter any valid email (example: user@example.com) to access the dashboard.

## Tech Stack

### Frontend

React

Recharts (charts)

### CSS

### Backend

Node.js

ws WebSocket library

 ## Design Decisions (short)

- WebSockets chosen to simulate a realistic trading feed with low latency.

- LocalStorage preserves subscriptions and history so UX remains intact across refreshes.

- Separate frontend/backend mirrors real production architecture.

- Charts & visual signals prioritized for quick assessment of portfolio health.






