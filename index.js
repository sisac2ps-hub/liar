// Hostinger Dynamic Dependency Installer
try {
  require('nodemailer');
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND') {
    console.log('nodemailer not found. Bootstrapping npm install on Hostinger...');
    try {
      require('child_process').execSync('npm install', { cwd: __dirname });
      console.log('Bootstrap npm install completed.');
    } catch (npmErr) {
      console.error('Failed to run bootstrap npm install:', npmErr);
    }
  }
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

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

app.get('/api/debug-path', (req, res) => {
  res.json({
    __dirname,
    cwd: process.cwd(),
    resolvedPublic: path.join(__dirname, 'public')
  });
});

// Paths
const DATA_DIR = path.join(__dirname, 'server', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const WORDS_PATH = path.join(DATA_DIR, 'words.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const ANALYTICS_PATH = path.join(DATA_DIR, 'analytics.json');

// Memory State
let rooms = {};

// Load / Init Configurations
let wordsData = { topics: [] };
let configData = { adminPassword: 'admin', roomCreationAllowed: false };
let analyticsData = {
  views: {
    hub: 0,
    liar: 0,
    spyfall: 0,
    justone: 0,
    ladder: 0,
    roulette: 0,
    draw: 0,
    dict: 0,
    feedback: 0
  }
};

function loadData() {
  try {
    if (fs.existsSync(WORDS_PATH)) {
      wordsData = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
    }
    if (fs.existsSync(CONFIG_PATH)) {
      configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
    if (fs.existsSync(ANALYTICS_PATH)) {
      analyticsData = JSON.parse(fs.readFileSync(ANALYTICS_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config files:', err);
  }
}

function saveAnalytics() {
  try {
    fs.writeFileSync(ANALYTICS_PATH, JSON.stringify(analyticsData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving analytics.json:', err);
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

app.post('/api/analytics/view', (req, res) => {
  const { gameKey } = req.body;
  if (gameKey && analyticsData.views.hasOwnProperty(gameKey)) {
    analyticsData.views[gameKey]++;
    saveAnalytics();
    res.json({ success: true, views: analyticsData.views });
  } else {
    res.status(400).json({ success: false, message: 'Invalid gameKey' });
  }
});

app.post('/api/admin/analytics', (req, res) => {
  const { token } = req.body;
  if (token !== 'secret_admin_token') {
    return res.status(403).json({ success: false, message: '권한이 없습니다.' });
  }
  res.json({ success: true, analytics: analyticsData });
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

// Feedback REST APIs
app.post('/api/feedback', (req, res) => {
  const { nickname, content } = req.body;
  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, message: '내용을 입력해 주세요.' });
  }

  const feedbackPath = path.join(DATA_DIR, 'feedback.json');
  let feedbackList = [];
  if (fs.existsSync(feedbackPath)) {
    try {
      feedbackList = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing feedback.json:', e);
    }
  }

  const newFeedback = {
    id: Date.now().toString(),
    nickname: nickname?.trim() || '익명',
    content: content.trim(),
    createdAt: new Date().toISOString()
  };

  feedbackList.push(newFeedback);

  try {
    fs.writeFileSync(feedbackPath, JSON.stringify(feedbackList, null, 2), 'utf8');

    // 이메일 알림 전송 (비동기 처리)
    if (process.env.EMAIL_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.naver.com',
        port: parseInt(process.env.EMAIL_PORT || '465'),
        secure: true,
        auth: {
          user: process.env.EMAIL_USER || 'ldo9595@naver.com',
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: process.env.EMAIL_USER || 'ldo9595@naver.com',
        to: 'ldo9595@naver.com',
        subject: `[파티게임허브] 새로운 피드백 접수 (${newFeedback.nickname})`,
        text: `닉네임: ${newFeedback.nickname}\n내용: ${newFeedback.content}\n접수 시간: ${new Date(newFeedback.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Email send error:', error);
        } else {
          console.log('Email sent successfully:', info.response);
        }
      });
    } else {
      console.log('Email notify skipped: EMAIL_PASS environment variable not configured.');
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Error saving feedback:', e);
    res.status(500).json({ success: false, message: '저장에 실패했습니다.' });
  }
});

app.post('/api/admin/feedback', (req, res) => {
  const { token } = req.body;
  if (token !== 'secret_admin_token') {
    return res.status(403).json({ success: false, message: '권한이 없습니다.' });
  }

  const feedbackPath = path.join(DATA_DIR, 'feedback.json');
  let feedbackList = [];
  if (fs.existsSync(feedbackPath)) {
    try {
      feedbackList = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
    } catch (e) {
      console.error('Error parsing feedback.json:', e);
    }
  }

  res.json({ success: true, feedback: feedbackList });
});

app.post('/api/admin/feedback/delete', (req, res) => {
  const { token, id } = req.body;
  if (token !== 'secret_admin_token') {
    return res.status(403).json({ success: false, message: '권한이 없습니다.' });
  }

  const feedbackPath = path.join(DATA_DIR, 'feedback.json');
  if (fs.existsSync(feedbackPath)) {
    try {
      let feedbackList = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      feedbackList = feedbackList.filter(f => f.id !== id);
      fs.writeFileSync(feedbackPath, JSON.stringify(feedbackList, null, 2), 'utf8');
      res.json({ success: true });
    } catch (e) {
      console.error('Error deleting feedback:', e);
      res.status(500).json({ success: false, message: '삭제에 실패했습니다.' });
    }
  } else {
    res.json({ success: true });
  }
});


const spyfallLocations = [
  { name: '우주 정거장' },
  { name: '잠수함' },
  { name: '군부대' },
  { name: '은행' },
  { name: '학교' },
  { name: '영화 촬영장' },
  { name: '유람선' },
  { name: '비행기' },
  { name: '병원' },
  { name: '놀이공원' },
  { name: '해적선' },
  { name: '기차역' },
  { name: '경찰서' },
  { name: '호텔' },
  { name: '박물관' }
];

const spyfallLocationsEN = [
  { name: 'Space Station' },
  { name: 'Submarine' },
  { name: 'Military Base' },
  { name: 'Bank' },
  { name: 'School' },
  { name: 'Movie Studio' },
  { name: 'Cruise Ship' },
  { name: 'Airplane' },
  { name: 'Hospital' },
  { name: 'Amusement Park' },
  { name: 'Pirate Ship' },
  { name: 'Train Station' },
  { name: 'Police Station' },
  { name: 'Hotel' },
  { name: 'Museum' }
];

const englishWordsData = {
  topics: [
    {
      id: "1",
      name: "Food",
      words: ["Pizza", "Chicken", "Hamburger", "Sushi", "Steak", "Ramen", "Pasta", "Hotdog", "Salad", "Taco", "Sandwich", "Waffle"]
    },
    {
      id: "2",
      name: "Job",
      words: ["Doctor", "Police Officer", "Firefighter", "Teacher", "Chef", "Lawyer", "Singer", "Athlete", "Soldier", "Pilot", "Hairdresser", "Designer"]
    },
    {
      id: "3",
      name: "Animal",
      words: ["Lion", "Tiger", "Elephant", "Rabbit", "Dog", "Cat", "Panda", "Giraffe", "Penguin", "Eagle", "Monkey", "Dolphin"]
    },
    {
      id: "4",
      name: "Place",
      words: ["School", "Hospital", "Bank", "Park", "Police Station", "Library", "Airport", "Movie Theater", "Department Store", "Amusement Park", "Cafe", "Gym"]
    },
    {
      id: "5",
      name: "Home Appliances",
      words: ["Refrigerator", "Washing Machine", "Television", "Air Conditioner", "Microwave", "Vacuum Cleaner", "Computer", "Humidifier", "Hairdryer", "Fan"]
    },
    {
      id: "6",
      name: "Sports",
      words: ["Soccer", "Baseball", "Basketball", "Volleyball", "Tennis", "Swimming", "Golf", "Bowling", "Table Tennis", "Badminton", "Dodgeball", "Running"]
    },
    {
      id: "7",
      name: "Fruit",
      words: ["Apple", "Banana", "Watermelon", "Strawberry", "Grape", "Orange", "Peach", "Mango", "Pineapple", "Melon", "Lemon", "Tomato"]
    },
    {
      id: "8",
      name: "Stationery",
      words: ["Pencil", "Eraser", "Ballpoint Pen", "Notebook", "Scissors", "Glue", "Ruler", "Pencil Case", "Crayon", "Compass", "Calculator", "Tape"]
    }
  ]
};

const CHOSUNG_LIST = [
  'ㄱㄴ', 'ㄱㄷ', 'ㄱㄹ', 'ㄱㅁ', 'ㄱㅂ', 'ㄱㅅ', 'ㄱㅇ', 'ㄱㅈ', 'ㄱㅊ', 'ㄱㅌ', 'ㄱㅍ', 'ㄱㅎ',
  'ㄴㄷ', 'ㄴㄹ', 'ㄴㅁ', 'ㄴㅂ', 'ㄴㅅ', 'ㄴㅇ', 'ㄴㅈ', 'ㄴㅊ', 'ㄴㅌ', 'ㄴㅎ',
  'ㄷㄹ', 'ㄷㅁ', 'ㄷㅂ', 'ㄷㅅ', 'ㄷㅇ', 'ㄷㅈ', 'ㄷㅊ', 'ㄷㅌ', 'ㄷㅍ', 'ㄷㅎ',
  'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅇ', 'ㄹㅈ', 'ㄹㅊ', 'ㄹㅎ',
  'ㅁㅂ', 'ㅁㅅ', 'ㅁㅇ', 'ㅁㅈ', 'ㅁㅊ', 'ㅁㅎ',
  'ㅂㅅ', 'ㅂㅇ', 'ㅂㅈ', 'ㅂㅊ', 'ㅂㅌ', 'ㅂㅍ', 'ㅂㅎ',
  'ㅅㅇ', 'ㅅㅈ', 'ㅅㅊ', 'ㅅㅌ', 'ㅅㅍ', 'ㅅㅎ',
  'ㅇㅈ', 'ㅇㅊ', 'ㅇㅋ', 'ㅇㅌ', 'ㅇㅍ', 'ㅇㅎ',
  'ㅈㅊ', 'ㅈㅎ', 'ㅊㅎ', 'ㅍㅎ'
];

const ENGLISH_PREFIX_LIST = [
  'TH', 'CH', 'SH', 'TR', 'SP', 'ST', 'FL', 'GR', 'PL', 'CO',
  'RE', 'DE', 'PR', 'IN', 'MA', 'PA', 'UN', 'LA', 'SI', 'BA'
];

function getChosung(str) {
  const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 44032;
    if (code > -1 && code < 11172) {
      const choIndex = Math.floor(code / 588);
      result += cho[choIndex];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

const PROMPTS_KO = [
  '안경 쓴 사람 접어',
  '여기서 내가 제일 나이 많다 접어',
  '최근에 배달 음식 시켜 먹은 사람 접어',
  '아이폰 쓰고 있는 사람 접어',
  '이번 주말에 약속 없는 사람 접어',
  '태어나서 염색 한 번도 안 해본 사람 접어',
  '현재 지갑에 현금 있는 사람 접어',
  '최근 1년 안에 해외여행 다녀온 사람 접어',
  '오늘 아침을 먹은 사람 접어',
  '연하보다 연상을 더 좋아하는 사람 접어',
  '노래방 애창곡이 3개 이상인 사람 접어',
  '오늘 카톡 10개 이상 보낸 사람 접어',
  '현재 양말 안 신고 맨발인 사람 접어',
  '어제 12시(자정) 넘어서 잔 사람 접어',
  '유튜브 프리미엄 구독 중인 사람 접어',
  '가장 최근에 머리 자른 사람 접어',
  '혈액형이 A형인 사람 접어',
  '민초파(민트초코 좋아하는 사람) 접어',
  '반려동물(개, 고양이 등) 키우는 사람 접어',
  '이 방에서 내가 제일 키가 크다 접어',
  '이름에 "ㅇ"이 들어가는 사람 접어',
  '지금 배가 조금이라도 고픈 사람 접어',
  '최근 3일 이내에 운동한 사람 접어',
  '커피 하루에 2잔 이상 마시는 사람 접어'
];

const PROMPTS_EN = [
  'Fold a finger if you are wearing glasses.',
  'Fold a finger if you are the oldest person here.',
  'Fold a finger if you ordered delivery food today or yesterday.',
  'Fold a finger if you are using an iPhone.',
  'Fold a finger if you don\'t have plans this weekend.',
  'Fold a finger if you have never dyed your hair.',
  'Fold a finger if you have cash in your wallet right now.',
  'Fold a finger if you traveled abroad in the last 12 months.',
  'Fold a finger if you ate breakfast this morning.',
  'Fold a finger if you prefer older partners over younger ones.',
  'Fold a finger if you have more than 3 go-to karaoke songs.',
  'Fold a finger if you sent more than 10 text messages today.',
  'Fold a finger if you are currently barefoot (no socks).',
  'Fold a finger if you went to sleep after midnight last night.',
  'Fold a finger if you subscribe to YouTube Premium.',
  'Fold a finger if you got a haircut recently.',
  'Fold a finger if your blood type is A.',
  'Fold a finger if you love Mint Chocolate.',
  'Fold a finger if you have a pet (dog, cat, etc.).',
  'Fold a finger if you are the tallest person in this room.',
  'Fold a finger if your name starts with the letter "J", "S", or "M".',
  'Fold a finger if you are hungry right now.',
  'Fold a finger if you worked out in the last 3 days.',
  'Fold a finger if you drink more than 2 cups of coffee a day.'
];

function startGameBaskin(room) {
  room.topic = room.lang === 'EN' ? 'Baskin Robbins 31' : '베스킨라빈스 31';
  room.targetWord = '31';
  
  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'PLAYER';
    p.word = '';
  });

  room.gameState = 'BASKIN_PLAY';
  room.currentCount = 0;
  room.currentTurnIndex = 0;
  room.baskinLogs = [];
  room.loserId = null;

  io.to(room.code).emit('game-started', room);
}

function startConsonantTimer(room) {
  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    if (!rooms[room.code]) {
      clearInterval(room.timerInterval);
      return;
    }
    
    room.timerValue--;
    if (room.timerValue <= 0) {
      clearInterval(room.timerInterval);
      
      // Eliminate current speaker
      const remainingAlive = room.players.filter(p => !room.eliminatedPlayers.includes(p.id));
      const currentSpeaker = remainingAlive[room.currentTurnIndex];
      if (currentSpeaker) {
        room.eliminatedPlayers.push(currentSpeaker.id);
      }

      // Check remaining alive players
      const nextRemainingAlive = room.players.filter(p => !room.eliminatedPlayers.includes(p.id));
      if (nextRemainingAlive.length <= 1) {
        room.gameState = 'RESULT';
        room.loserId = currentSpeaker ? currentSpeaker.id : null;
        
        const winner = nextRemainingAlive[0];
        const resultMsg = room.lang === 'EN'
          ? `Game Over! ${winner ? `Winner is [${winner.nickname}]!` : 'No winners!'}`
          : `게임 종료! ${winner ? `최종 우승자는 [${winner.nickname}]님입니다!` : '생존자가 없습니다!'}`;

        io.to(room.code).emit('game-over', {
          winner: 'OTHER_PLAYERS',
          message: resultMsg,
          room
        });
      } else {
        // Move turn index
        room.currentTurnIndex = room.currentTurnIndex % nextRemainingAlive.length;
        room.timerValue = 15;
        io.to(room.code).emit('room-updated', room);
        startConsonantTimer(room);
      }
    } else {
      io.to(room.code).emit('timer-tick', { value: room.timerValue });
    }
  }, 1000);
}

function startGameConsonant(room) {
  const isEn = room.lang === 'EN';
  const list = isEn ? ENGLISH_PREFIX_LIST : CHOSUNG_LIST;
  const randPrefix = list[Math.floor(Math.random() * list.length)];

  room.topic = isEn ? 'Initial Consonants' : '초성 게임';
  room.targetWord = randPrefix;
  room.consonants = randPrefix;
  
  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'PLAYER';
    p.word = '';
  });

  room.gameState = 'CONSONANT_PLAY';
  room.currentTurnIndex = 0;
  room.usedWords = [];
  room.eliminatedPlayers = [];
  room.timerValue = 15;
  room.loserId = null;

  io.to(room.code).emit('game-started', room);
  
  startConsonantTimer(room);
}

function startGameDeath(room) {
  room.topic = room.lang === 'EN' ? 'The Game of Death' : '더 게임 오브 데스';
  room.targetWord = '';

  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'PLAYER';
    p.word = '';
  });

  room.gameState = 'DEATH_TARGETING';
  room.deathTargets = {};
  room.deathSelectedCount = 0;
  room.deathPath = [];
  room.loserId = null;

  io.to(room.code).emit('game-started', room);
}

function startGameFingers(room) {
  room.topic = room.lang === 'EN' ? '5 Fingers Game' : '손병호 게임';
  
  const promptList = room.lang === 'EN' ? PROMPTS_EN : PROMPTS_KO;
  const randPrompt = promptList[Math.floor(Math.random() * promptList.length)];
  room.targetWord = randPrompt;
  room.currentCard = randPrompt;

  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'PLAYER';
    p.word = '';
  });

  room.gameState = 'FINGERS_PLAY';
  room.fingerCounts = {};
  room.players.forEach(p => {
    room.fingerCounts[p.id] = 5;
  });
  room.loserId = null;

  io.to(room.code).emit('game-started', room);
}

function startGameSpyfall(room) {
  const locationsList = room.lang === 'EN' ? spyfallLocationsEN : spyfallLocations;
  const randomLoc = locationsList[Math.floor(Math.random() * locationsList.length)];
  room.topic = room.lang === 'EN' ? 'Spyfall' : '장소 마피아';
  room.targetWord = randomLoc.name;

  let playerIndices = room.players.map((_, i) => i);
  // Shuffle
  for (let i = playerIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIndices[i], playerIndices[j]] = [playerIndices[j], playerIndices[i]];
  }

  // Assign roles: 1 Spy, rest Citizens
  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'CITIZEN';
    p.word = randomLoc.name;
  });

  // 1 Spy
  const spyIdx = playerIndices[0];
  room.players[spyIdx].role = 'SPY';
  room.players[spyIdx].word = '???';

  room.gameState = 'ROLE_REVEAL';
  room.citizenDeathCount = 0;
  room.appealLogs = [];
  room.currentSpeakerText = '';
  room.votes = {};

  io.to(room.code).emit('game-started', room);
  console.log(`Spyfall started in room ${room.code}. Location: ${room.targetWord}`);
}

function startGameJustOne(room) {
  const activeWordsData = room.lang === 'EN' ? englishWordsData : wordsData;
  if (activeWordsData.topics.length === 0) {
    return io.to(room.code).emit('error-msg', room.lang === 'EN' ? 'No topics registered in database.' : '선택 가능한 주제어가 없습니다.');
  }

  const randomTopicObj = activeWordsData.topics[Math.floor(Math.random() * activeWordsData.topics.length)];
  const randomWord = randomTopicObj.words[Math.floor(Math.random() * randomTopicObj.words.length)];

  room.topic = randomTopicObj.name;
  room.targetWord = randomWord;

  // Select 1 Guesser randomly
  const guesserIdx = Math.floor(Math.random() * room.players.length);
  room.players.forEach((p, idx) => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = idx === guesserIdx ? 'GUESSER' : 'CLUE_GIVER';
    p.word = idx === guesserIdx ? '???' : randomWord;
  });

  room.gameState = 'ROLE_REVEAL';
  room.appealLogs = []; // We will store hints here
  room.votes = {}; // Will store player ID -> hint text
  room.timerValue = 0;

  io.to(room.code).emit('game-started', room);
  console.log(`Just One started in room ${room.code}. Word: ${room.targetWord}`);
}

function startGameLiar(room) {
  const playerCount = room.players.length;
  const { liar: liarCount } = getRoleDistribution(playerCount);

  const activeWordsData = room.lang === 'EN' ? englishWordsData : wordsData;
  if (activeWordsData.topics.length === 0) {
    return io.to(room.code).emit('error-msg', room.lang === 'EN' ? 'No topics registered in database.' : '선택 가능한 대주제/제시어가 없습니다.');
  }

  const randomTopicObj = activeWordsData.topics[Math.floor(Math.random() * activeWordsData.topics.length)];
  const randomWord = randomTopicObj.words[Math.floor(Math.random() * randomTopicObj.words.length)];

  room.topic = randomTopicObj.name;
  room.targetWord = randomWord;

  let playerIndices = room.players.map((_, i) => i);
  // Shuffle
  for (let i = playerIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIndices[i], playerIndices[j]] = [playerIndices[j], playerIndices[i]];
  }

  room.players.forEach(p => {
    p.dead = false;
    p.voted = false;
    p.voteCount = 0;
    p.role = 'CITIZEN';
    p.word = randomWord;
  });

  const liarIndices = playerIndices.slice(0, liarCount);
  liarIndices.forEach(idx => {
    room.players[idx].role = 'LIAR';
    room.players[idx].word = room.lang === 'EN' ? `[Category: ${randomTopicObj.name}]` : `[대주제: ${randomTopicObj.name}]`;
  });

  room.gameState = 'ROLE_REVEAL';
  room.citizenDeathCount = 0;
  room.appealLogs = [];
  room.currentSpeakerText = '';
  room.votes = {};

  io.to(room.code).emit('game-started', room);
  console.log(`Liar Game started in room ${room.code}. Topic: ${room.topic}, Word: ${room.targetWord}`);
}


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
  socket.on('create-room', ({ nickname, gameMode, lang }, callback) => {
    const isEn = lang === 'EN';
    if (!configData.roomCreationAllowed) {
      return callback({ 
        success: false, 
        message: isEn 
          ? 'Room creation is currently restricted by the administrator.' 
          : '현재 테스트 진행 중이 아니거나 방 생성이 비활성화되었습니다.' 
      });
    }

    const initialMode = ['LIAR', 'SPYFALL', 'JUST_ONE'].includes(gameMode) ? gameMode : 'LIAR';
    const roomLang = isEn ? 'EN' : 'KO';
    const code = generateRoomCode();
    
    const newRoom = {
      code,
      hostId: socket.id,
      lang: roomLang,
      players: [
        {
          id: socket.id,
          nickname: nickname || (isEn ? 'Host' : '호스트'),
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
      gameMode: initialMode,
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

  // Change Game Mode (Host Only)
  socket.on('change-game-mode', ({ gameMode }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (['LIAR', 'SPYFALL', 'JUST_ONE', 'BASKIN', 'CONSONANT', 'DEATH', 'FINGERS'].includes(gameMode)) {
      room.gameMode = gameMode;
      
      // Auto re-tally default kills for Liar or Spyfall
      const dist = getRoleDistribution(room.players.length);
      room.settings.citizenKillsDefeat = dist.citizenKillsDefeat;

      io.to(code).emit('room-updated', room);
      console.log(`Room ${code} changed gameMode to ${gameMode}`);
    }
  });

  // Start Game (Host Only)
  socket.on('start-game', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.hostId !== socket.id) return;

    const playerCount = room.players.length;
    
    // Check playerCount limits
    if (room.gameMode === 'SPYFALL') {
      if (playerCount < 3) {
        return socket.emit('error-msg', '장소 마피아는 최소 3명 이상이어야 시작할 수 있습니다.');
      }
      startGameSpyfall(room);
    } else if (room.gameMode === 'JUST_ONE') {
      if (playerCount < 3) {
        return socket.emit('error-msg', '텔레파시 한 단어는 최소 3명 이상이어야 시작할 수 있습니다.');
      }
      startGameJustOne(room);
    } else if (room.gameMode === 'BASKIN') {
      if (playerCount < 2) {
        return socket.emit('error-msg', '베스킨라빈스 31은 최소 2명 이상이어야 시작할 수 있습니다.');
      }
      startGameBaskin(room);
    } else if (room.gameMode === 'CONSONANT') {
      if (playerCount < 2) {
        return socket.emit('error-msg', '초성 게임은 최소 2명 이상이어야 시작할 수 있습니다.');
      }
      startGameConsonant(room);
    } else if (room.gameMode === 'DEATH') {
      if (playerCount < 3) {
        return socket.emit('error-msg', '더 게임 오브 데스는 최소 3명 이상이어야 시작할 수 있습니다.');
      }
      startGameDeath(room);
    } else if (room.gameMode === 'FINGERS') {
      if (playerCount < 2) {
        return socket.emit('error-msg', '손병호 게임은 최소 2명 이상이어야 시작할 수 있습니다.');
      }
      startGameFingers(room);
    } else {
      // Default: LIAR Game
      if (playerCount < 4) {
        return socket.emit('error-msg', '라이어 게임은 최소 4명 이상이어야 시작할 수 있습니다.');
      }
      startGameLiar(room);
    }
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
    room.votes = {};
    room.players.forEach(p => p.voted = false);
    
    if (room.gameMode === 'JUST_ONE') {
      io.to(code).emit('room-updated', room);
    } else {
      startNextSpeakerTurn(room);
    }
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

    const resultMsg = room.lang === 'EN'
      ? (isCorrect 
        ? `Liar [${player.nickname}] correctly guessed the secret word [${room.targetWord}] and won!`
        : `Liar [${player.nickname}] failed to guess the secret word. Citizens won! (Guessed: ${word})`)
      : (isCorrect 
        ? `라이어 [${player.nickname}]가 제시어 [${room.targetWord}]를 맞춰 승리했습니다!`
        : `라이어 [${player.nickname}]가 제시어 맞추기에 실패하여 시민이 승리했습니다! (입력한 단어: ${word})`);

    io.to(code).emit('game-over', {
      winner: isCorrect ? 'LIAR' : 'CITIZEN',
      message: resultMsg,
      room
    });
  });

  // Submit Spy Location Guess (from SPY_GUESS phase)
  socket.on('submit-spy-guess', ({ locationName }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameMode !== 'SPYFALL') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'SPY') return;

    const isCorrect = locationName.trim() === room.targetWord.trim();
    room.gameState = 'RESULT';
    clearInterval(room.timerInterval);

    const resultMsg = room.lang === 'EN'
      ? (isCorrect
        ? `Spy [${player.nickname}] correctly guessed the location [${room.targetWord}] and won!`
        : `Spy [${player.nickname}] failed to guess the location. Citizens won! (Guessed: ${locationName})`)
      : (isCorrect
        ? `스파이 [${player.nickname}]가 장소 [${room.targetWord}]를 맞춰 승리했습니다!`
        : `스파이 [${player.nickname}]가 장소 맞추기에 실패하여 시민이 승리했습니다! (입력한 장소: ${locationName})`);

    io.to(code).emit('game-over', {
      winner: isCorrect ? 'SPY' : 'CITIZEN',
      message: resultMsg,
      room
    });
  });

  // Reveal Spy and Guess (Spy can reveal themselves during the game to win instantly or lose)
  socket.on('reveal-spy-and-guess', ({ locationName }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameMode !== 'SPYFALL') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'SPY' || player.dead) return;

    const isCorrect = locationName.trim() === room.targetWord.trim();
    room.gameState = 'RESULT';
    clearInterval(room.timerInterval);

    const resultMsg = room.lang === 'EN'
      ? (isCorrect
        ? `Spy [${player.nickname}] revealed themselves, correctly guessed the location [${room.targetWord}] and won!`
        : `Spy [${player.nickname}] revealed themselves but guessed the wrong location. Citizens won! (Guessed: ${locationName})`)
      : (isCorrect
        ? `스파이 [${player.nickname}]가 자수하여 장소 [${room.targetWord}]를 정확히 맞추고 승리했습니다!`
        : `스파이 [${player.nickname}]가 자수하여 장소를 불렀으나 틀렸습니다! 시민 승리! (입력한 장소: ${locationName})`);

    io.to(code).emit('game-over', {
      winner: isCorrect ? 'SPY' : 'CITIZEN',
      message: resultMsg,
      room
    });
  });

  // Submit Clue (Just One - Clue Givers)
  socket.on('submit-clue', ({ clue }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameMode !== 'JUST_ONE') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'CLUE_GIVER') return;

    room.votes[socket.id] = clue.trim();
    player.voted = true;

    io.to(code).emit('room-updated', room);

    // Check if all active clue givers submitted their clues
    const activeClueGivers = room.players.filter(p => p.active && p.role === 'CLUE_GIVER');
    const submittedCount = Object.keys(room.votes).length;

    if (submittedCount >= activeClueGivers.length) {
      processClues(room);
    }
  });

  // Submit Guesser Guess (Just One - Guesser)
  socket.on('submit-guesser-guess', ({ guess }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameMode !== 'JUST_ONE') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.role !== 'GUESSER') return;

    clearInterval(room.timerInterval);
    
    // Case-insensitive, whitespace-trimmed check
    const cleanGuess = guess.trim().toLowerCase().replace(/\s+/g, '');
    const cleanTarget = room.targetWord.trim().toLowerCase().replace(/\s+/g, '');
    
    const isCorrect = cleanGuess === cleanTarget;
    room.gameState = 'RESULT';

    const resultMsg = room.lang === 'EN'
      ? (isCorrect
        ? `Congratulations! Guesser [${player.nickname}] correctly guessed the secret word [${room.targetWord}]!`
        : `Too bad! Guesser [${player.nickname}] guessed the wrong word. The correct answer was [${room.targetWord}]! (Guessed: ${guess})`)
      : (isCorrect
        ? `축하합니다! 출제자 [${player.nickname}]님이 제시어 [${room.targetWord}]를 정확히 맞췄습니다!`
        : `아쉽습니다! 출제자 [${player.nickname}]님이 제시어를 틀렸습니다. 정답은 [${room.targetWord}]였습니다! (입력한 단어: ${guess})`);

    io.to(code).emit('game-over', {
      winner: isCorrect ? 'GUESSER' : 'CLUE_GIVER',
      message: resultMsg,
      room
    });
  });

  // BASKIN ROBBINS 31 Socket Handlers
  socket.on('baskin-play', ({ count }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'BASKIN_PLAY') return;

    const alivePlayers = room.players.filter(p => p.active && !p.dead);
    const currentPlayer = alivePlayers[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const numCall = parseInt(count);
    if (isNaN(numCall) || numCall < 1 || numCall > 3) return;

    const startNum = room.currentCount + 1;
    const endNum = Math.min(room.currentCount + numCall, 31);
    
    const calledNums = [];
    for (let i = startNum; i <= endNum; i++) {
      calledNums.push(i);
    }

    room.currentCount = endNum;
    room.baskinLogs.push({
      caller: currentPlayer.nickname,
      calledNums
    });

    if (endNum === 31) {
      // Current player loses
      room.gameState = 'RESULT';
      room.loserId = currentPlayer.id;
      
      const resultMsg = room.lang === 'EN'
        ? `[${currentPlayer.nickname}] called 31 and lost the Baskin Robbins game!`
        : `[${currentPlayer.nickname}]님이 31을 외쳐 베스킨라빈스 31 게임에서 패배하셨습니다!`;

      io.to(code).emit('game-over', {
        winner: 'OTHER_PLAYERS',
        message: resultMsg,
        room
      });
    } else {
      room.currentTurnIndex = (room.currentTurnIndex + 1) % alivePlayers.length;
      io.to(code).emit('room-updated', room);
    }
  });

  // CONSONANT GAME Socket Handlers
  socket.on('consonant-submit-word', ({ word }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'CONSONANT_PLAY') return;

    const remainingAlive = room.players.filter(p => !room.eliminatedPlayers.includes(p.id));
    const currentPlayer = remainingAlive[room.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== socket.id) return;

    const trimmed = word.trim();
    if (!trimmed) return;

    // Check duplicate
    if (room.usedWords.includes(trimmed)) {
      return socket.emit('error-msg', room.lang === 'EN' ? 'Word already used!' : '이미 입력한 단어입니다!');
    }

    // Check consonants
    if (room.lang !== 'EN') {
      const chosungInput = getChosung(trimmed);
      if (chosungInput !== room.consonants) {
        return socket.emit('error-msg', room.lang === 'EN' ? 'Prefix letters do not match!' : '초성이 일치하지 않습니다!');
      }
    } else {
      const cleanInput = trimmed.toUpperCase();
      const cleanPrefix = room.consonants.toUpperCase();
      if (!cleanInput.startsWith(cleanPrefix)) {
        return socket.emit('error-msg', `Word must start with ${cleanPrefix}!`);
      }
    }

    // Valid word!
    room.usedWords.push(trimmed);
    clearInterval(room.timerInterval);

    // Advance turn
    room.currentTurnIndex = (room.currentTurnIndex + 1) % remainingAlive.length;
    room.timerValue = 15;
    
    io.to(code).emit('room-updated', room);
    startConsonantTimer(room);
  });

  // DEATH GAME Socket Handlers
  socket.on('death-select-target', ({ targetId }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'DEATH_TARGETING') return;

    room.deathTargets[socket.id] = targetId;
    io.to(code).emit('room-updated', room);
  });

  socket.on('death-start-trace', ({ count }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'DEATH_TARGETING') return;
    if (room.hostId !== socket.id) return;

    // Ensure all players have targeted someone
    const allPlayersIds = room.players.map(p => p.id);
    for (const pid of allPlayersIds) {
      if (!room.deathTargets[pid]) {
        return socket.emit('error-msg', room.lang === 'EN' ? 'All players must select a target first!' : '모든 플레이어가 대상을 지목해야 시작할 수 있습니다.');
      }
    }

    const numCount = parseInt(count);
    if (isNaN(numCount) || numCount < 3 || numCount > 40) return;

    room.deathSelectedCount = numCount;
    
    // Trace the path starting from host's target
    let path = [];
    let current = socket.id; // Start from host
    for (let i = 0; i < numCount; i++) {
      const target = room.deathTargets[current];
      if (!target) break;
      path.push(target);
      current = target;
    }

    const finalLoserId = path[path.length - 1];
    const finalLoser = room.players.find(p => p.id === finalLoserId);

    room.gameState = 'RESULT';
    room.deathPath = path;
    room.loserId = finalLoserId;

    const resultMsg = room.lang === 'EN'
      ? `☠️ The final penalty target is [${finalLoser ? finalLoser.nickname : 'Unknown'}] after tracing ${numCount} steps! ☠️`
      : `☠️ ${numCount}번 선을 따라가 지목된 최종 벌칙자는 [${finalLoser ? finalLoser.nickname : '알 수 없음'}]님입니다! ☠️`;

    io.to(code).emit('game-over', {
      winner: 'OTHER_PLAYERS',
      message: resultMsg,
      room
    });
  });

  // FINGERS GAME Socket Handlers
  socket.on('fingers-fold', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'FINGERS_PLAY') return;

    if (room.fingerCounts[socket.id] > 0) {
      room.fingerCounts[socket.id]--;
    }

    // Check if player has 0 fingers remaining (loser)
    if (room.fingerCounts[socket.id] === 0) {
      room.gameState = 'RESULT';
      room.loserId = socket.id;

      const player = room.players.find(p => p.id === socket.id);
      const resultMsg = room.lang === 'EN'
        ? `✋ [${player ? player.nickname : 'Unknown'}] folded all 5 fingers and lost the game! ✋`
        : `✋ [${player ? player.nickname : '알 수 없음'}]님이 모든 손가락이 접혀 최종 패배하셨습니다! ✋`;

      io.to(code).emit('game-over', {
        winner: 'OTHER_PLAYERS',
        message: resultMsg,
        room
      });
    } else {
      io.to(code).emit('room-updated', room);
    }
  });

  socket.on('fingers-unfold', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'FINGERS_PLAY') return;

    if (room.fingerCounts[socket.id] < 5) {
      room.fingerCounts[socket.id]++;
    }
    io.to(code).emit('room-updated', room);
  });

  socket.on('fingers-next-card', () => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || room.gameState !== 'FINGERS_PLAY') return;
    if (room.hostId !== socket.id) return;

    const promptList = room.lang === 'EN' ? PROMPTS_EN : PROMPTS_KO;
    const randPrompt = promptList[Math.floor(Math.random() * promptList.length)];
    room.targetWord = randPrompt;
    room.currentCard = randPrompt;

    io.to(code).emit('room-updated', room);
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
    
    // Clear new games variables
    room.currentCount = 0;
    room.baskinLogs = [];
    room.consonants = '';
    room.usedWords = [];
    room.eliminatedPlayers = [];
    room.deathTargets = {};
    room.deathSelectedCount = 0;
    room.deathPath = [];
    room.fingerCounts = {};
    room.currentCard = '';
    room.loserId = null;

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
    const msg = room.lang === 'EN'
      ? 'Nobody was executed due to a tie or no votes.'
      : '투표 결과가 동률이거나 투표를 진행한 인원이 없어 아무도 처형되지 않았습니다.';
    io.to(room.code).emit('voting-no-result', { message: msg });
    checkWinConditions(room);
    return;
  }

  if (votedOutPlayers.length > 1) {
    const tieNicknames = votedOutPlayers.map(p => p.nickname).join(', ');
    const msg = room.lang === 'EN'
      ? `A tie occurred between [${tieNicknames}]. Nobody was executed.`
      : `공동 최다 득표자 [${tieNicknames}]가 발생하여 동률 처리되었습니다. 아무도 처형되지 않았습니다.`;
    io.to(room.code).emit('voting-no-result', { 
      message: msg
    });
    checkWinConditions(room);
    return;
  }

  const target = votedOutPlayers[0];
  target.dead = true;

  if (room.gameMode === 'SPYFALL') {
    const isSpy = target.role === 'SPY';
    if (!isSpy) {
      room.citizenDeathCount++;
    }

    io.to(room.code).emit('player-voted-out', {
      nickname: target.nickname,
      role: target.role,
      isLiar: isSpy, // client expects isLiar
      isSpy,
      citizenDeathCount: room.citizenDeathCount,
      room
    });

    if (isSpy && room.settings.liarGuessEnabled) {
      room.gameState = 'SPY_GUESS';
      room.timerValue = 40;
      io.to(room.code).emit('spy-guess-phase', {
        spyId: target.id,
        spyNickname: target.nickname,
        room
      });

      clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
        room.timerValue--;
        if (room.timerValue <= 0) {
          clearInterval(room.timerInterval);
          room.gameState = 'RESULT';
          const msg = room.lang === 'EN'
            ? `Time out! Spy [${target.nickname}] failed to guess the location. Citizens won!`
            : `시간 초과! 스파이 [${target.nickname}]가 장소 맞추기에 실패하여 시민이 승리했습니다!`;
          io.to(room.code).emit('game-over', {
            winner: 'CITIZEN',
            message: msg,
            room
          });
        } else {
          io.to(room.code).emit('timer-updated', { value: room.timerValue });
        }
      }, 1000);
    } else {
      checkWinConditionsSpyfall(room);
    }
  } else {
    // Liar Mode
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

    if (isLiar && room.settings.liarGuessEnabled) {
      room.gameState = 'LIAR_GUESS';
      room.timerValue = 40;
      io.to(room.code).emit('liar-guess-phase', {
        liarId: target.id,
        liarNickname: target.nickname,
        room
      });

      clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
        room.timerValue--;
        if (room.timerValue <= 0) {
          clearInterval(room.timerInterval);
          room.gameState = 'RESULT';
          const msg = room.lang === 'EN'
            ? `Time out! Liar [${target.nickname}] failed to guess the secret word. Citizens won!`
            : `시간 초과! 라이어 [${target.nickname}]가 제시어 맞추기에 실패하여 시민이 승리했습니다!`;
          io.to(room.code).emit('game-over', {
            winner: 'CITIZEN',
            message: msg,
            room
          });
        } else {
          io.to(room.code).emit('timer-updated', { value: room.timerValue });
        }
      }, 1000);
    } else {
      checkWinConditions(room);
    }
  }
}

function checkWinConditionsSpyfall(room) {
  const activePlayers = room.players.filter(p => p.active);
  const aliveSpies = activePlayers.filter(p => p.role === 'SPY' && !p.dead);
  const aliveCitizens = activePlayers.filter(p => p.role === 'CITIZEN' && !p.dead);

  if (room.citizenDeathCount >= room.settings.citizenKillsDefeat) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? `${room.settings.citizenKillsDefeat} citizens died! Citizens lose, Spy wins!`
      : `시민 ${room.settings.citizenKillsDefeat}명 사망! 시민 진영이 패배하여 스파이가 승리했습니다!`;
    io.to(room.code).emit('game-over', {
      winner: 'SPY',
      message: msg,
      room
    });
    return;
  }

  if (aliveSpies.length === 0) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? 'All spies have been caught! Citizens win!'
      : '스파이가 모두 검거되었습니다! 시민 진영이 승리했습니다!';
    io.to(room.code).emit('game-over', {
      winner: 'CITIZEN',
      message: msg,
      room
    });
    return;
  }

  if (aliveSpies.length >= aliveCitizens.length) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? 'Number of spies is equal to or greater than surviving citizens! Spy wins!'
      : '스파이 인원수가 생존한 시민 인원수보다 같거나 많아졌습니다! 스파이가 승리했습니다!';
    io.to(room.code).emit('game-over', {
      winner: 'SPY',
      message: msg,
      room
    });
    return;
  }

  room.gameState = 'APPEAL';
  room.currentTurnIndex = 0;
  room.currentSpeakerText = '';
  io.to(room.code).emit('next-round-started', room);
  startNextSpeakerTurn(room);
}

// Check game win conditions
function checkWinConditions(room) {
  if (room.gameMode === 'SPYFALL') {
    checkWinConditionsSpyfall(room);
    return;
  }

  const activePlayers = room.players.filter(p => p.active);
  const aliveLiars = activePlayers.filter(p => p.role === 'LIAR' && !p.dead);
  const aliveCitizens = activePlayers.filter(p => p.role === 'CITIZEN' && !p.dead);

  // Condition 1: Citizens reach death limit
  if (room.citizenDeathCount >= room.settings.citizenKillsDefeat) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? `${room.settings.citizenKillsDefeat} citizens died! Citizens lose, Liar wins!`
      : `시민 ${room.settings.citizenKillsDefeat}명 사망! 시민 진영이 패배하여 라이어가 승리했습니다!`;
    io.to(room.code).emit('game-over', {
      winner: 'LIAR',
      message: msg,
      room
    });
    return;
  }

  // Condition 2: All Liars are dead
  if (aliveLiars.length === 0) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? 'All liars have been caught! Citizens win!'
      : '모든 라이어가 검거되었습니다! 시민 진영이 승리했습니다!';
    io.to(room.code).emit('game-over', {
      winner: 'CITIZEN',
      message: msg,
      room
    });
    return;
  }

  // Condition 3: Liars outnumber citizens or draw (Liar win)
  if (aliveLiars.length >= aliveCitizens.length) {
    room.gameState = 'RESULT';
    const msg = room.lang === 'EN'
      ? 'Number of liars is equal to or greater than surviving citizens! Liar wins!'
      : '라이어 인원수가 생존한 시민 인원수보다 같거나 많아졌습니다! 라이어가 승리했습니다!';
    io.to(room.code).emit('game-over', {
      winner: 'LIAR',
      message: msg,
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

function processClues(room) {
  const clueMap = {};
  Object.entries(room.votes).forEach(([playerId, clue]) => {
    const cleanClue = clue.toLowerCase().replace(/\s+/g, '');
    clueMap[cleanClue] = (clueMap[cleanClue] || 0) + 1;
  });

  const uniqueClues = [];
  const duplicateClues = [];

  Object.entries(room.votes).forEach(([playerId, clue]) => {
    const cleanClue = clue.toLowerCase().replace(/\s+/g, '');
    const player = room.players.find(p => p.id === playerId);
    const nickname = player ? player.nickname : '알 수 없음';
    
    if (clueMap[cleanClue] === 1) {
      uniqueClues.push({ nickname, clue, status: 'UNIQUE' });
    } else {
      duplicateClues.push({ nickname, clue, status: 'DUPLICATE' });
    }
  });

  room.appealLogs = [
    ...uniqueClues,
    ...duplicateClues
  ];

  room.gameState = 'CLUE_REVEAL';
  room.timerValue = 60; // 60 seconds to guess
  io.to(room.code).emit('clues-revealed', room);

  clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    room.timerValue--;
    if (room.timerValue <= 0) {
      clearInterval(room.timerInterval);
      room.gameState = 'RESULT';
      const msg = room.lang === 'EN'
        ? `Time out! The guesser failed to guess the secret word. The correct answer was [${room.targetWord}]!`
        : `시간 초과! 출제자가 제시어를 맞추는 데 실패했습니다. 정답은 [${room.targetWord}]였습니다!`;
      io.to(room.code).emit('game-over', {
        winner: 'CLUE_GIVER',
        message: msg,
        room
      });
    } else {
      io.to(room.code).emit('timer-updated', { value: room.timerValue });
    }
  }, 1000);
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
