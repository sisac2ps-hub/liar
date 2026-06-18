const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Paths
const DATA_DIR = path.join(__dirname, 'server', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const WORDS_PATH = path.join(DATA_DIR, 'words.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

// Memory State
let rooms = {};

// Load / Init Configurations
let wordsData = { topics: [] };
let configData = { adminPassword: 'admin', roomCreationAllowed: false };

function loadData() {
  try {
    if (fs.existsSync(WORDS_PATH)) {
      wordsData = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
    }
    if (fs.existsSync(CONFIG_PATH)) {
      configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config files:', err);
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving config.json:', err);
  }
}

function saveWords() {
  try {
    fs.writeFileSync(WORDS_PATH, JSON.stringify(wordsData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving words.json:', err);
  }
}

loadData();

// Admin REST APIs
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === configData.adminPassword) {
    res.json({ success: true, token: 'secret_admin_token' });
  } else {
    res.status(401).json({ success: false, message: '비밀번호가 일치하지 않습니다.' });
  }
});

app.get('/api/admin/config', (req, res) => {
  res.json({ roomCreationAllowed: configData.roomCreationAllowed });
});

app.post('/api/admin/config', (req, res) => {
  const { roomCreationAllowed, token } = req.body;
  if (token !== 'secret_admin_token') {
    return res.status(403).json({ success: false, message: '권한이 없습니다.' });
  }
  configData.roomCreationAllowed = !!roomCreationAllowed;
  saveConfig();
  res.json({ success: true, roomCreationAllowed: configData.roomCreationAllowed });
});

app.get('/api/admin/words', (req, res) => {
  res.json(wordsData);
});

app.post('/api/admin/words', (req, res) => {
  const { topics, token } = req.body;
  if (token !== 'secret_admin_token') {
    return res.status(403).json({ success: false, message: '권한이 없습니다.' });
  }
  wordsData.topics = topics;
  saveWords();
  res.json({ success: true });
});

// Role Distribution Mapping based on Player Count
function getRoleDistribution(count) {
  if (count < 4) return { liar: 1, citizen: count - 1, citizenKillsDefeat: 2 };
  
  const mappings = {
    4: { liar: 1, citizen: 3, citizenKillsDefeat: 2 },
    5: { liar: 1, citizen: 4, citizenKillsDefeat: 2 },
    6: { liar: 2, citizen: 4, citizenKillsDefeat: 2 },
    7: { liar: 2, citizen: 5, citizenKillsDefeat: 2 },
    8: { liar: 2, citizen: 6, citizenKillsDefeat: 2 },
    9: { liar: 3, citizen: 6, citizenKillsDefeat: 3 },
    10: { liar: 3, citizen: 7, citizenKillsDefeat: 3 },
    11: { liar: 3, citizen: 8, citizenKillsDefeat: 3 }
  };

  if (count >= 12) {
    // Extrapolate for 12-15 players
    const liarCount = count >= 13 ? 4 : 3;
    return { liar: liarCount, citizen: count - liarCount, citizenKillsDefeat: 3 };
  }

  return mappings[count];
}

// Generate unique room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

// Helper: Get active, alive players in a room
function getAlivePlayers(room) {
  return room.players.filter(p => !p.dead && p.active);
}

// Socket.io Real-time Synchronizations
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Check if room creation is allowed
  socket.on('check-creation-status', (callback) => {
    callback({ allowed: configData.roomCreationAllowed });
  });

  // Create Room
  socket.on('create-room', ({ nickname }, callback) => {
    if (!configData.roomCreationAllowed) {
      return callback({ success: false, message: '현재 테스트 진행 중이 아니거나 방 생성이 비활성화되었습니다.' });
    }

    const code = generateRoomCode();
    const newRoom = {
      code,
      hostId: socket.id,
      players: [
        {
          id: socket.id,
          nickname: nickname || '호스트',
          role: '',
          word: '',
          active: true,
          voted: false,
          voteCount: 0,
          dead: false,
          isHost: true
        }
      ],
      settings: {
        appealTime: 30, // seconds
        debateTime: 180, // 3 minutes in seconds
        citizenKillsDefeat: 2, // Default
        liarGuessEnabled: true
      },
      gameState: 'LOBBY',
      topic: '',
      targetWord: '',
      currentTurnIndex: 0,
      appealLogs: [],
      currentSpeakerText: '',
      timerValue: 0,
      citizenDeathCount: 0,
      votes: {}
    };

    rooms[code] = newRoom;
    socket.join(code);
    socket.roomCode = code;
    socket.playerNickname = nickname;

    console.log(`Room created: ${code} by ${nickname}`);
    callback({ success: true, room: newRoom, myId: socket.id });
  });

  // Join Room
  socket.on('join-room', ({ code, nickname }, callback) => {
    const cleanCode = code ? code.trim().toUpperCase() : '';
    const room = rooms[cleanCode];

    if (!room) {
      return callback({ success: false, message: '존재하지 않는 방 번호입니다.' });
    }

    if (room.gameState !== 'LOBBY') {
      return callback({ success: false, message: '이미 게임이 진행 중인 방입니다.' });
    }

    if (room.players.length >= 15) {
      return callback({ success: false, message: '정원 초과입니다. (최대 15명)' });
    }

    // Check duplicate nickname
    const nameExists = room.players.some(p => p.nickname === nickname && p.active);
    if (nameExists) {
      return callback({ success: false, message: '이미 사용 중인 닉네임입니다.' });
    }

    const newPlayer = {
      id: socket.id,
      nickname: nickname || `참가자_${room.players.length + 1}`,
      role: '',
      word: '',
      active: true,
      voted: false,
      voteCount: 0,
      dead: false,
      isHost: false
    };

    room.players.push(newPlayer);
    socket.join(cleanCode);
    socket.roomCode = cleanCode;
    socket.playerNickname = nickname;

    // Recalculate default citizen kills setting based on players count
    const dist = getRoleDistribution(room.players.length);
    room.settings.citizenKillsDefeat = dist.citizenKillsDefeat;

    io.to(cleanCode).emit('room-updated', room);
    console.log(`Player ${nickname} joined room ${cleanCode}`);
    callback({ success: true, room, myId: socket.id });
  });

  // Update Room Settings (Host Only)
  socket.on('update-settings', ({ appealTime, debateTime, citizenKillsDefeat, liarGuessEnabled }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    room.settings.appealTime = parseInt(appealTime) || room.settings.appealTime;
    room.settings.debateTime = parseInt(debateTime) || room.settings.debateTime;
    room.settings.citizenKillsDefeat = parseInt(citizenKillsDefeat) || room.settings.citizenKillsDefeat;
    room.settings.liarGuessEnabled = liarGuessEnabled !== undefined ? liarGuessEnabled : room.settings.liarGuessEnabled;

    io.to(code).emit('room-updated', room);
  });

  // Kick Player (Host Only)
  socket.on('kick-player', ({ playerId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(playerId);
    if (targetSocket) {
      targetSocket.leave(code);
      targetSocket.emit('kicked');
    }

    room.players = room.players.filter(p => p.id !== playerId);
    
    // Auto re-tally settings
    const dist = getRoleDistribution(room.players.length);
    room.settings.citizenKillsDefeat = dist.citizenKillsDefeat;

    io.to(code).emit('room-updated', room);
  });

  // Start Game (Host Only)
  socket.on('start-game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const playerCount = room.players.length;
    if (playerCount < 4) {
      return socket.emit('error-msg', '최소 4명 이상이어야 게임을 시작할 수 있습니다.');
    }

    // 1. Get role distribution
    const { liar: liarCount } = getRoleDistribution(playerCount);

    // 2. Select topic and word
    if (wordsData.topics.length === 0) {
      return socket.emit('error-msg', '선택 가능한 대주제/제시어가 없습니다. 관리자 설정을 확인해 주세요.');
    }

    const randomTopicObj = wordsData.topics[Math.floor(Math.random() * wordsData.topics.length)];
    if (!randomTopicObj.words || randomTopicObj.words.length === 0) {
      return socket.emit('error-msg', '선택된 주제에 등록된 제시어가 없습니다.');
    }

    const randomWord = randomTopicObj.words[Math.floor(Math.random() * randomTopicObj.words.length)];

    room.topic = randomTopicObj.name;
    room.targetWord = randomWord;

    // 3. Shuffle players and assign roles
    let playerIndices = room.players.map((_, i) => i);
    // Shuffle
    for (let i = playerIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIndices[i], playerIndices[j]] = [playerIndices[j], playerIndices[i]];
    }

    // Set all players alive and reset stats
    room.players.forEach(p => {
      p.dead = false;
      p.voted = false;
      p.voteCount = 0;
      p.role = 'CITIZEN';
      p.word = randomWord; // Citizens get the target word
    });

    // Assign Liars
    const liarIndices = playerIndices.slice(0, liarCount);
    liarIndices.forEach(idx => {
      room.players[idx].role = 'LIAR';
      room.players[idx].word = `[대주제: ${randomTopicObj.name}]`; // Liars get the topic name
    });

    room.gameState = 'ROLE_REVEAL';
    room.citizenDeathCount = 0;
    room.appealLogs = [];
    room.currentSpeakerText = '';
    room.votes = {};

    io.to(code).emit('game-started', room);
    console.log(`Game started in room ${code}. Topic: ${room.topic}, Word: ${room.targetWord}`);
  });

  // Start Appeal Phase
  socket.on('start-appeal', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    room.gameState = 'APPEAL';
    room.currentTurnIndex = 0;
    room.appealLogs = [];
    room.currentSpeakerText = '';
    
    startNextSpeakerTurn(room);
  });

  // Live speaker text input sync
  socket.on('speak-text', ({ text }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const currentSpeaker = getAlivePlayers(room)[room.currentTurnIndex];
    if (currentSpeaker && currentSpeaker.id === socket.id) {
      room.currentSpeakerText = text;
      socket.to(code).emit('speaker-text-updated', { text });
    }
  });

  // Finish / Submit Appeal
  socket.on('submit-appeal', ({ text }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const alivePlayers = getAlivePlayers(room);
    const currentSpeaker = alivePlayers[room.currentTurnIndex];
    
    // Only current speaker or host can submit/skip
    if (currentSpeaker && (currentSpeaker.id === socket.id || room.hostId === socket.id)) {
      // Add log
      room.appealLogs.push({
        nickname: currentSpeaker.nickname,
        content: text || room.currentSpeakerText || '발언을 스킵했습니다.'
      });

      // Clear interval
      clearInterval(room.timerInterval);
      room.currentSpeakerText = '';

      room.currentTurnIndex++;
      if (room.currentTurnIndex >= alivePlayers.length) {
        // All players finished speaking -> transition to debate
        room.gameState = 'DEBATE';
        room.timerValue = room.settings.debateTime;
        io.to(code).emit('debate-started', room);
        startDebateTimer(room);
      } else {
        startNextSpeakerTurn(room);
      }
    }
  });

  // Start Debate Phase (Manual bypass or trigger)
  socket.on('start-debate-manual', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    clearInterval(room.timerInterval);
    room.gameState = 'DEBATE';
    room.timerValue = room.settings.debateTime;
    io.to(code).emit('debate-started', room);
    startDebateTimer(room);
  });

  // Skip Debate to Voting (Host Only)
  socket.on('start-voting-manual', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    clearInterval(room.timerInterval);
    triggerVotingPhase(room);
  });

  // Submit Vote
  socket.on('submit-vote', ({ suspectId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const voter = room.players.find(p => p.id === socket.id);
    if (!voter || voter.dead || !voter.active) return;

    room.votes[voter.id] = suspectId;
    voter.voted = true;

    // Re-tally vote counts for everyone
    room.players.forEach(p => p.voteCount = 0);
    Object.values(room.votes).forEach(votedId => {
      const votedPlayer = room.players.find(p => p.id === votedId);
      if (votedPlayer) votedPlayer.voteCount++;
    });

    io.to(code).emit('room-updated', room);

    // Check if everyone has voted
    const alivePlayers = getAlivePlayers(room);
    const voteCount = Object.keys(room.votes).length;

    if (voteCount >= alivePlayers.length) {
      clearInterval(room.timerInterval);
      processVotingResult(room);
    }
  });

  // Admin Force Kill / Suicide (Host Only)
  socket.on('admin-kill-player', ({ playerId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const targetPlayer = room.players.find(p => p.id === playerId);
    if (targetPlayer && !targetPlayer.dead) {
      targetPlayer.dead = true;
      io.to(code).emit('player-killed-msg', { nickname: targetPlayer.nickname });

      // If game is active, check win conditions
      if (room.gameState === 'APPEAL' || room.gameState === 'DEBATE' || room.gameState === 'VOTING') {
        // If it was a citizen, add to death count
        if (targetPlayer.role === 'CITIZEN') {
          room.citizenDeathCount++;
        }
        checkWinConditions(room);
      } else {
        io.to(code).emit('room-updated', room);
      }
    }
  });

  // Submit Liar Word Guess
  socket.on('submit-liar-guess', ({ word }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'LIAR') return;

    const isCorrect = word.trim() === room.targetWord.trim();
    room.gameState = 'RESULT';
    clearInterval(room.timerInterval);

    const resultMsg = isCorrect 
      ? `라이어 [${player.nickname}]가 제시어 [${room.targetWord}]를 맞춰 승리했습니다!`
      : `라이어 [${player.nickname}]가 제시어 맞추기에 실패하여 시민이 승리했습니다! (입력한 단어: ${word})`;

    io.to(code).emit('game-over', {
      winner: isCorrect ? 'LIAR' : 'CITIZEN',
      message: resultMsg,
      room
    });
  });

  // Reset Game
  socket.on('reset-game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    clearInterval(room.timerInterval);
    room.gameState = 'LOBBY';
    room.topic = '';
    room.targetWord = '';
    room.currentSpeakerText = '';
    room.appealLogs = [];
    room.citizenDeathCount = 0;
    room.votes = {};
    room.players.forEach(p => {
      p.role = '';
      p.word = '';
      p.dead = false;
      p.voted = false;
      p.voteCount = 0;
    });

    io.to(code).emit('room-updated', room);
  });

  // Client disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const code = socket.roomCode;
    const room = rooms[code];

    if (room) {
      // Find player
      const playerIdx = room.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        const player = room.players[playerIdx];
        
        // If in lobby, just remove
        if (room.gameState === 'LOBBY') {
          room.players.splice(playerIdx, 1);
          
          // Re-tally default kills
          const dist = getRoleDistribution(room.players.length);
          room.settings.citizenKillsDefeat = dist.citizenKillsDefeat;
        } else {
          // If in game, mark inactive and dead
          player.active = false;
          player.dead = true;
          io.to(code).emit('player-killed-msg', { nickname: `${player.nickname} (접속 종료)` });
          
          if (player.role === 'CITIZEN') {
            room.citizenDeathCount++;
          }
          checkWinConditions(room);
        }
      }

      // Check if room is empty
      const activeCount = room.players.filter(p => p.active).length;
      if (activeCount === 0) {
        clearInterval(room.timerInterval);
        delete rooms[code];
        console.log(`Room ${code} deleted (empty)`);
      } else {
        // If host disconnected, assign new host
        if (room.hostId === socket.id) {
          const firstActive = room.players.find(p => p.active);
          if (firstActive) {
            room.hostId = firstActive.id;
            firstActive.isHost = true;
            console.log(`New host for room ${code}: ${firstActive.nickname}`);
          }
        }
        io.to(code).emit('room-updated', room);
      }
    }
  });
});

