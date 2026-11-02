const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/player'));
app.get('/player', (req, res) => res.sendFile(path.join(__dirname, 'public/player.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'public/host.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));

// Token targets assigned per team
const TARGET_CODES = {
  teamA: 'FIGHT_TARGET_TEAM_A',
  teamB: 'FIGHT_TARGET_TEAM_B'
};

const WINNING_SCORE = 2000;
const TICK_RATE_MS = 100;
const POINTS_PER_TICK = 5; // Reaches 2000 in ~40 cumulative seconds

let gameState = {
  status: 'IDLE', // 'IDLE', 'PLAYING', 'PAUSED', 'ENDED'
  winner: null,
  teams: {
    teamA: { name: 'Team A (Cyan)', score: 0, isScanning: false },
    teamB: { name: 'Team B (Orange)', score: 0, isScanning: false }
  }
};

// 10Hz scoring engine (independent simultaneous scoring)
setInterval(() => {
  if (gameState.status !== 'PLAYING') return;

  // Both teams can score at the same time
  if (gameState.teams.teamA.isScanning) {
    gameState.teams.teamA.score += POINTS_PER_TICK;
  }
  if (gameState.teams.teamB.isScanning) {
    gameState.teams.teamB.score += POINTS_PER_TICK;
  }

  // Check victory condition (First to 2000)
  const aWins = gameState.teams.teamA.score >= WINNING_SCORE;
  const bWins = gameState.teams.teamB.score >= WINNING_SCORE;

  if (aWins && bWins) {
    gameState.status = 'ENDED';
    gameState.winner = 'Tie';
  } else if (aWins) {
    gameState.status = 'ENDED';
    gameState.winner = 'Team A';
  } else if (bWins) {
    gameState.status = 'ENDED';
    gameState.winner = 'Team B';
  }

  io.emit('stateUpdate', gameState);
}, TICK_RATE_MS);

io.on('connection', (socket) => {
  socket.emit('stateUpdate', gameState);

  // Handle continuous camera detection ping from phone
  socket.on('scanPing', ({ team, detected, codeData }) => {
    if (gameState.teams[team] && gameState.status === 'PLAYING') {
      const isTargetValid = detected && codeData === TARGET_CODES[team];
      gameState.teams[team].isScanning = isTargetValid;
    }
  });

  // Host commands
  socket.on('hostCommand', (action) => {
    if (action === 'START' || action === 'RESUME') {
      if (gameState.status !== 'ENDED') gameState.status = 'PLAYING';
    } else if (action === 'PAUSE') {
      gameState.status = 'PAUSED';
      gameState.teams.teamA.isScanning = false;
      gameState.teams.teamB.isScanning = false;
    } else if (action === 'RESTART') {
      gameState.status = 'PLAYING';
      gameState.winner = null;
      gameState.teams.teamA.score = 0;
      gameState.teams.teamA.isScanning = false;
      gameState.teams.teamB.score = 0;
      gameState.teams.teamB.isScanning = false;
    }
    io.emit('stateUpdate', gameState);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`QR Fight Server running on port ${PORT}`));