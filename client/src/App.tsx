import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Crown, Play, SkipForward, Award, HelpCircle, Plus, Trash, 
  Settings, MessageSquare, ArrowRight, LogOut, ShieldAlert
} from 'lucide-react';
import { useSound } from './hooks/useSound';

// Interfaces
interface Player {
  id: string;
  nickname: string;
  role: string;
  word: string;
  active: boolean;
  voted: boolean;
  voteCount: number;
  dead: boolean;
  isHost: boolean;
}

interface RoomSettings {
  appealTime: number;
  debateTime: number;
  citizenKillsDefeat: number;
  liarGuessEnabled: boolean;
}

interface Room {
  code: string;
  hostId: string;
  players: Player[];
  settings: RoomSettings;
  gameState: 'LOBBY' | 'ROLE_REVEAL' | 'APPEAL' | 'DEBATE' | 'VOTING' | 'LIAR_GUESS' | 'RESULT';
  topic: string;
  targetWord: string;
  currentTurnIndex: number;
  appealLogs: { nickname: string; content: string }[];
  currentSpeakerText: string;
  timerValue: number;
  citizenDeathCount: number;
  votes: Record<string, string>;
}

interface Topic {
  id: string;
  name: string;
  words: string[];
}

export default function App() {
  const [page, setPage] = useState<'HOME' | 'ADMIN' | 'GAME_ROOM'>('HOME');
  const [nickname, setNickname] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [myId, setMyId] = useState('');
  const [isRoomCreationAllowed, setIsRoomCreationAllowed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Admin Panel states
  const [adminPassword, setAdminPassword] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [isAdminCreationAllowed, setIsAdminCreationAllowed] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [newTopicName, setNewTopicName] = useState('');
  const [newWordInput, setNewWordInput] = useState('');

  // Socket
  const socketRef = useRef<Socket | null>(null);
  const { playSound } = useSound();

  // Role Reveal state
  const [isRoleFlipped, setIsRoleFlipped] = useState(false);

  // Active turn state
  const [activeSpeaker, setActiveSpeaker] = useState<{ id: string; nickname: string } | null>(null);
  const [appealTextInput, setAppealTextInput] = useState('');
  const [otherSpeakerText, setOtherSpeakerText] = useState('');

  // Server URL
  const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:4000' : '';

  // Clean error msg after 4s
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Initial check for room creation eligibility
  useEffect(() => {
    fetch(`${SERVER_URL}/api/admin/config`)
      .then(res => res.json())
      .then(data => {
        setIsRoomCreationAllowed(data.roomCreationAllowed);
      })
      .catch(err => console.error('Failed to fetch config:', err));
  }, []);

  // Web Socket Connection & Handling
  const connectSocket = () => {
    if (socketRef.current) return socketRef.current;

    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id || '');
    });

    socket.on('room-updated', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      
      // Update active speaker details if in APPEAL state
      if (updatedRoom.gameState === 'APPEAL') {
        const alivePlayers = updatedRoom.players.filter(p => !p.dead && p.active);
        const current = alivePlayers[updatedRoom.currentTurnIndex];
        if (current) {
          setActiveSpeaker({ id: current.id, nickname: current.nickname });
        }
      }
    });

    socket.on('game-started', (startedRoom: Room) => {
      setRoom(startedRoom);
      setIsRoleFlipped(false);
      playSound('win'); // Play game start sound
    });

    socket.on('appeal-turn-start', ({ currentTurnIndex, speakerId, speakerNickname, timerValue }) => {
      setRoom(prev => prev ? { ...prev, currentTurnIndex, timerValue } : null);
      setActiveSpeaker({ id: speakerId, nickname: speakerNickname });
      setAppealTextInput('');
      setOtherSpeakerText('');

      if (speakerId === socket.id) {
        playSound('turn'); // Notification sound for own turn
      }
    });

    socket.on('speaker-text-updated', ({ text }) => {
      setOtherSpeakerText(text);
    });

    socket.on('timer-updated', ({ value }) => {
      setRoom(prev => prev ? { ...prev, timerValue: value } : null);
    });

    socket.on('timer-tick-sound', ({ type }) => {
      if (type === 'alert30') playSound('alert30');
      if (type === 'alert5') playSound('alert5');
      if (type === 'timeout') playSound('timeout');
    });

    socket.on('debate-started', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setActiveSpeaker(null);
      playSound('win');
    });

    socket.on('voting-started', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      playSound('alert30');
    });

    socket.on('voting-no-result', ({ message }) => {
      alert(message);
    });

    socket.on('player-voted-out', ({ nickname, isLiar, citizenDeathCount, room: updatedRoom }) => {
      setRoom(updatedRoom);
      playSound('reveal');
      alert(`[투표 결과]\n최다 득표자 [${nickname}]님이 처형되었습니다.\n정체: ${isLiar ? '라이어' : '시민'}\n(현재까지 탈락한 시민: ${citizenDeathCount}명)`);
    });

    socket.on('liar-guess-phase', ({ liarNickname, room: updatedRoom }) => {
      setRoom(updatedRoom);
      playSound('alert30');
      alert(`라이어 [${liarNickname}]님은 검거되었습니다.\n제시어를 추측할 수 있는 기회가 주어집니다!`);
    });

    socket.on('game-over', ({ winner, message, room: updatedRoom }) => {
      setRoom(updatedRoom);
      if (winner === 'LIAR') {
        playSound('loss');
      } else {
        playSound('win');
      }
      alert(`[게임 종료]\n\n${message}`);
    });

    socket.on('next-round-started', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      alert('라이어 검거 실패! 다음 라운드를 시작합니다.');
    });

    socket.on('player-killed-msg', ({ nickname }) => {
      playSound('loss');
      alert(`[사망 안내] [${nickname}]님이 자살 처리(사망)되었습니다.`);
    });

    socket.on('error-msg', (msg) => {
      setErrorMsg(msg);
    });

    socket.on('kicked', () => {
      alert('진행자에 의해 강퇴당했습니다.');
      setRoom(null);
      setPage('HOME');
    });

    return socket;
  };

  // Join Room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return setErrorMsg('닉네임을 입력해 주세요.');
    if (!roomCodeInput.trim()) return setErrorMsg('방 코드를 입력해 주세요.');

    const socket = connectSocket();
    socket.emit('join-room', { code: roomCodeInput, nickname }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
        setPage('GAME_ROOM');
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  // Create Room
  const handleCreateRoom = () => {
    if (!nickname.trim()) return setErrorMsg('닉네임을 입력해 주세요.');

    const socket = connectSocket();
    socket.emit('create-room', { nickname }, (res: any) => {
      if (res.success) {
        setRoom(res.room);
        setPage('GAME_ROOM');
      } else {
        setErrorMsg(res.message);
      }
    });
  };

  // Admin Login
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetch(`${SERVER_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAdminToken(data.token);
          fetchAdminConfig();
          fetchAdminWords();
        } else {
          setErrorMsg(data.message);
        }
      })
      .catch(() => setErrorMsg('서버와 연결할 수 없습니다.'));
  };

  const fetchAdminConfig = () => {
    fetch(`${SERVER_URL}/api/admin/config`)
      .then(res => res.json())
      .then(data => {
        setIsAdminCreationAllowed(data.roomCreationAllowed);
      });
  };

  const fetchAdminWords = () => {
    fetch(`${SERVER_URL}/api/admin/words`)
      .then(res => res.json())
      .then(data => {
        setTopics(data.topics || []);
        if (data.topics && data.topics.length > 0) {
          setSelectedTopicId(data.topics[0].id);
        }
      });
  };

  // Admin config save
  const toggleAdminRoomCreation = () => {
    const newVal = !isAdminCreationAllowed;
    fetch(`${SERVER_URL}/api/admin/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, roomCreationAllowed: newVal })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsAdminCreationAllowed(data.roomCreationAllowed);
          setIsRoomCreationAllowed(data.roomCreationAllowed);
        }
      });
  };

  // Admin Word/Topic Database update
  const saveWordsOnServer = (newTopics: Topic[]) => {
    fetch(`${SERVER_URL}/api/admin/words`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, topics: newTopics })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTopics(newTopics);
        }
      });
  };

  const handleAddTopic = () => {
    if (!newTopicName.trim()) return;
    const newTopic: Topic = {
      id: Date.now().toString(),
      name: newTopicName.trim(),
      words: []
    };
    const updated = [...topics, newTopic];
    saveWordsOnServer(updated);
    setNewTopicName('');
    setSelectedTopicId(newTopic.id);
  };

  const handleDeleteTopic = (id: string) => {
    const updated = topics.filter(t => t.id !== id);
    saveWordsOnServer(updated);
    if (selectedTopicId === id && updated.length > 0) {
      setSelectedTopicId(updated[0].id);
    }
  };

  const handleAddWord = () => {
    if (!newWordInput.trim() || !selectedTopicId) return;
    const updated = topics.map(t => {
      if (t.id === selectedTopicId) {
        if (t.words.includes(newWordInput.trim())) return t;
        return { ...t, words: [...t.words, newWordInput.trim()] };
      }
      return t;
    });
    saveWordsOnServer(updated);
    setNewWordInput('');
  };

  const handleDeleteWord = (topicId: string, word: string) => {
    const updated = topics.map(t => {
      if (t.id === topicId) {
        return { ...t, words: t.words.filter(w => w !== word) };
      }
      return t;
    });
    saveWordsOnServer(updated);
  };

  // Game Room: Host actions
  const isHost = room?.hostId === myId;

  const handleUpdateSettings = (settingsPatch: Partial<RoomSettings>) => {
    if (!room || !socketRef.current) return;
    socketRef.current.emit('update-settings', {
      ...room.settings,
      ...settingsPatch
    });
  };

  const handleKickPlayer = (playerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('kick-player', { playerId });
  };

  const handleStartGame = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('start-game');
  };

  const handleStartAppeal = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('start-appeal');
  };

  // Appeal Typing Sync
  const handleAppealInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setAppealTextInput(text);
    if (socketRef.current) {
      socketRef.current.emit('speak-text', { text });
    }
  };

  const handleSkipOrSubmitTurn = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('submit-appeal', { text: appealTextInput });
  };

  const handleDebateManualStart = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('start-debate-manual');
  };

  const handleVotingManualStart = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('start-voting-manual');
  };

  const handleCastVote = (suspectId: string) => {
    if (!socketRef.current || room?.votes[myId]) return;
    playSound('vote');
    socketRef.current.emit('submit-vote', { suspectId });
  };

  const handleAdminKillPlayer = (playerId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('admin-kill-player', { playerId });
  };

  // Liar guess submit
  const [liarGuessWord, setLiarGuessWord] = useState('');
  const handleLiarGuessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liarGuessWord.trim() || !socketRef.current) return;
    socketRef.current.emit('submit-liar-guess', { word: liarGuessWord.trim() });
    setLiarGuessWord('');
  };

  const handleResetGame = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('reset-game');
  };

  const handleExitRoom = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setRoom(null);
    setPage('HOME');
  };

  // Role details helper mapping
  const currentParticipantCount = room?.players.length || 0;
  
  const getRolesDetails = (count: number) => {
    if (count < 4) return { liar: 1, citizen: count - 1, kills: 2 };
    if (count === 4) return { liar: 1, citizen: 3, kills: 2 };
    if (count === 5) return { liar: 1, citizen: 4, kills: 2 };
    if (count === 6) return { liar: 2, citizen: 4, kills: 2 };
    if (count === 7) return { liar: 2, citizen: 5, kills: 2 };
    if (count === 8) return { liar: 2, citizen: 6, kills: 2 };
    if (count === 9) return { liar: 3, citizen: 6, kills: 3 };
    if (count === 10) return { liar: 3, citizen: 7, kills: 3 };
    if (count === 11) return { liar: 3, citizen: 8, kills: 3 };
    const liarCount = count >= 13 ? 4 : 3;
    return { liar: liarCount, citizen: count - liarCount, kills: 3 };
  };

  const currentRolesDetails = getRolesDetails(currentParticipantCount);

  // Helper formatting for timers
  const formatTimerValue = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      
      {/* Top Main Banner */}
      <header className="border-b border-[rgba(0,240,255,0.15)] bg-[#0d1321]/80 backdrop-blur-md px-6 py-4 flex justify-between items-center shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => room ? null : setPage('HOME')}>
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center font-black text-black text-xl shadow-[0_0_15px_rgba(0,240,255,0.4)]">
            L
          </div>
          <div>
            <h1 className="text-xl font-black tracking-widest var(--font-display) bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
              LIAR GAME ELITE
            </h1>
            <p className="text-xs text-gray-500 font-medium">실시간 토크온/디스코드 보조 도구</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {page !== 'ADMIN' && !room && (
            <button 
              className="text-xs text-gray-400 hover:text-cyan-400 flex items-center gap-1.5 transition-colors border border-gray-700/60 px-3 py-1.5 rounded-md"
              onClick={() => setPage('ADMIN')}
            >
              <Settings className="w-3.5 h-3.5" />
              관리자 페이지
            </button>
          )}

          {page === 'ADMIN' && (
            <button 
              className="text-xs text-gray-400 hover:text-cyan-400 flex items-center gap-1.5 transition-colors border border-gray-700/60 px-3 py-1.5 rounded-md"
              onClick={() => setPage('HOME')}
            >
              <LogOut className="w-3.5 h-3.5" />
              홈으로 가기
            </button>
          )}

          {room && (
            <button 
              className="text-xs text-pink-400 hover:text-pink-300 flex items-center gap-1.5 transition-colors border border-pink-900/40 px-3 py-1.5 rounded-md"
              onClick={handleExitRoom}
            >
              <LogOut className="w-3.5 h-3.5" />
              게임 나가기
            </button>
          )}
        </div>
      </header>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="bg-pink-950/80 border-b border-pink-700/50 text-pink-300 px-6 py-2.5 flex items-center gap-2 text-sm justify-center font-medium shadow-[0_4px_10px_rgba(255,0,127,0.1)]">
          <ShieldAlert className="w-4 h-4 text-pink-500 animate-bounce" />
          {errorMsg}
        </div>
      )}

      {/* Main Content Areas */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-6xl w-full mx-auto">
        
        {/* VIEW: HOME LANDING */}
        {page === 'HOME' && (
          <div className="w-full max-w-md my-8">
            
            <div className="text-center mb-8">
              <h2 className="text-4xl font-extrabold mb-2 text-white">진입 장벽 제로 라이어게임</h2>
              <p className="text-gray-400 text-sm">닉네임만 입력하고 바로 시작하세요. 디코/토크온 완벽 서포트</p>
            </div>

            <div className="glass-panel p-8 flex flex-col gap-6 shadow-glow-cyan">
              
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase tracking-wider text-cyan-400 font-bold">내 닉네임 설정</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="닉네임을 입력하세요" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={10}
                />
              </div>

              <div className="h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent my-1"></div>

              {/* Enter existing room */}
              <form onSubmit={handleJoinRoom} className="flex flex-col gap-3">
                <label className="text-xs uppercase tracking-wider text-gray-400 font-bold">방 참여하기</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="form-input flex-1 font-bold text-center tracking-widest text-cyan-400" 
                    placeholder="방 코드 6자리" 
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    maxLength={6}
                  />
                  <button type="submit" className="btn-secondary flex items-center gap-1.5">
                    입장
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>

              {/* Create new room */}
              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={handleCreateRoom}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                  disabled={!isRoomCreationAllowed}
                >
                  <Play className="w-4 h-4 fill-current" />
                  새로운 방 생성하기
                </button>
                {!isRoomCreationAllowed && (
                  <p className="text-center text-xs text-pink-500 font-medium">
                    ⚠️ 관리자가 테스트 중이 아니거나 방 생성을 제한해두었습니다.
                  </p>
                )}
              </div>

            </div>
          </div>
        )}

        {/* VIEW: ADMIN PANEL */}
        {page === 'ADMIN' && (
          <div className="w-full max-w-4xl my-4">
            {!adminToken ? (
              <div className="max-w-md mx-auto">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-black text-white">관리자 권한 인증</h2>
                  <p className="text-gray-400 text-xs mt-1">대주제, 제시어를 설정하고 방 생성을 제어합니다.</p>
                </div>
                <form onSubmit={handleAdminLogin} className="glass-panel p-8 flex flex-col gap-5">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-wider text-cyan-400 font-bold">관리자 비밀번호</label>
                    <input 
                      type="password" 
                      className="form-input" 
                      placeholder="비밀번호를 입력하세요" 
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full mt-2">
                    인증하기
                  </button>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Admin Configurations */}
                <div className="md:col-span-1 flex flex-col gap-6">
                  <div className="glass-panel p-6 flex flex-col gap-5 border-cyan-500/30">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-cyan-500/20 pb-3">
                      <Settings className="w-4 h-4 text-cyan-400" />
                      글로벌 서버 설정
                    </h3>
                    
                    <div className="flex justify-between items-center bg-[#0d1421] p-4 rounded-xl border border-gray-800">
                      <div>
                        <p className="text-sm font-bold">방 생성 활성화</p>
                        <p className="text-xs text-gray-500 mt-0.5">켜진 상태에서만 일반인 방 생성 가능</p>
                      </div>
                      <button 
                        onClick={toggleAdminRoomCreation} 
                        className={`w-12 h-6 rounded-full transition-colors relative ${isAdminCreationAllowed ? 'bg-cyan-500' : 'bg-gray-800'}`}
                      >
                        <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${isAdminCreationAllowed ? 'translate-x-6' : 'translate-x-1'}`}></span>
                      </button>
                    </div>

                    <div className="text-xs text-gray-500 leading-relaxed bg-[#111929] p-3.5 rounded-lg border border-cyan-950/40">
                      💡 <strong>배포 테스트 팁:</strong> 테스트 진행 시에만 방 생성을 켜두시고, 테스트 종료 시 비활성화하면 다른 외부 인원의 무단 방 생성을 차단할 수 있습니다.
                    </div>
                  </div>
                </div>

                {/* Topics & Words Database CRUD */}
                <div className="md:col-span-2 flex flex-col gap-6">
                  <div className="glass-panel p-6 flex flex-col gap-5 border-pink-500/30">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-pink-500/20 pb-3">
                      <MessageSquare className="w-4 h-4 text-pink-400" />
                      대주제 및 제시어 관리 데이터베이스
                    </h3>

                    {/* Topic creation */}
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        className="form-input flex-1 text-sm" 
                        placeholder="새로운 대주제 입력 (예: 국가)" 
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                      />
                      <button onClick={handleAddTopic} className="btn-secondary text-sm flex items-center gap-1">
                        <Plus className="w-4 h-4" />
                        주제 추가
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Topics list */}
                      <div className="bg-[#0b0f19]/80 border border-gray-800 rounded-xl p-3 max-h-[300px] overflow-y-auto">
                        <p className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-800 pb-1">대주제 목록 ({topics.length})</p>
                        {topics.map(t => (
                          <div 
                            key={t.id} 
                            onClick={() => setSelectedTopicId(t.id)}
                            className={`flex justify-between items-center p-2 rounded-lg cursor-pointer transition-colors text-sm mb-1 ${selectedTopicId === t.id ? 'bg-pink-500/20 text-pink-300 font-bold border border-pink-500/30' : 'hover:bg-gray-800/50'}`}
                          >
                            <span>{t.name} ({t.words.length})</span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTopic(t.id);
                              }}
                              className="text-gray-500 hover:text-pink-400 transition-colors p-1"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Words list of selected topic */}
                      <div className="bg-[#0b0f19]/80 border border-gray-800 rounded-xl p-3 flex flex-col max-h-[300px]">
                        <p className="text-xs font-bold text-gray-400 mb-2 border-b border-gray-800 pb-1">
                          제시어 관리: {topics.find(t => t.id === selectedTopicId)?.name || '선택된 주제 없음'}
                        </p>
                        
                        {selectedTopicId && (
                          <>
                            <div className="flex gap-1.5 mb-3">
                              <input 
                                type="text" 
                                className="form-input flex-1 text-xs py-1 px-2" 
                                placeholder="추가할 제시어" 
                                value={newWordInput}
                                onChange={(e) => setNewWordInput(e.target.value)}
                              />
                              <button onClick={handleAddWord} className="btn-primary py-1 px-2.5 text-xs">
                                등록
                              </button>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-1 flex flex-wrap gap-1.5 content-start">
                              {topics.find(t => t.id === selectedTopicId)?.words.map(w => (
                                <div key={w} className="flex items-center gap-1 bg-gray-800 px-2 py-1 rounded text-xs">
                                  <span>{w}</span>
                                  <button 
                                    onClick={() => handleDeleteWord(selectedTopicId, w)}
                                    className="text-gray-400 hover:text-pink-400 transition-colors"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              {topics.find(t => t.id === selectedTopicId)?.words.length === 0 && (
                                <p className="text-xs text-gray-500 w-full text-center mt-6">등록된 단어가 없습니다.</p>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* VIEW: GAME ROOM */}
        {room && (
          <div className="w-full my-2 flex flex-col gap-6">
            
            {/* Header info bar */}
            <div className="glass-panel p-4 flex flex-wrap justify-between items-center gap-4 border-cyan-500/20">
              <div className="flex items-center gap-3">
                <span className="text-xs bg-cyan-950 text-cyan-400 font-bold border border-cyan-500/30 px-2.5 py-1 rounded-md">
                  방 코드: {room.code}
                </span>
                <span className="text-xs bg-[#1a1c23] border border-gray-700 px-2.5 py-1 rounded-md text-gray-300">
                  접속자: {room.players.length}명
                </span>
              </div>
              
              {room.gameState !== 'LOBBY' && (
                <div className="flex items-center gap-4 text-xs">
                  <div className="text-gray-400">
                    주제: <strong className="text-cyan-400 text-sm font-bold bg-[#111929] px-2 py-0.5 rounded border border-cyan-500/20 ml-1">{room.topic}</strong>
                  </div>
                  <div className="text-gray-400">
                    역할 비율: <strong className="text-pink-400 ml-1 bg-[#1a1223] px-2 py-0.5 rounded border border-pink-500/20">라이어 {room.players.filter(p => p.role === 'LIAR').length}명 / 시민 {room.players.filter(p => p.role === 'CITIZEN').length}명</strong>
                  </div>
                  <div className="text-gray-400">
                    시민 패배 조건: <strong className="text-pink-400 ml-1">누적 {room.settings.citizenKillsDefeat}명 사망 (현재 {room.citizenDeathCount}명)</strong>
                  </div>
                </div>
              )}
            </div>

            {/* MAIN GAME PHASES ROUTER */}
            
            {/* 1. LOBBY PHASE */}
            {room.gameState === 'LOBBY' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Players list */}
                <div className="md:col-span-2 glass-panel p-6 flex flex-col gap-4">
                  <h3 className="text-lg font-bold border-b border-gray-800 pb-3 flex items-center justify-between">
                    <span>참가 대기열 ({room.players.length} / 15)</span>
                    <span className="text-xs text-gray-500 font-medium">최소 4명 필요</span>
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-1">
                    {room.players.map(p => (
                      <div 
                        key={p.id} 
                        className={`flex justify-between items-center p-3 rounded-xl border transition-all ${p.id === myId ? 'bg-cyan-500/10 border-cyan-400/40 shadow-glow-cyan' : 'bg-gray-900/60 border-gray-800'}`}
                      >
                        <div className="flex items-center gap-2">
                          {p.isHost ? (
                            <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                          ) : null}
                          <span className={`font-bold ${p.id === myId ? 'text-cyan-400' : 'text-gray-200'}`}>
                            {p.nickname} {p.id === myId ? '(나)' : ''}
                          </span>
                        </div>

                        {isHost && p.id !== myId && (
                          <button 
                            onClick={() => handleKickPlayer(p.id)}
                            className="text-xs text-pink-500 hover:text-pink-400 border border-pink-900/20 bg-pink-950/20 hover:bg-pink-900/20 transition-all px-2.5 py-1 rounded"
                          >
                            강퇴
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {isHost && (
                    <button 
                      onClick={handleStartGame}
                      disabled={room.players.length < 4}
                      className="btn-primary w-full mt-4 flex items-center justify-center gap-2 py-3"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      게임 시작하기
                    </button>
                  )}
                  {!isHost && (
                    <div className="bg-[#0b0f19] border border-gray-800 text-center py-4 rounded-xl text-gray-500 text-sm mt-4">
                      방장이 게임을 시작하기를 기다리는 중입니다...
                    </div>
                  )}
                </div>

                {/* Settings & Role Preview */}
                <div className="md:col-span-1 flex flex-col gap-6">
                  
                  {/* Settings Panel */}
                  <div className="glass-panel p-6 flex flex-col gap-4">
                    <h3 className="text-md font-bold border-b border-gray-800 pb-2 flex items-center gap-1.5">
                      <Settings className="w-4 h-4 text-cyan-400" />
                      게임 상세 설정
                    </h3>

                    {/* Appeal Time Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-400 font-bold">인당 어필 시간 (발언 시간)</label>
                      <select 
                        disabled={!isHost}
                        value={room.settings.appealTime}
                        onChange={(e) => handleUpdateSettings({ appealTime: parseInt(e.target.value) })}
                        className="form-input text-sm py-2 bg-[#0b0f19]"
                      >
                        {[10, 15, 20, 25, 30, 45, 60].map(s => (
                          <option key={s} value={s}>{s}초</option>
                        ))}
                      </select>
                    </div>

                    {/* Debate Time Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-400 font-bold">토론 시간</label>
                      <select 
                        disabled={!isHost}
                        value={room.settings.debateTime}
                        onChange={(e) => handleUpdateSettings({ debateTime: parseInt(e.target.value) })}
                        className="form-input text-sm py-2 bg-[#0b0f19]"
                      >
                        {[60, 120, 180, 240, 300, 420, 600].map(s => (
                          <option key={s} value={s}>{s/60}분</option>
                        ))}
                      </select>
                    </div>

                    {/* Defeat limit */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-gray-400 font-bold">시민 패배 킬수 (시민 탈락 수)</label>
                      <select 
                        disabled={!isHost}
                        value={room.settings.citizenKillsDefeat}
                        onChange={(e) => handleUpdateSettings({ citizenKillsDefeat: parseInt(e.target.value) })}
                        className="form-input text-sm py-2 bg-[#0b0f19]"
                      >
                        {[1, 2, 3, 4].map(k => (
                          <option key={k} value={k}>{k}명 처형 시 패배</option>
                        ))}
                      </select>
                    </div>

                    {/* Guess target word */}
                    <div className="flex justify-between items-center py-1 mt-1">
                      <span className="text-xs text-gray-400 font-bold">라이어 제시어 맞추기 기회</span>
                      <button 
                        disabled={!isHost}
                        onClick={() => handleUpdateSettings({ liarGuessEnabled: !room.settings.liarGuessEnabled })}
                        className={`text-xs px-3 py-1 rounded transition-colors font-bold ${room.settings.liarGuessEnabled ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-gray-800 text-gray-500'}`}
                      >
                        {room.settings.liarGuessEnabled ? '활성화' : '비활성화'}
                      </button>
                    </div>
                  </div>

                  {/* Role preview mapping info */}
                  <div className="glass-panel p-6 flex flex-col gap-3">
                    <h3 className="text-xs uppercase tracking-wider text-pink-400 font-bold">
                      참가 인원별 역할 구성표
                    </h3>
                    <div className="bg-[#0b0f19]/80 border border-gray-800/80 rounded-xl p-3.5 flex flex-col gap-2.5 text-xs text-gray-400">
                      <div className="flex justify-between font-bold border-b border-gray-800 pb-1">
                        <span>현재 인원: {currentParticipantCount}명</span>
                        <span className="text-cyan-400">라이어 {currentRolesDetails.liar}명 / 시민 {currentRolesDetails.citizen}명</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center text-[11px] leading-relaxed">
                        <div className="bg-gray-900/60 p-1.5 rounded border border-gray-800">4~5명: 라이어 1 (2킬패)</div>
                        <div className="bg-gray-900/60 p-1.5 rounded border border-gray-800">6~8명: 라이어 2 (2킬패)</div>
                        <div className="bg-gray-900/60 p-1.5 rounded border border-gray-800">9~11명: 라이어 3 (3킬패)</div>
                        <div className="bg-gray-900/60 p-1.5 rounded border border-gray-800">12명+: 라이어 3~4 (3킬패)</div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* 2. ROLE REVEAL PHASE */}
            {room.gameState === 'ROLE_REVEAL' && (
              <div className="flex flex-col items-center gap-8 py-8">
                <div className="text-center">
                  <h3 className="text-2xl font-black text-white">비밀 역할 확인 단계</h3>
                  <p className="text-gray-400 text-sm mt-1">카드를 터치하거나 클릭하여 본인의 비밀 정보를 확인해 주세요.</p>
                </div>

                <div 
                  className="role-card-wrapper" 
                  onClick={() => {
                    setIsRoleFlipped(!isRoleFlipped);
                    playSound('reveal');
                  }}
                >
                  <div className={`role-card ${isRoleFlipped ? 'revealed' : 'unrevealed'}`}>
                    {/* Front */}
                    <div className="card-front shadow-glow-cyan">
                      <HelpCircle className="w-16 h-16 mb-4 animate-pulse" />
                      <span className="text-sm uppercase tracking-widest font-black">역할 카드 확인</span>
                      <span className="text-xs text-gray-500 mt-2 font-medium">(클릭해서 뒤집기)</span>
                    </div>

                    {/* Back */}
                    <div className="card-back shadow-glow-pink">
                      <Award className="w-12 h-12 text-pink-400 mb-3" />
                      <h4 className="text-xs text-pink-400 uppercase tracking-widest font-black mb-1">YOUR SECRET ROLE</h4>
                      <p className={`text-2xl font-black mb-3 ${room.players.find(p => p.id === myId)?.role === 'LIAR' ? 'text-pink-400' : 'text-cyan-400'}`}>
                        {room.players.find(p => p.id === myId)?.role === 'LIAR' ? '라이어' : '시민'}
                      </p>
                      
                      <div className="h-px bg-pink-500/20 w-3/4 my-2"></div>
                      
                      <p className="text-xs text-gray-400 mt-1">배정된 제시어 / 주제</p>
                      <p className="text-lg font-black text-white bg-black/40 px-4 py-1.5 rounded border border-pink-500/20 mt-1">
                        {room.players.find(p => p.id === myId)?.word}
                      </p>
                    </div>
                  </div>
                </div>

                {isHost && (
                  <button 
                    onClick={handleStartAppeal}
                    className="btn-primary flex items-center gap-2 py-3 px-8 text-md"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    모두 준비 완료 - 첫 어필 시작하기
                  </button>
                )}
                {!isHost && (
                  <p className="text-xs text-gray-500">방장이 역할을 확인하고 어필 단계를 시작할 때까지 카드를 보며 대기하세요.</p>
                )}
              </div>
            )}

            {/* 3. APPEAL PHASE (발언 단계) */}
            {room.gameState === 'APPEAL' && activeSpeaker && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Current speaker console */}
                <div className="md:col-span-2 flex flex-col gap-6">
                  
                  {/* Speaker card info */}
                  <div className="glass-panel p-6 flex flex-col gap-5 border-cyan-500/30">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">CURRENT SPEAKER</span>
                        <h3 className="text-3xl font-black text-white mt-1">
                          현재 발언자: <span className="text-cyan-400">{activeSpeaker.nickname}</span>
                        </h3>
                      </div>
                      
                      {/* Timer gauge */}
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">REMAINING TIME</span>
                        <span className={`text-4xl font-black font-display mt-1 ${room.timerValue <= 5 ? 'pulse-critical text-pink-500' : 'text-cyan-400'}`}>
                          {room.timerValue}초
                        </span>
                      </div>
                    </div>

                    {/* Timer progress bar */}
                    <div className="w-full bg-[#0d1421] h-2.5 rounded-full overflow-hidden border border-gray-800">
                      <div 
                        className={`h-full transition-all duration-1000 ${room.timerValue <= 5 ? 'bg-pink-500' : 'bg-cyan-400'}`}
                        style={{ width: `${(room.timerValue / room.settings.appealTime) * 100}%` }}
                      ></div>
                    </div>

                    {/* Input box */}
                    <div className="flex flex-col gap-2 mt-2">
                      <label className="text-xs text-gray-400 font-bold flex items-center justify-between">
                        <span>어필 입력창</span>
                        <span className="text-[10px] text-gray-500">모든 사람의 화면에 즉시 동기화됩니다.</span>
                      </label>
                      
                      {activeSpeaker.id === myId ? (
                        <textarea
                          className="form-input text-base resize-none h-24"
                          placeholder="제시어에 관한 나의 설명이나 변명을 입력하세요 (입력값 실시간 표시)"
                          value={appealTextInput}
                          onChange={handleAppealInputChange}
                        />
                      ) : (
                        <div className="bg-[#0b0f19] border border-gray-800/80 rounded-xl p-4 min-h-[96px] text-gray-300 italic whitespace-pre-wrap leading-relaxed shadow-inner">
                          {otherSpeakerText || room.currentSpeakerText || '발언자가 입력을 대기하고 있습니다...'}
                          {otherSpeakerText && <span className="inline-block w-2.5 h-4 bg-cyan-400 ml-1 animate-pulse"></span>}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      {/* Next button */}
                      {activeSpeaker.id === myId ? (
                        <button 
                          onClick={handleSkipOrSubmitTurn}
                          className="btn-primary flex items-center gap-1.5 ml-auto"
                        >
                          설명 제출 후 다음 사람 넘기기
                          <SkipForward className="w-4 h-4 fill-current" />
                        </button>
                      ) : isHost ? (
                        <button 
                          onClick={handleSkipOrSubmitTurn}
                          className="btn-secondary flex items-center gap-1.5 ml-auto text-xs py-2"
                        >
                          방장 권한: 턴 강제 넘기기
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500 font-medium italic">차례가 완료되면 자동으로 넘어갑니다.</span>
                      )}
                    </div>

                  </div>

                  {/* Appeal History Logs */}
                  <div className="glass-panel p-6 flex flex-col gap-4">
                    <h3 className="text-sm font-bold border-b border-gray-800 pb-2 text-gray-400">
                      이번 라운드 발언 기록 ({room.appealLogs.length})
                    </h3>
                    <div className="flex flex-col gap-3 max-h-[200px] overflow-y-auto pr-1">
                      {room.appealLogs.map((log, index) => (
                        <div key={index} className="bg-gray-900/50 border border-gray-800/60 p-3 rounded-lg flex flex-col gap-1.5 text-xs">
                          <strong className="text-cyan-400 font-bold">{log.nickname}</strong>
                          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{log.content}</p>
                        </div>
                      ))}
                      {room.appealLogs.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-6">기록된 발언이 없습니다.</p>
                      )}
                    </div>
                  </div>

                </div>

                {/* Status pane / Host controls */}
                <div className="md:col-span-1 flex flex-col gap-6">
                  
                  {/* Players list with speaking state */}
                  <div className="glass-panel p-6 flex flex-col gap-4">
                    <h3 className="text-sm font-bold border-b border-gray-800 pb-2">생존자 및 발언 상태</h3>
                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                      {room.players.map((p) => {
                        const isSpeaking = activeSpeaker.id === p.id;
                        return (
                          <div 
                            key={p.id} 
                            className={`flex justify-between items-center p-2.5 rounded-lg border transition-all text-xs ${isSpeaking ? 'border-cyan-400 bg-cyan-950/20 shadow-glow-cyan' : p.dead ? 'border-pink-900/10 bg-pink-950/5 opacity-55' : 'border-gray-800/80 bg-gray-900/40'}`}
                          >
                            <div className="flex items-center gap-2">
                              {p.dead ? (
                                <span className="text-[10px] bg-pink-950 text-pink-500 px-1.5 py-0.5 rounded border border-pink-500/20 font-bold">사망</span>
                              ) : isSpeaking ? (
                                <span className="text-[10px] bg-cyan-950 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold animate-pulse">발언중</span>
                              ) : (
                                <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">대기</span>
                              )}
                              <span className={`font-bold ${isSpeaking ? 'text-cyan-400' : p.dead ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                                {p.nickname}
                              </span>
                            </div>

                            {isHost && !p.dead && p.id !== myId && (
                              <button 
                                onClick={() => handleAdminKillPlayer(p.id)}
                                className="text-[10px] text-pink-500 hover:underline"
                              >
                                자살처리
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual trigger for host */}
                  {isHost && (
                    <button 
                      onClick={handleDebateManualStart}
                      className="btn-secondary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      발언 단계 생략하고 자유 토론 시작
                    </button>
                  )}

                </div>
              </div>
            )}

            {/* 4. DEBATE PHASE */}
            {room.gameState === 'DEBATE' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                <div className="md:col-span-2 glass-panel p-8 flex flex-col items-center justify-center text-center gap-6 border-pink-500/20 shadow-glow-pink">
                  
                  <div>
                    <span className="text-xs uppercase tracking-wider text-pink-400 font-bold">DEBATE PHASE</span>
                    <h3 className="text-3xl font-black text-white mt-1">자유 토론 및 질답 시간</h3>
                    <p className="text-gray-400 text-sm mt-1">음성채팅(디스코드/토크온)을 이용해 의심스러운 부분을 설명하고 토론하세요.</p>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">남은 토론 시간</span>
                    <h2 className={`text-6xl font-black font-display tracking-widest ${room.timerValue <= 10 ? 'pulse-critical text-pink-500' : 'text-cyan-400'}`}>
                      {formatTimerValue(room.timerValue)}
                    </h2>
                  </div>

                  {/* Progress Gauge */}
                  <div className="w-full max-w-md bg-[#0d1421] h-2 rounded-full overflow-hidden border border-gray-800">
                    <div 
                      className={`h-full transition-all duration-1000 ${room.timerValue <= 10 ? 'bg-pink-500' : 'bg-cyan-400'}`}
                      style={{ width: `${(room.timerValue / room.settings.debateTime) * 100}%` }}
                    ></div>
                  </div>

                  {isHost && (
                    <button 
                      onClick={handleVotingManualStart}
                      className="btn-primary py-3 px-8 flex items-center gap-2 text-sm mt-4"
                    >
                      <SkipForward className="w-4 h-4 fill-current" />
                      토론 종료하고 바로 투표 시작하기
                    </button>
                  )}
                  {!isHost && (
                    <p className="text-xs text-gray-500 italic mt-4">토론 타이머가 종료되면 자동으로 투표 단계로 전환됩니다.</p>
                  )}

                </div>

                {/* Appeal records column */}
                <div className="md:col-span-1 glass-panel p-6 flex flex-col gap-4">
                  <h3 className="text-xs uppercase tracking-wider text-cyan-400 font-bold">이전 발언 참고용 기록</h3>
                  <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                    {room.appealLogs.map((log, index) => (
                      <div key={index} className="bg-gray-900/60 border border-gray-800/80 p-3 rounded-lg flex flex-col gap-1.5 text-xs">
                        <strong className="text-cyan-400 font-bold">{log.nickname}</strong>
                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{log.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* 5. VOTING PHASE */}
            {room.gameState === 'VOTING' && (
              <div className="flex flex-col gap-6">
                
                <div className="text-center">
                  <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">VOTING ROUND</span>
                  <h3 className="text-2xl font-black text-white mt-1">라이어 검거 투표</h3>
                  <p className="text-gray-400 text-sm mt-1">의심스러운 사람을 선택해 주세요. 투표는 실시간으로 중계됩니다. (남은 시간: {room.timerValue}초)</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Suspect list */}
                  <div className="md:col-span-2 glass-panel p-6 flex flex-col gap-4">
                    <h4 className="text-sm font-bold border-b border-gray-800 pb-2">플레이어 선택</h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
                      {room.players.filter(p => p.active).map(p => {
                        const isDead = p.dead;
                        const hasVoted = room.votes[myId];
                        const isSelected = room.votes[myId] === p.id;
                        const myPlayer = room.players.find(x => x.id === myId);
                        const isMeDead = myPlayer?.dead;

                        return (
                          <button
                            key={p.id}
                            disabled={!!hasVoted || isDead || !!isMeDead}
                            onClick={() => handleCastVote(p.id)}
                            className={`flex justify-between items-center p-4 rounded-xl border text-left transition-all text-sm ${isDead ? 'bg-pink-950/5 border-pink-900/10 opacity-40 cursor-not-allowed' : isSelected ? 'bg-pink-500/10 border-pink-500 shadow-glow-pink' : 'bg-gray-900/60 border-gray-800 hover:border-cyan-500/40 hover:bg-gray-800/40'}`}
                          >
                            <span className={`font-bold ${isDead ? 'text-gray-600 line-through' : isSelected ? 'text-pink-400 font-black' : 'text-gray-200'}`}>
                              {p.nickname} {isDead ? '(사망)' : p.id === myId ? '(나)' : ''}
                            </span>
                            
                            {!isDead && (
                              <span className="text-xs text-gray-400 font-medium">
                                {isSelected ? '선택 완료' : '의심 투표'}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Realtime Vote counts tally (Tally progress bar graphs) */}
                  <div className="md:col-span-1 glass-panel p-6 flex flex-col gap-4">
                    <h4 className="text-sm font-bold border-b border-gray-800 pb-2">실시간 득표 현황</h4>
                    
                    <div className="flex flex-col gap-3">
                      {room.players.filter(p => p.active && !p.dead).map(p => {
                        const totalVotes = Object.keys(room.votes).length || 1; // Prevent NaN
                        const pct = (p.voteCount / totalVotes) * 100;
                        return (
                          <div key={p.id} className="flex flex-col gap-1 text-xs">
                            <div className="flex justify-between font-bold text-gray-300">
                              <span>{p.nickname}</span>
                              <span className="text-pink-400">{p.voteCount}표</span>
                            </div>
                            
                            <div className="w-full bg-gray-900 h-2 rounded-full overflow-hidden border border-gray-800/80">
                              <div 
                                className="h-full bg-pink-500 transition-all duration-300"
                                style={{ width: `${pct}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="h-px bg-gray-800 my-2"></div>

                    <div className="text-[11px] text-gray-500 flex flex-col gap-1">
                      <p>• 투표 참여 인원: {Object.keys(room.votes).length}명 / {room.players.filter(p => !p.dead && p.active).length}명</p>
                      <p>• 전원 투표 완료 시 결과가 즉시 공개됩니다.</p>
                    </div>
                  </div>

                </div>

              </div>
            )}

            {/* 6. LIAR GUESS PHASE */}
            {room.gameState === 'LIAR_GUESS' && (
              <div className="max-w-md mx-auto w-full py-8 text-center">
                <div className="glass-panel p-8 border-pink-500/30 flex flex-col gap-6 shadow-glow-pink">
                  
                  <div>
                    <span className="text-xs uppercase tracking-wider text-pink-400 font-bold">LIAR FINAL CHANCE</span>
                    <h3 className="text-2xl font-black text-white mt-1">라이어 제시어 맞추기</h3>
                    <p className="text-gray-400 text-xs mt-1">라이어가 제시어를 정확하게 맞추면 라이어가 최종 역전 승리합니다!</p>
                  </div>

                  <div className="h-px bg-pink-500/20 w-full"></div>

                  {room.votes[myId] === myId || room.players.find(p => p.id === myId)?.role === 'LIAR' ? (
                    // I am the liar
                    <form onSubmit={handleLiarGuessSubmit} className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1.5 text-left">
                        <label className="text-xs text-pink-400 font-bold">최종 단어 입력</label>
                        <input 
                          type="text" 
                          className="form-input text-center text-lg font-bold" 
                          placeholder="제시어 단어를 정확하게 입력하세요" 
                          value={liarGuessWord}
                          onChange={(e) => setLiarGuessWord(e.target.value)}
                          maxLength={15}
                          required
                        />
                      </div>
                      
                      <button type="submit" className="btn-danger w-full py-3">
                        정답 제출하기
                      </button>
                    </form>
                  ) : (
                    // Citizen view
                    <div className="flex flex-col items-center gap-4 py-4">
                      <div className="w-12 h-12 rounded-full border-2 border-pink-500 border-t-transparent animate-spin"></div>
                      <p className="text-sm text-gray-300">
                        검거된 라이어가 제시어를 추측하여 입력하는 중입니다...
                      </p>
                      <p className="text-[11px] text-pink-500 font-bold uppercase tracking-wider">
                        남은 시간: {room.timerValue}초
                      </p>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* 7. RESULT PHASE */}
            {room.gameState === 'RESULT' && (
              <div className="max-w-2xl mx-auto w-full my-4 flex flex-col gap-6">
                
                {/* Winner announcement panel */}
                <div className="glass-panel p-8 text-center flex flex-col gap-5 border-cyan-500/20">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-cyan-400 font-bold">GAME SET</span>
                    <h2 className="text-4xl font-black text-white mt-1 bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">
                      게임이 종료되었습니다!
                    </h2>
                  </div>

                  <div className="bg-[#0b0f19] border border-gray-800 p-6 rounded-2xl flex flex-col items-center gap-2">
                    <p className="text-xs text-gray-500 font-bold">진짜 제시어 (정답)</p>
                    <span className="text-3xl font-black text-pink-400 bg-pink-500/5 border border-pink-500/25 px-8 py-2 rounded-xl mt-1 shadow-inner">
                      {room.targetWord}
                    </span>
                    <p className="text-xs text-gray-500 font-bold mt-2">대주제: {room.topic}</p>
                  </div>

                  {/* Player roles table summary */}
                  <div className="flex flex-col gap-2 mt-2">
                    <p className="text-xs text-gray-400 font-bold text-left">참가자 역할 상세 내역</p>
                    <div className="bg-[#0d1421] border border-gray-800/80 rounded-xl overflow-hidden text-xs">
                      <div className="grid grid-cols-3 bg-[#111929] px-4 py-2 border-b border-gray-800 font-bold text-gray-400 text-left">
                        <span>닉네임</span>
                        <span>역할</span>
                        <span>전달된 제시어</span>
                      </div>
                      
                      <div className="max-h-[200px] overflow-y-auto">
                        {room.players.map(p => (
                          <div key={p.id} className="grid grid-cols-3 px-4 py-2 border-b border-gray-800/40 text-left items-center">
                            <span className="font-bold text-gray-300">{p.nickname}</span>
                            <span className={p.role === 'LIAR' ? 'text-pink-400 font-bold' : 'text-cyan-400'}>
                              {p.role === 'LIAR' ? '라이어' : '시민'} {p.dead ? '(사망)' : ''}
                            </span>
                            <span className="text-gray-400 font-mono">{p.word}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {isHost && (
                    <button 
                      onClick={handleResetGame}
                      className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-md mt-2"
                    >
                      <Settings className="w-5 h-5" />
                      대기실로 돌아가서 다음 게임 준비
                    </button>
                  )}
                  {!isHost && (
                    <div className="text-xs text-gray-500 italic mt-2">
                      방장이 새로운 방을 설정하고 대기실로 이동시킬 때까지 대기해 주세요.
                    </div>
                  )}

                </div>

              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-6 px-6 text-center text-xs text-gray-500 border-t border-[rgba(0,240,255,0.05)] mt-auto bg-[#080b12]/50">
        <p className="tracking-wide">© 2026 LIAR GAME ELITE - ALL RIGHTS RESERVED BY CHANI.</p>
      </footer>
      
    </div>
  );
}