// Start Appeal Turn Timer
function startNextSpeakerTurn(room) {
  const alivePlayers = getAlivePlayers(room);
  const currentSpeaker = alivePlayers[room.currentTurnIndex];

  if (!currentSpeaker) return;

  room.timerValue = room.settings.appealTime;
  room.currentSpeakerText = '';
  io.to(room.code).emit('appeal-turn-start', {
    currentTurnIndex: room.currentTurnIndex,
    speakerId: currentSpeaker.id,
    speakerNickname: currentSpeaker.nickname,
    timerValue: room.timerValue
  });

  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    room.timerValue--;
    
    // Play sound notification triggers
    if (room.timerValue === 5) {
      io.to(room.code).emit('timer-tick-sound', { type: 'alert5' });
    }

    if (room.timerValue <= 0) {
      clearInterval(room.timerInterval);
      io.to(room.code).emit('timer-tick-sound', { type: 'timeout' });
      
      // Auto submit and pass turn
      room.appealLogs.push({
        nickname: currentSpeaker.nickname,
        content: room.currentSpeakerText || '시간이 초과되어 발언이 생략되었습니다.'
      });
      room.currentSpeakerText = '';
      
      room.currentTurnIndex++;
      if (room.currentTurnIndex >= alivePlayers.length) {
        room.gameState = 'DEBATE';
        room.timerValue = room.settings.debateTime;
        io.to(room.code).emit('debate-started', room);
        startDebateTimer(room);
      } else {
        startNextSpeakerTurn(room);
      }
    } else {
      io.to(room.code).emit('timer-updated', { value: room.timerValue });
    }
  }, 1000);
}

// Start Debate Timer
function startDebateTimer(room) {
  clearInterval(room.timerInterval);

  room.timerInterval = setInterval(() => {
    room.timerValue--;

    if (room.timerValue === 30) {
      io.to(room.code).emit('timer-tick-sound', { type: 'alert30' });
    }
    if (room.timerValue === 5) {
      io.to(room.code).emit('timer-tick-sound', { type: 'alert5' });
    }

    if (room.timerValue <= 0) {
      clearInterval(room.timerInterval);
      io.to(room.code).emit('timer-tick-sound', { type: 'timeout' });
      triggerVotingPhase(room);
    } else {
      io.to(room.code).emit('timer-updated', { value: room.timerValue });
    }
  }, 1000);
}

// Trigger Voting Phase
function triggerVotingPhase(room) {
  room.gameState = 'VOTING';
  room.votes = {};
  room.players.forEach(p => {
    p.voted = false;
    p.voteCount = 0;
  });
  room.timerValue = 60; // 60 seconds to vote

  io.to(room.code).emit('voting-started', room);

  room.timerInterval = setInterval(() => {
    room.timerValue--;
    if (room.timerValue === 5) {
      io.to(room.code).emit('timer-tick-sound', { type: 'alert5' });
    }

    if (room.timerValue <= 0) {
      clearInterval(room.timerInterval);
      io.to(room.code).emit('timer-tick-sound', { type: 'timeout' });
      processVotingResult(room);
    } else {
      io.to(room.code).emit('timer-updated', { value: room.timerValue });
    }
  }, 1000);
}

// Process Voting Result
function processVotingResult(room) {
  const alivePlayers = getAlivePlayers(room);
  
  // Find player(s) with maximum votes
  let maxVotes = 0;
  let votedOutPlayers = [];

  room.players.forEach(p => {
    if (p.voteCount > maxVotes) {
      maxVotes = p.voteCount;
      votedOutPlayers = [p];
    } else if (p.voteCount === maxVotes && maxVotes > 0) {
      votedOutPlayers.push(p);
    }
  });

  // Reset votes
  room.votes = {};

  if (votedOutPlayers.length === 0 || maxVotes === 0) {
    // No one voted out (e.g. 0 votes cast)
    io.to(room.code).emit('voting-no-result', { message: '투표 결과가 동률이거나 투표를 진행한 인원이 없어 아무도 처형되지 않았습니다.' });
    
    // Resume to debate or lobby depending on death counts
    checkWinConditions(room);
    return;
  }

  if (votedOutPlayers.length > 1) {
    // Tie vote
    const tieNicknames = votedOutPlayers.map(p => p.nickname).join(', ');
    io.to(room.code).emit('voting-no-result', { 
      message: `공동 최다 득표자 [${tieNicknames}]가 발생하여 동률 처리되었습니다. 아무도 처형되지 않았습니다.` 
    });
    checkWinConditions(room);
    return;
  }

  // Exactly 1 player voted out
  const target = votedOutPlayers[0];
  target.dead = true;
  
  const isLiar = target.role === 'LIAR';

  if (!isLiar) {
    room.citizenDeathCount++;
  }

  io.to(room.code).emit('player-voted-out', {
    nickname: target.nickname,
    role: target.role,
    isLiar,
    citizenDeathCount: room.citizenDeathCount,
    room
  });

  // If a Liar is voted out, and guessing is enabled, give the Liar a chance to guess the target word
  if (isLiar && room.settings.liarGuessEnabled) {
    room.gameState = 'LIAR_GUESS';
    room.timerValue = 40; // 40 seconds to guess
    io.to(room.code).emit('liar-guess-phase', {
      liarId: target.id,
      liarNickname: target.nickname,
      room
    });

    room.timerInterval = setInterval(() => {
      room.timerValue--;
      if (room.timerValue <= 0) {
        clearInterval(room.timerInterval);
        // Timeout means Liar fail -> Citizens win
        room.gameState = 'RESULT';
        io.to(room.code).emit('game-over', {
          winner: 'CITIZEN',
          message: `시간 초과! 라이어 [${target.nickname}]가 제시어 맞추기에 실패하여 시민이 승리했습니다!`,
          room
        });
      } else {
        io.to(room.code).emit('timer-updated', { value: room.timerValue });
      }
    }, 1000);
  } else {
    // Just normal check
    checkWinConditions(room);
  }
}

// Check game win conditions
function checkWinConditions(room) {
  const activePlayers = room.players.filter(p => p.active);
  const aliveLiars = activePlayers.filter(p => p.role === 'LIAR' && !p.dead);
  const aliveCitizens = activePlayers.filter(p => p.role === 'CITIZEN' && !p.dead);

  // Condition 1: Citizens reach death limit
  if (room.citizenDeathCount >= room.settings.citizenKillsDefeat) {
    room.gameState = 'RESULT';
    io.to(room.code).emit('game-over', {
      winner: 'LIAR',
      message: `시민 ${room.settings.citizenKillsDefeat}명 사망! 시민 진영이 패배하여 라이어가 승리했습니다!`,
      room
    });
    return;
  }

  // Condition 2: All Liars are dead
  if (aliveLiars.length === 0) {
    room.gameState = 'RESULT';
    io.to(room.code).emit('game-over', {
      winner: 'CITIZEN',
      message: '모든 라이어가 검거되었습니다! 시민 진영이 승리했습니다!',
      room
    });
    return;
  }

  // Condition 3: Liars outnumber citizens or draw (Liar win)
  if (aliveLiars.length >= aliveCitizens.length) {
    room.gameState = 'RESULT';
    io.to(room.code).emit('game-over', {
      winner: 'LIAR',
      message: '라이어 인원수가 생존한 시민 인원수보다 같거나 많아졌습니다! 라이어가 승리했습니다!',
      room
    });
    return;
  }

  // Continue to next round (Return to Appeal Phase)
  room.gameState = 'APPEAL';
  room.currentTurnIndex = 0;
  room.currentSpeakerText = '';
  io.to(room.code).emit('next-round-started', room);
  startNextSpeakerTurn(room);
}

// Serve Frontend client build in Production
const CLIENT_DIST = path.join(__dirname, 'public');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Liar Game Backend is running. Frontend build is not available yet.');
  });
}

// Server Start
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
