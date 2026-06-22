
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, push, set, update, onValue, get, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgXQe9wpVC5hrL053DNOX06x2C9oYIcEo",
  authDomain: "workmesh-ad848.firebaseapp.com",
  databaseURL: "https://workmesh-ad848-default-rtdb.firebaseio.com",
  projectId: "workmesh-ad848",
  storageBucket: "workmesh-ad848.firebasestorage.app",
  messagingSenderId: "93966939997",
  appId: "1:93966939997:web:edc9a2efd9249f9d8f5ab4",
  measurementId: "G-67M10CWG9W"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);


const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playClickSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playSuccessSound() {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';

    // A major chord arpeggio
    osc1.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
    osc1.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1); // C#5
    osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.2); // E5

    osc2.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(1108.73, audioCtx.currentTime + 0.1);
    osc2.frequency.setValueAtTime(1318.51, audioCtx.currentTime + 0.2);

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(audioCtx.currentTime + 0.5);
    osc2.stop(audioCtx.currentTime + 0.5);
}

// Add global click listener for all buttons with class 'btn'
document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('btn')) {
        playClickSound();
    }
});



const QUIZZES_ROOT = 'quizzes';

function generateSessionCode(length = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => String(option ?? '').trim()).filter(Boolean);
}

function normalizeQuestion(question) {
  return {
    type: String(question?.type ?? 'multiple-choice').trim(),
    text: String(question?.text ?? '').trim(),
    options: normalizeOptions(question?.options),
    correct: Number(question?.correct ?? 0),
    time: Math.max(5, Number(question?.time ?? 15) || 15),
    explanation: String(question?.explanation ?? '').trim(),
    statements: normalizeOptions(question?.statements), // for Scales
  };
}

async function getSession(sid) {
  const snap = await get(ref(rtdb, `${QUIZZES_ROOT}/${sid}`));
  return snap.exists() ? snap.val() : null;
}

async function resolveUniqueCode() {
  let code = generateSessionCode(4);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const exists = await get(ref(rtdb, `${QUIZZES_ROOT}/${code}`));
    if (!exists.exists()) return code;
    code = generateSessionCode(attempt >= 4 ? 5 : 4);
  }
  return `${generateSessionCode(4)}${Date.now().toString().slice(-2)}`;
}

window.quiz = {
  createRoom: async (payload) => {
    const requestedCode = String(payload?.code ?? payload?.sessionId ?? '').trim().toUpperCase();
    const sid = requestedCode || await resolveUniqueCode();
    const existing = requestedCode ? await getSession(sid) : null;

    if (existing) {
      return sid;
    }

    const data = {
      title: payload.title || 'Interactive WorkMesh Room',
      state: 'lobby',
      createdAt: Date.now(),
      activeQuestionIndex: null,
      activeQuestionStartedAt: null,
      activeQuestionEndsAt: null,
      revealQuestionIndex: null,
      revealCorrectIndex: null,
      revealEndsAt: null,
      showResults: true,
      questions: [],
      scores: {},
      players: {}
    };
    (payload.questions || []).forEach((question) => {
      data.questions.push(normalizeQuestion(question));
    });
    await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), data);
    return sid;
  },

  addQuestion: async (sid, question) => {
    const nextQuestion = normalizeQuestion(question);
    const session = await getSession(sid);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    questions.push(nextQuestion);
    await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}/questions`), questions);
    return questions.length - 1;
  },

  updateQuestion: async (sid, qIdx, question) => {
    const normalized = normalizeQuestion(question);
    const session = await getSession(sid);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx >= 0 && qIdx < questions.length) {
      questions[qIdx] = normalized;
      await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  reorderQuestions: async (sid, qIdx1, qIdx2) => {
    const session = await getSession(sid);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx1 >= 0 && qIdx1 < questions.length && qIdx2 >= 0 && qIdx2 < questions.length) {
      const temp = questions[qIdx1];
      questions[qIdx1] = questions[qIdx2];
      questions[qIdx2] = temp;
      await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  deleteQuestion: async (sid, qIdx) => {
    const session = await getSession(sid);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx >= 0 && qIdx < questions.length) {
      questions.splice(qIdx, 1);
      await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  onRoomUpdate: (sid, cb) => {
    const r = ref(rtdb, `${QUIZZES_ROOT}/${sid}`);
    const unsub = onValue(r, (snap) => {
      cb(snap.val());
    });
    return unsub;
  },

  joinRoom: async (sid, name, avatar = '👤', playerId = null) => {
    const pid = String(playerId || '').trim() || push(ref(rtdb, `${QUIZZES_ROOT}/${sid}/players`)).key;
    const existingScoreSnap = await get(ref(rtdb, `${QUIZZES_ROOT}/${sid}/scores/${pid}`));

    await set(ref(rtdb, `${QUIZZES_ROOT}/${sid}/players/${pid}`), { name, avatar, joinedAt: Date.now() });
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}/scores/${pid}`), {
      name,
      avatar,
      score: existingScoreSnap.exists() ? Number(existingScoreSnap.val()?.score || 0) : 0
    });
    return pid;
  },

  leaveRoom: async (sid, pid) => {
    try { await remove(ref(rtdb, `${QUIZZES_ROOT}/${sid}/players/${pid}`)); } catch(e){}
  },

  submitAnswer: async (sid, qIdx, pid, answerIdx) => {
    const path = `${QUIZZES_ROOT}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const question = Array.isArray(session.questions) ? session.questions[qIdx] : null;
    if (!question) return false;

    const answeredAt = Date.now();
    const isCorrect = Number(answerIdx) === Number(question.correct);
    let awardedPoints = 0;

    if (isCorrect) {
      const totalMs = Math.max(5000, Number(question.time || 15) * 1000);
      const startAt = Number(session.activeQuestionStartedAt || answeredAt);
      const remaining = Math.max(0, (startAt + totalMs) - answeredAt);
      const speedRatio = Math.min(1, Math.max(0, remaining / totalMs));
      awardedPoints = Math.round(500 + (speedRatio * 500));
    }

    const { committed, snapshot } = await runTransaction(ref(rtdb, path), (currentData) => {
      if (currentData === null) {
        return {
          answer: answerIdx,
          answeredAt,
          isCorrect,
          awardedPoints,
        };
      }
      return; // abort transaction if data already exists
    });

    return committed;
  },

  submitWordCloudAnswer: async (sid, qIdx, pid, words) => {
    const path = `${QUIZZES_ROOT}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const existingAnswerSnap = await get(ref(rtdb, path));
    if (existingAnswerSnap.exists()) return false;

    await set(ref(rtdb, path), {
      words: Array.isArray(words) ? words.map(w => String(w).trim()).filter(Boolean) : [],
      answeredAt: Date.now()
    });
    return true;
  },

  submitOpenEndedAnswer: async (sid, qIdx, pid, text) => {
    const path = `${QUIZZES_ROOT}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const existingAnswerSnap = await get(ref(rtdb, path));
    if (existingAnswerSnap.exists()) return false;

    await set(ref(rtdb, path), {
      text: String(text).trim(),
      answeredAt: Date.now()
    });
    return true;
  },

  submitScalesAnswer: async (sid, qIdx, pid, ratings) => {
    const path = `${QUIZZES_ROOT}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const existingAnswerSnap = await get(ref(rtdb, path));
    if (existingAnswerSnap.exists()) return false;

    await set(ref(rtdb, path), {
      ratings: Array.isArray(ratings) ? ratings.map(Number) : [],
      answeredAt: Date.now()
    });
    return true;
  },

  submitRankingAnswer: async (sid, qIdx, pid, ranks) => {
    const path = `${QUIZZES_ROOT}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const existingAnswerSnap = await get(ref(rtdb, path));
    if (existingAnswerSnap.exists()) return false;

    await set(ref(rtdb, path), {
      ranks: Array.isArray(ranks) ? ranks.map(Number) : [],
      answeredAt: Date.now()
    });
    return true;
  },

  submitQaQuestion: async (sid, name, avatar, text) => {
    const qaRef = push(ref(rtdb, `${QUIZZES_ROOT}/${sid}/qa`));
    await set(qaRef, {
      name: String(name),
      avatar: String(avatar),
      text: String(text).trim(),
      ts: Date.now(),
      answered: false
    });
    return qaRef.key;
  },

  toggleQaAnswered: async (sid, qid, answeredStatus) => {
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}/qa/${qid}`), {
      answered: Boolean(answeredStatus)
    });
  },

  toggleShowResults: async (sid, showResults) => {
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      showResults: Boolean(showResults)
    });
  },

  startQuestion: async (sid, qIdx = null) => {
    const session = await getSession(sid);
    if (!session) throw new Error('Room not found');

    const questions = Array.isArray(session.questions) ? session.questions : [];
    
    // Progress naturally from active slide or last completed reveal/leaderboard slide index
    const currentIndex = session.activeQuestionIndex != null ? Number(session.activeQuestionIndex) : (session.revealQuestionIndex != null ? Number(session.revealQuestionIndex) : -1);
    const nextIndex = qIdx == null ? (Number.isInteger(currentIndex) ? currentIndex + 1 : 0) : Number(qIdx);
    const nextQuestion = questions[nextIndex];

    if (!nextQuestion) {
      await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
        state: 'finished',
        activeQuestionIndex: null,
        activeQuestionStartedAt: null,
        activeQuestionEndsAt: null,
      });
      return null;
    }

    const startedAt = Date.now();
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      state: 'question',
      activeQuestionIndex: nextIndex,
      activeQuestionStartedAt: startedAt,
      activeQuestionEndsAt: startedAt + Math.max(5, Number(nextQuestion.time || 15) * 1000),
      revealQuestionIndex: null,
      revealCorrectIndex: null,
      revealEndsAt: null,
      showResults: false,
    });
    return nextIndex;
  },

  endQuestion: async (sid) => {
    const session = await getSession(sid);
    if (!session || !Number.isInteger(Number(session.activeQuestionIndex))) return null;
    const idx = Number(session.activeQuestionIndex);
    const question = Array.isArray(session.questions) ? session.questions[idx] : null;

    const updatedScores = { ...(session.scores || {}) };

    if (question && question.type === 'multiple-choice') {
      // First ensure all players in session exist in updatedScores with lastScore initialized
      if (session.players) {
        Object.keys(session.players).forEach(pid => {
          const currentScore = Number(updatedScores[pid]?.score || 0);
          updatedScores[pid] = {
            name: session.players[pid].name || 'Player',
            avatar: session.players[pid].avatar || '👤',
            lastScore: currentScore,
            roundPoints: 0,
            score: currentScore
          };
        });
      }

      const answersSnap = await get(ref(rtdb, `${QUIZZES_ROOT}/${sid}/answers/${idx}`));
      if (answersSnap.exists()) {
        const answers = answersSnap.val();
        Object.keys(answers).forEach((pid) => {
          const ans = answers[pid];
          if (ans.isCorrect && ans.awardedPoints > 0) {
            // Ensure they are initialized (just in case they joined late and aren't in session.players)
            if (!updatedScores[pid]) {
               updatedScores[pid] = { name: 'Player', avatar: '👤', lastScore: 0, roundPoints: 0, score: 0 };
            }
            updatedScores[pid].roundPoints = ans.awardedPoints;
            updatedScores[pid].score = updatedScores[pid].lastScore + ans.awardedPoints;
          }
        });
      }
    }

    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      state: 'reveal',
      revealQuestionIndex: idx,
      revealCorrectIndex: question && question.type === 'multiple-choice' ? Number(question.correct || 0) : null,
      revealEndsAt: Date.now() + 5000,
      activeQuestionEndsAt: null,
      scores: updatedScores,
    });
    return idx;
  },

  showLeaderboard: async (sid) => {
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      state: 'leaderboard'
    });
    return true;
  },

  clearReveal: async (sid) => {
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      state: 'lobby',
      activeQuestionIndex: null,
      activeQuestionStartedAt: null,
      activeQuestionEndsAt: null,
      revealQuestionIndex: null,
      revealCorrectIndex: null,
      revealEndsAt: null,
    });
  },

  resetRoom: async (sid) => {
    await update(ref(rtdb, `${QUIZZES_ROOT}/${sid}`), {
      state: 'lobby',
      activeQuestionIndex: null,
      activeQuestionStartedAt: null,
      activeQuestionEndsAt: null,
      revealQuestionIndex: null,
      revealCorrectIndex: null,
      revealEndsAt: null,
      scores: {},
      players: {},
      answers: {},
      qa: {},
      showResults: true,
    });
  },

  // Maintain backwards compatibility with legacy window handles
  createSession: async (p) => window.quiz.createRoom(p),
  joinSession: async (sid, name) => window.quiz.joinRoom(sid, name),
  leaveSession: async (sid, pid) => window.quiz.leaveRoom(sid, pid),
  onSessionUpdate: (sid, cb) => window.quiz.onRoomUpdate(sid, cb),
  resetSession: async (sid) => window.quiz.resetRoom(sid)
};




    document.body.classList.add('quiz-page');

    const ui = {
      joinCard: document.getElementById('joinCard'),
      quizRoot: document.getElementById('quizRoot'),
      joinBtn: document.getElementById('joinBtn'),
      leaveBtn: document.getElementById('leaveBtn'),
      optionList: document.getElementById('optionList'),
      avatarPickerGrid: document.getElementById('avatarPickerGrid'),
      playerInputContainer: document.getElementById('playerInputContainer')
    };

    const state = {
      sessionId: null,
      playerId: null,
      playerName: 'Player',
      playerAvatar: '🐯',
      selectedAnswer: null,
      submitted: false,
      currentQuestion: null,
      currentIndex: null,
      timerInterval: null,
      unsubscribe: null,
      snapshot: null,
      revealClearTimeout: null,
      scalesRatings: {}, // Temp cache for rating scales statements
      rankingOrder: {},  // Temp cache for ordering choices
      revealSoundPlayed: false,
    };

    const PLAYER_SESSION_KEY = 'workmesh_quiz_player_session';

    function savePlayerSession() {
      if (!state.sessionId || !state.playerId) return;
      localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify({
        sessionId: state.sessionId,
        playerId: state.playerId,
        playerName: state.playerName,
        playerAvatar: state.playerAvatar
      }));
    }

    function clearPlayerSession() {
      localStorage.removeItem(PLAYER_SESSION_KEY);
    }

    function readPlayerSession() {
      try {
        return JSON.parse(localStorage.getItem(PLAYER_SESSION_KEY) || 'null');
      } catch {
        return null;
      }
    }

    const AVATARS = ['🐯', '🚀', '🐼', '🦖', '🍕', '🎉', '🐙', '🍦', '🍩', '🥑', '👽', '🍿', '🦄', '🐱', '🦊', '🦁'];

    // Setup Avatar Picker Grid
    ui.avatarPickerGrid.innerHTML = AVATARS.map((avatar, idx) => `
      <div class="avatar-item ${idx === 0 ? 'selected' : ''}" data-avatar="${avatar}">${avatar}</div>
    `).join('');

    ui.avatarPickerGrid.querySelectorAll('.avatar-item').forEach(el => {
      el.addEventListener('click', () => {
        ui.avatarPickerGrid.querySelectorAll('.avatar-item').forEach(item => item.classList.remove('selected'));
        el.classList.add('selected');
        state.playerAvatar = el.getAttribute('data-avatar');
        savePlayerSession();
        playBeep(600, 0.05);
      });
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) document.getElementById('sessionCode').value = params.get('code');
    if (params.get('name')) document.getElementById('playerName').value = params.get('name');

    const savedSession = readPlayerSession();
    if (savedSession) {
      if (savedSession.playerAvatar) {
        state.playerAvatar = savedSession.playerAvatar;
        ui.avatarPickerGrid.querySelectorAll('.avatar-item').forEach(item => {
          item.classList.toggle('selected', item.getAttribute('data-avatar') === savedSession.playerAvatar);
        });
      }
      if (savedSession.playerId) state.playerId = savedSession.playerId;
      if (savedSession.playerName) {
        state.playerName = savedSession.playerName;
        document.getElementById('playerName').value = savedSession.playerName;
      }
      if (savedSession.sessionId) {
        document.getElementById('sessionCode').value = savedSession.sessionId;
      }
    }

    // Beep sound generators using Web Audio Context
    function playBeep(freq, dur) {
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + dur);
      } catch (e) {}
    }

    function stopTimer() {
      if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
      }
    }

    function setHeader(snapshot) {
      document.getElementById('sessionChip').innerText = state.sessionId || '----';
      document.getElementById('stateChip').innerText = snapshot?.state || 'lobby';
    }

    function renderLeaderboard(snapshot) {
      const scores = snapshot?.scores || {};
      const items = Object.keys(scores)
        .map((playerId) => ({ 
          name: scores[playerId].name, 
          avatar: scores[playerId].avatar || '👤',
          score: scores[playerId].score 
        }))
        .sort((a, b) => b.score - a.score);

      document.getElementById('leaderboardList').innerHTML = items.length
        ? items.map((entry, index) => `
            <li style="display:flex; justify-content:space-between; background:#ffffff; border:1px solid var(--border); padding:6px 12px; border-radius:10px; font-size:0.9rem;">
              <span>${index + 1}. ${entry.avatar} ${entry.name}</span>
              <strong style="color:var(--primary); font-family:'Roboto Mono';">${entry.score} pts</strong>
            </li>
          `).join('')
        : '<li class="quiz-mini-note">No scores recorded.</li>';
    }

    function maybeAutoClearReveal(snapshot) {
      return;
    }

    function updateTimer(snapshot, question) {
      stopTimer();
      if (!snapshot || !question || snapshot.state !== 'question' || snapshot.activeQuestionEndsAt == null) {
        document.getElementById('playerTimer').innerText = '--';
        document.getElementById('timerFill').style.width = '0%';
        return;
      }

      const endsAt = Number(snapshot.activeQuestionEndsAt);
      const startedAt = Number(snapshot.activeQuestionStartedAt || (endsAt - question.time * 1000));
      const totalMs = Math.max(5000, Number(question.time || 15) * 1000);

      const tick = () => {
        const remaining = Math.max(0, endsAt - Date.now());
        const elapsed = Math.max(0, Date.now() - startedAt);
        const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
        document.getElementById('playerTimer').innerText = `${Math.ceil(remaining / 1000)}s`;
        document.getElementById('timerFill').style.width = `${pct}%`;
        
        if (remaining <= 0) {
          stopTimer();
          document.getElementById('playerHint').innerText = 'Time is up! Waiting for presenter to close round...';
          ui.playerInputContainer.querySelectorAll('button, input, select, textarea').forEach(el => el.disabled = true);
        }
      };

      tick();
      state.timerInterval = setInterval(tick, 100);
    }

    // Dynamic player input forms builder - Supports delayed reveals and sequential leaderboards!
    function renderQuestionForm(snapshot) {
      const index = Number(snapshot?.activeQuestionIndex ?? snapshot?.revealQuestionIndex);
      const question = snapshot?.questions?.[index] || null;
      const questionChanged = state.currentIndex !== index;
      const isReveal = snapshot?.state === 'reveal';
      const isLeaderboardState = snapshot?.state === 'leaderboard' || question?.type === 'leaderboard';
      const savedAnswer = snapshot?.answers?.[index]?.[state.playerId] || null;

      state.currentIndex = Number.isInteger(index) ? index : null;
      state.currentQuestion = question;
      state.snapshot = snapshot;

      if (questionChanged && snapshot?.state === 'question') {
        state.selectedAnswer = null;
        state.submitted = false;
        state.scalesRatings = {};
        state.rankingOrder = {};
        state.revealSoundPlayed = false;
        document.getElementById('answerState').innerText = 'Answered: No';
        document.getElementById('playerHint').innerText = 'Make a selection below to submit.';
      }

      if (savedAnswer && snapshot?.state === 'question') {
        state.submitted = true;
        if (typeof savedAnswer.answer === 'number') {
          state.selectedAnswer = Number(savedAnswer.answer);
        }
        if (Array.isArray(savedAnswer.ratings)) {
          state.scalesRatings = Object.fromEntries(savedAnswer.ratings.map((value, idx) => [idx, Number(value)]));
        }
        if (Array.isArray(savedAnswer.ranks)) {
          state.rankingOrder = savedAnswer.ranks.reduce((accumulator, optIdx, rankIdx) => {
            accumulator[Number(optIdx)] = Number(rankIdx);
            return accumulator;
          }, {});
        }
        document.getElementById('answerState').innerText = 'Answered: Yes';
        document.getElementById('playerHint').innerText = 'Response already locked in. Refresh-safe resume restored.';
      }

      document.getElementById('quizTitle').innerText = snapshot?.title || 'WorkMesh Presentation';
      document.getElementById('questionIndex').innerText = state.currentIndex != null ? String(state.currentIndex + 1) : '0';
      document.getElementById('roundStatus').innerText = snapshot?.state === 'question'
        ? `Enter response below. Time limit is active!`
        : snapshot?.state === 'reveal'
          ? 'Review slide outcomes / correct answers.'
          : snapshot?.state === 'leaderboard'
            ? 'Round scores committed! Check your rank.'
            : snapshot?.state === 'finished'
              ? 'Finished'
              : 'Waiting for presenter.';
      document.getElementById('roundMeta').innerText = question
        ? `Slide type: ${question.type.replace('-', ' ')} · ${question.time || 15}s limit`
        : 'Syncing next slide...';

      // 0. HANDLE LEADERBOARD STATE
      if (isLeaderboardState) {
        stopTimer();
        document.getElementById('playerTimer').innerText = 'Leader';
        document.getElementById('timerFill').style.width = '100%';
        
        const scores = snapshot.scores || {};
        const leaderboard = Object.keys(scores)
          .map((id) => ({ 
            id, 
            name: scores[id].name, 
            avatar: scores[id].avatar || '👤', 
            score: scores[id].score 
          }))
          .sort((a, b) => b.score - a.score);
        
        const totalPlayers = leaderboard.length;
        const playerRankIdx = leaderboard.findIndex(item => item.id === state.playerId);
        const playerRank = playerRankIdx !== -1 ? playerRankIdx + 1 : '--';
        const playerScore = playerRankIdx !== -1 ? leaderboard[playerRankIdx].score : 0;

        const leaderboardListHtml = leaderboard.slice(0, 5).map((entry, idx) => `
          <div style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid var(--border); padding:10px 16px; border-radius:12px; font-size:0.95rem; margin-top:8px; width:100%;">
            <span>${idx + 1}. ${entry.avatar} ${entry.name} ${idx === 0 ? '👑' : ''}</span>
            <strong style="color:var(--primary); font-family:'Roboto Mono';">${entry.score} pts</strong>
          </div>
        `).join('');

        ui.playerInputContainer.innerHTML = `
          <div class="results-hidden-overlay" style="border-top: 4px solid var(--primary); padding: 30px 20px; width:100%;">
            <div style="font-size: 3.2rem; margin-bottom: 10px;">🏆</div>
            <h2 style="color: var(--primary); font-size: 1.6rem; font-weight:800;">Round Leaderboard</h2>
            <p style="margin-top: 8px; font-weight:700; color:var(--text-main); font-size:1.1rem;">You are ranked <strong style="color:var(--accent); font-size: 1.5rem;">#${playerRank}</strong> out of ${totalPlayers} players!</p>
            <div class="badge-primary" style="margin-top:12px; font-family:'Roboto Mono'; font-size:1.1rem; padding: 6px 16px; border-radius:999px;">Total Score: ${playerScore} pts</div>
          </div>
          <div style="width: 100%; display: grid; gap: 8px; margin-top:20px;">
            <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Top 5 Leaders</h4>
            ${leaderboardListHtml}
          </div>
        `;
        document.getElementById('playerHint').innerText = "Get ready! Next round is starting soon...";
        return;
      }

      if (snapshot?.state === 'finished') {
        const scores = snapshot.scores || {};
        const leaderboard = Object.keys(scores)
          .map((id) => ({ id, score: scores[id].score }))
          .sort((a, b) => b.score - a.score);
        
        const playerRankIdx = leaderboard.findIndex(item => item.id === state.playerId);
        const playerRank = playerRankIdx !== -1 ? playerRankIdx + 1 : '--';
        const playerScore = playerRankIdx !== -1 ? leaderboard[playerRankIdx].score : 0;
        
        document.getElementById('questionText').innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 0; gap: 15px; text-align:center;">
            <div style="font-size: 4rem; margin-bottom:10px;">🏆</div>
            <h3 style="color:var(--primary); margin-bottom:8px; font-size:1.8rem; font-weight:900;">Quiz Completed!</h3>
            <p style="color:var(--text-muted); font-size:1.1rem; line-height:1.4;">Thank you for playing!</p>
            
            <div style="background:#ffffff; border:2px solid var(--border); border-radius:12px; padding:20px; margin-top:20px; width:100%;">
              <div style="font-size:0.9rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:10px;">Your Final Results</div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1.2rem; font-weight:800; color:var(--text-main);">Rank: #${playerRank}</span>
                <span style="font-size:1.2rem; font-weight:800; color:var(--primary);">${playerScore} pts</span>
              </div>
            </div>
            <a href="index.html" class="btn btn-primary" style="margin-top: 10px; width: 100%; text-decoration: none;">🎮 Back to Arcade Hub</a>
          </div>
        `;
        ui.playerInputContainer.innerHTML = '';
        updateTimer(snapshot, null);
        
        if (window.confetti && !state.finishedConfettiFired) {
          state.finishedConfettiFired = true;
          const end = Date.now() + 2500;
          (function frame() {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#3b82f6', '#f5a623', '#10b981', '#f43f5e'] });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#3b82f6', '#f5a623', '#10b981', '#f43f5e'] });
            if (Date.now() < end) requestAnimationFrame(frame);
          }());
        }
        
        return;
      }

      if (!question) {
        document.getElementById('questionText').innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 0; gap: 20px;">
            <div class="myhq-spinner" style="width: 48px; height: 48px; border: 4px solid var(--border); border-top: 4px solid var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="text-align:center;">
              <h3 style="color:var(--primary); margin-bottom:8px; font-size:1.4rem;">Get Ready!</h3>
              <p style="color:var(--text-muted); font-size:1.05rem; line-height:1.4;">THE QUIZ WILL BEGIN SHORTLY</p>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
          </div>
        `;
        ui.playerInputContainer.innerHTML = '';
        updateTimer(snapshot, null);
        maybeAutoClearReveal(snapshot);
        return;
      }

      document.getElementById('questionText').innerText = question.text || 'Untitled slide';

      // 1. MULTIPLE CHOICE
      if (question.type === 'multiple-choice') {
        const revealedCorrectIndex = Number(snapshot?.revealCorrectIndex ?? question?.correct ?? 0);
        
        ui.playerInputContainer.innerHTML = `<div id="optionList" class="quiz-answer-grid" style="width:100%;"></div>`;
        const optionList = document.getElementById('optionList');

        optionList.innerHTML = question.options.map((option, optionIndex) => {
          const letter = String.fromCharCode(65 + optionIndex);
          const selectedClass = Number(state.selectedAnswer) === optionIndex ? 'selected' : '';
          const correctClass = isReveal && optionIndex === revealedCorrectIndex ? 'correct' : '';
          const wrongClass = isReveal && state.selectedAnswer === optionIndex && optionIndex !== revealedCorrectIndex ? 'wrong' : '';
          
          return `
            <button class="quiz-option ${selectedClass} ${correctClass} ${wrongClass}" type="button" data-option="${optionIndex}" data-tone="${letter}" ${state.submitted || isReveal ? 'disabled' : ''}>
              <span class="quiz-option-flag ${letter.toLowerCase()}">${letter}</span>
              <span class="quiz-option-copy">
                <strong>${option}</strong>
                <span>${isReveal && optionIndex === revealedCorrectIndex ? 'Correct Answer' : state.submitted ? 'Locked In' : 'Tap to Select'}</span>
              </span>
            </button>`;
        }).join('');

        optionList.querySelectorAll('[data-option]').forEach((button) => {
          button.addEventListener('click', () => {
            if (snapshot?.state !== 'question' || state.submitted) return;
            state.selectedAnswer = Number(button.getAttribute('data-option'));
            document.getElementById('playerHint').innerText = `Locking in option ${String.fromCharCode(65 + state.selectedAnswer)}...`;
            optionList.querySelectorAll('.quiz-option').forEach((el) => el.classList.remove('selected'));
            button.classList.add('selected');

            window.quiz.submitAnswer(state.sessionId, state.currentIndex, state.playerId, state.selectedAnswer).then((ok) => {
              if (!ok) {
                document.getElementById('playerHint').innerText = 'Answer rejected. Make sure you are answering the active question.';
                return;
              }

              state.submitted = true;
              document.getElementById('answerState').innerText = 'Answered: Yes';
              document.getElementById('playerHint').innerText = `Response locked in! Waiting for the presenter to close the round...`;
              playBeep(880, 0.08); // simple confirmation beep
              optionList.querySelectorAll('.quiz-option').forEach(el => el.disabled = true);
            });
          });
        });

        // Mentimeter-like Delayed Answer Reveal Screen & Audience Statistics Breakdown
        if (isReveal) {
          const isCorrect = state.selectedAnswer === revealedCorrectIndex;
          const correctLetter = String.fromCharCode(65 + revealedCorrectIndex);

          // Play reveal sound once
          if (!state.revealSoundPlayed) {
            if (state.selectedAnswer !== null) {
              if (isCorrect) {
                playSuccessSound();
              } else {
                playBeep(300, 0.15); // buzz buzzer sound
              }
            }
            state.revealSoundPlayed = true;
          }

          document.getElementById('playerTimer').innerText = 'Reveal';
          document.getElementById('timerFill').style.width = '100%';

          let feedbackHtml = '';
          const playerRoundPoints = snapshot.scores?.[state.playerId]?.roundPoints || 0;
          if (state.selectedAnswer !== null) {
            feedbackHtml = isCorrect 
              ? `<div style="color: #22c55e; font-weight: 800; font-size: 1.25rem; margin-bottom: 8px;">🎉 Correct! +${playerRoundPoints} pts</div>`
              : `<div style="color: #ef4444; font-weight: 800; font-size: 1.25rem; margin-bottom: 8px;">❌ Incorrect answer!</div>`;
          } else {
            feedbackHtml = `<div style="color: #f5a623; font-weight: 800; font-size: 1.25rem; margin-bottom: 8px;">⏱️ Time ran out!</div>`;
          }

          // Compute option statistics for this slide, matching admin visualizer breakdown
          const answersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
          const answerKeys = Object.keys(answersObj);
          const choiceCounts = [0, 0, 0, 0];
          answerKeys.forEach(k => {
            const idx = Number(answersObj[k].answer);
            if (idx >= 0 && idx < 4) choiceCounts[idx] += 1;
          });

          const totalVotes = choiceCounts.reduce((a, b) => a + b, 0);
          const colors = [
            ['#2563eb', '#60a5fa'], // blue
            ['#06b6d4', '#5eead4'], // cyan
            ['#7c3aed', '#a78bfa'], // purple
            ['#f43f5e', '#fb7185']  // rose
          ];

          let chartBarsHtml = (question.options || []).map((option, idx) => {
            const val = choiceCounts[idx];
            const pct = totalVotes > 0 ? (val / totalVotes) * 100 : 0;
            const letter = String.fromCharCode(65 + idx);
            const isCorrectOption = idx === revealedCorrectIndex;
            const isPlayerSelected = Number(state.selectedAnswer) === idx;

            return `
              <div style="margin-top: 8px; display: grid; grid-template-columns: 32px 1fr 50px; gap: 12px; align-items: center; background: ${isCorrectOption ? 'rgba(34,197,94,0.06)' : isPlayerSelected ? 'rgba(30,78,216,0.04)' : '#ffffff'}; border: 1px solid ${isCorrectOption ? '#22c55e' : isPlayerSelected ? 'var(--primary)' : 'var(--border)'}; padding: 10px 14px; border-radius: 12px; transition: all 0.2s ease; width:100%;">
                <span style="font-weight:800; color: ${isCorrectOption ? '#22c55e' : 'var(--text-main)'}; font-size:0.95rem; align-self:start;">${letter}</span>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:700; color:var(--text-main); font-size:0.9rem; overflow-wrap:anywhere; word-break:break-word; white-space:normal; line-height:1.35;">${option}</div>
                  <div style="height: 6px; background: rgba(30,78,216,0.06); border-radius:999px; margin-top: 6px; overflow:hidden;">
                    <div style="height:100%; width: ${pct}%; background: linear-gradient(90deg, ${colors[idx][0]}, ${colors[idx][1]}); border-radius:inherit; transition: width 0.5s ease;"></div>
                  </div>
                </div>
                <span style="text-align:right; font-family:'Roboto Mono'; font-weight:700; font-size:0.8rem; color:var(--text-muted);">${val} (${Math.round(pct)}%)</span>
              </div>
            `;
          }).join('');

          // Show exact vote distribution breakdown on Player Screen under the answer feedback!
          ui.playerInputContainer.innerHTML = `
            <div style="width: 100%; display: grid; gap: 8px; margin-bottom:12px;">
              <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Audience Vote Distribution</h4>
              ${chartBarsHtml}
            </div>
          `;

          document.getElementById('playerHint').innerHTML = `
            ${feedbackHtml}
            <div class="quiz-reveal-answer" style="color: var(--text-main); font-size: 1.8rem; margin: 10px 0;">
              ${correctLetter}. ${question.options[revealedCorrectIndex] || 'Correct answer'}
            </div>
            <div style="margin-top:6px; color: var(--text-muted);">The correct answer has been revealed! Host is showing the scoreboard next...</div>`;
        } else {
          state.revealSoundPlayed = false; // reset for next round
          updateTimer(snapshot, question);
        }
      }
      // 2. WORD CLOUD
      else if (question.type === 'word-cloud') {
        if (isReveal) {
          const answersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
          const answerKeys = Object.keys(answersObj);
          const wordCounts = {};
          answerKeys.forEach(k => {
            const words = answersObj[k].words || [];
            words.forEach(w => {
              const clean = String(w).trim().toLowerCase();
              if (clean) wordCounts[clean] = (wordCounts[clean] || 0) + 1;
            });
          });

          const wordEntries = Object.entries(wordCounts).sort((a,b) => b[1] - a[1]);
          const maxCount = wordEntries.length > 0 ? wordEntries[0][1] : 1;
          const niceColors = ['#1e4ed8', '#7b61ff', '#f43f5e', '#ff8e53', '#009bb1', '#a78bfa', '#00bcd4'];
          
          let cloudHtml = wordEntries.map(([word, count]) => {
            const scale = maxCount > 1 ? (count - 1) / (maxCount - 1) : 0;
            const fontSize = 0.95 + scale * 1.5; // mobile font scale
            const randColor = niceColors[Math.floor(Math.random() * niceColors.length)];
            const randRot = (Math.random() * 8 - 4) + 'deg';
            return `<span class="word-cloud-item" style="font-size: ${fontSize}rem; color: ${randColor}; --rand-rot: ${randRot}; transform: rotate(${randRot}); display: inline-block; margin: 4px; padding: 4px 10px; background: rgba(255,255,255,0.9); border: 1px solid var(--border); border-radius: 999px;">${word}</span>`;
          }).join('');

          ui.playerInputContainer.innerHTML = `
            <div style="width: 100%; display: grid; gap: 8px;">
              <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Audience Word Cloud</h4>
              <div class="word-cloud-container" style="min-height: 200px; padding: 20px; border-radius: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; background: rgba(255,255,255,0.6); border: 1px solid var(--border); gap: 10px;">
                ${cloudHtml || '<div class="quiz-mini-note" style="overflow-wrap:anywhere; word-break:break-word; white-space:normal;">No words submitted yet.</div>'}
              </div>
            </div>
          `;
          document.getElementById('playerHint').innerText = "The round has ended! Watch the host screen for scores.";
        } else if (state.submitted) {
          ui.playerInputContainer.innerHTML = `
            <div class="results-hidden-overlay">
              <h3 style="color:var(--primary);">🚀 Words Submitted!</h3>
              <p class="quiz-mini-note" style="margin-top: 10px;">Look at the presenter stage screen to see your words floating dynamically in the Word Cloud!</p>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Look up at the presentation word cloud!";
        } else {
          ui.playerInputContainer.innerHTML = `
            <div style="display:grid; gap:12px; width:100%;">
              <input type="text" id="wcWord1" placeholder="Enter first word (max 15 chars)" maxlength="15">
              <input type="text" id="wcWord2" placeholder="Enter second word (Optional)" maxlength="15">
              <input type="text" id="wcWord3" placeholder="Enter third word (Optional)" maxlength="15">
              <button class="btn btn-primary" id="submitWordCloudBtn" type="button" style="margin-top:10px;">Submit Words</button>
            </div>
          `;

          document.getElementById('submitWordCloudBtn').addEventListener('click', async () => {
            const w1 = document.getElementById('wcWord1').value.trim();
            const w2 = document.getElementById('wcWord2').value.trim();
            const w3 = document.getElementById('wcWord3').value.trim();

            if (!w1) return alert('Enter at least one word.');

            const words = [w1, w2, w3].filter(Boolean);
            const ok = await window.quiz.submitWordCloudAnswer(state.sessionId, state.currentIndex, state.playerId, words);
            if (ok) {
              state.submitted = true;
              playBeep(880, 0.08);
              document.getElementById('answerState').innerText = 'Answered: Yes';
              renderQuestionForm(state.snapshot);
            }
          });
        }
        updateTimer(snapshot, question);
      }
      // 3. OPEN ENDED
      else if (question.type === 'open-ended') {
        if (isReveal) {
          const answersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
          const answerKeys = Object.keys(answersObj);
          const noteColors = ['#fff9db', '#ffe3e3', '#e8f7ff', '#ebfbee', '#f3f0ff', '#fff4e6'];
          
          let cardsHtml = answerKeys.map((k, idx) => {
            const text = answersObj[k].text || '';
            const player = snapshot.players?.[k] || { name: 'Audience member', avatar: '👤' };
            const randColor = noteColors[idx % noteColors.length];
            const randRot = (Math.random() * 6 - 3) + 'deg';
            return `
              <div class="open-ended-card" style="background: ${randColor}; transform: rotate(${randRot}); border-top: 4px solid rgba(0,0,0,0.05); padding: 12px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); font-size: 0.9rem;">
                <p style="font-weight:600; color:var(--text-main); margin-bottom: 8px;">${text}</p>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color: rgba(0,0,0,0.4); font-weight:700;">
                  <span>${player.avatar} ${player.name}</span>
                  <span>💬</span>
                </div>
              </div>
            `;
          }).join('');

          ui.playerInputContainer.innerHTML = `
            <div style="width: 100%; display: grid; gap: 8px;">
              <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Brainstorm Answers</h4>
              <div class="open-ended-grid" style="grid-template-columns: 1fr; gap: 12px; max-height: 300px; overflow-y: auto; display:grid;">
                ${cardsHtml || '<div class="quiz-mini-note">No ideas submitted yet.</div>'}
              </div>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Brainstorming closed. The host is about to show ranks!";
        } else if (state.submitted) {
          ui.playerInputContainer.innerHTML = `
            <div class="results-hidden-overlay">
              <h3 style="color:var(--accent);">📝 Response Submitted!</h3>
              <p class="quiz-mini-note" style="margin-top: 10px;">Your thoughts have been pinned to the presenter's brainstorming grid.</p>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Locked in. Look at the presenter board!";
        } else {
          ui.playerInputContainer.innerHTML = `
            <div style="display:grid; gap:12px; width:100%;">
              <textarea id="oeText" rows="4" placeholder="Type your ideas or comments here... (max 150 characters)" maxlength="150"></textarea>
              <button class="btn btn-primary" id="submitOeBtn" type="button">Send Response</button>
            </div>
          `;

          document.getElementById('submitOeBtn').addEventListener('click', async () => {
            const text = document.getElementById('oeText').value.trim();
            if (!text) return alert('Type something to submit!');

            const ok = await window.quiz.submitOpenEndedAnswer(state.sessionId, state.currentIndex, state.playerId, text);
            if (ok) {
              state.submitted = true;
              playBeep(880, 0.08);
              document.getElementById('answerState').innerText = 'Answered: Yes';
              renderQuestionForm(state.snapshot);
            }
          });
        }
        updateTimer(snapshot, question);
      }
      // 4. SCALES
      else if (question.type === 'scales') {
        if (isReveal) {
          const answersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
          const answerKeys = Object.keys(answersObj);
          const statements = question.statements || [];
          const statementSums = Array(statements.length).fill(0);
          const statementVotes = Array(statements.length).fill(0);

          answerKeys.forEach(k => {
            const ratings = answersObj[k].ratings || [];
            ratings.forEach((val, rIdx) => {
              if (rIdx < statements.length) {
                statementSums[rIdx] += Number(val || 0);
                statementVotes[rIdx] += 1;
              }
            });
          });

          let rowsHtml = statements.map((stmt, idx) => {
            const sum = statementSums[idx];
            const votes = statementVotes[idx];
            const avg = votes > 0 ? (sum / votes) : 0;
            const pct = (avg / 5) * 100;

            return `
              <div class="scales-row" style="display:grid; grid-template-columns: 1fr; gap: 10px; padding: 12px 14px; border-radius: 14px; background:#f8faff; border: 1px solid var(--border); width: 100%;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                  <span class="scales-label" style="font-size:0.9rem; font-weight:700;">${stmt}</span>
                  <span style="font-weight: 800; color: var(--primary); font-family: 'Roboto Mono', monospace; font-size:0.95rem; white-space:normal; overflow-wrap:anywhere; word-break:break-word;">${avg > 0 ? avg.toFixed(1) + ' ★' : 'No ratings'}</span>
                </div>
                <div class="scales-slider-bg" style="height:10px; width:100%; background:rgba(30,78,216,0.06); border-radius:999px; position:relative; overflow:visible;">
                  <div class="scales-slider-fill" style="height:100%; border-radius:inherit; background:linear-gradient(90deg, var(--primary), var(--accent)); width: ${pct}%;"></div>
                  <div class="scales-avg-node" style="position:absolute; top:-5px; width:20px; height:20px; border-radius:50%; background:#fff; border:3px solid var(--primary); display:grid; place-items:center; font-size:0.6rem; font-weight:800; color:var(--primary); left: ${pct}%; transform:translateX(-50%);">${avg.toFixed(1)}</div>
                </div>
              </div>
            `;
          }).join('');

          ui.playerInputContainer.innerHTML = `
            <div style="width: 100%; display: grid; gap: 8px;">
              <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Star Averages Chart</h4>
              <div class="scales-container" style="gap: 10px; margin-top: 5px; display:grid;">
                ${rowsHtml}
              </div>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Star ratings closed. Leaderboard is coming up next!";
        } else if (state.submitted) {
          ui.playerInputContainer.innerHTML = `
            <div class="results-hidden-overlay">
              <h3 style="color:var(--primary);">⭐️ Ratings Submitted!</h3>
              <p class="quiz-mini-note" style="margin-top: 10px;">Your rating points have been added to the sliding averages graph.</p>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Locked in. Thanks for rating!";
        } else {
          const statements = question.statements || [];
          
          let listHtml = statements.map((stmt, idx) => `
            <div class="scales-input-row" data-stmt-idx="${idx}">
              <strong>${stmt}</strong>
              <div class="star-rating-buttons">
                <button class="star-btn" data-val="1">★</button>
                <button class="star-btn" data-val="2">★</button>
                <button class="star-btn" data-val="3">★</button>
                <button class="star-btn" data-val="4">★</button>
                <button class="star-btn" data-val="5">★</button>
              </div>
            </div>
          `).join('');

          ui.playerInputContainer.innerHTML = `
            <div class="scales-input-container">
              ${listHtml}
              <button class="btn btn-primary" id="submitScalesBtn" type="button" style="margin-top:10px;">Submit Star Ratings</button>
            </div>
          `;

          ui.playerInputContainer.querySelectorAll('.scales-input-row').forEach(row => {
            const stmtIdx = Number(row.getAttribute('data-stmt-idx'));
            state.scalesRatings[stmtIdx] = 5;

            row.querySelectorAll('.star-btn').forEach(btn => {
              btn.addEventListener('click', () => {
                const val = Number(btn.getAttribute('data-val'));
                state.scalesRatings[stmtIdx] = val;
                
                row.querySelectorAll('.star-btn').forEach(star => {
                  const starVal = Number(star.getAttribute('data-val'));
                  if (starVal <= val) {
                    star.classList.add('active');
                  } else {
                    star.classList.remove('active');
                  }
                });
                playBeep(700, 0.04);
              });
            });

            row.querySelectorAll('.star-btn').forEach(star => {
              if (Number(star.getAttribute('data-val')) <= 5) star.classList.add('active');
            });
          });

          document.getElementById('submitScalesBtn').addEventListener('click', async () => {
            const ratings = statements.map((_, idx) => state.scalesRatings[idx] || 5);
            const ok = await window.quiz.submitScalesAnswer(state.sessionId, state.currentIndex, state.playerId, ratings);
            if (ok) {
              state.submitted = true;
              playBeep(880, 0.08);
              document.getElementById('answerState').innerText = 'Answered: Yes';
              renderQuestionForm(state.snapshot);
            }
          });
        }
        updateTimer(snapshot, question);
      }
      // 5. RANKING
      else if (question.type === 'ranking') {
        if (isReveal) {
          const answersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
          const answerKeys = Object.keys(answersObj);
          const options = question.options || [];
          const optionScores = Array(options.length).fill(0);

          answerKeys.forEach(k => {
            const ranks = answersObj[k].ranks || [];
            ranks.forEach((optIdx, preferenceIdx) => {
              if (optIdx >= 0 && optIdx < options.length) {
                const weight = options.length - preferenceIdx;
                optionScores[optIdx] += weight;
              }
            });
          });

          const rankingList = options.map((opt, idx) => ({
            text: opt,
            score: optionScores[idx],
            index: idx
          })).sort((a, b) => b.score - a.score);

          const maxScore = rankingList.length > 0 ? rankingList[0].score : 1;

          let rowsHtml = rankingList.map((entry, rankIdx) => {
            const pct = maxScore > 0 ? (entry.score / maxScore) * 100 : 0;
            return `
              <div class="ranking-row" style="padding: 10px 14px; border-radius: 14px; background:#f8faff; border: 1px solid var(--border); display:flex; align-items:center; gap:12px; width:100%;">
                <div class="ranking-rank" style="width: 28px; height: 28px; font-size:0.85rem; border-radius: 8px; background:linear-gradient(135deg, var(--primary), var(--accent)); color:white; display:grid; place-items:center; font-weight:800;">${rankIdx + 1}</div>
                <span class="ranking-label" style="font-size:0.85rem; flex: 1 1 auto; text-align:left; font-weight:700; overflow-wrap:anywhere; word-break:break-word; white-space:normal; line-height:1.35;">${entry.text}</span>
                <div class="ranking-bar" style="height: 8px; flex:1; background:rgba(30,78,216,0.06); border-radius:999px; overflow:hidden;">
                  <div class="ranking-bar-fill" style="height:100%; background:linear-gradient(90deg, #7c3aed, #f43f5e); width: ${pct}%;"></div>
                </div>
                <span class="ranking-score" style="font-size:0.85rem; margin-left: 5px; font-family:'Roboto Mono'; font-weight:800; color:var(--primary);">${entry.score} pts</span>
              </div>
            `;
          }).join('');

          ui.playerInputContainer.innerHTML = `
            <div style="width: 100%; display: grid; gap: 8px;">
              <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Rank Outcomes Chart</h4>
              <div class="ranking-container" style="gap: 10px; margin-top: 5px; display:grid;">
                ${rowsHtml}
              </div>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Preference ranking closed. Check out the leaderboard next!";
        } else if (state.submitted) {
          ui.playerInputContainer.innerHTML = `
            <div class="results-hidden-overlay">
              <h3 style="color:#f43f5e;">📊 Rankings Submitted!</h3>
              <p class="quiz-mini-note" style="margin-top: 10px;">Watch the options swap heights on the presenter screen based on weighted ranks!</p>
            </div>
          `;
          document.getElementById('playerHint').innerText = "Locked in. Check out the leaderboard rankings!";
        } else {
          const choices = question.options || [];
          
          let rowsHtml = choices.map((opt, idx) => `
            <div class="ranking-input-row">
              <span>${opt}</span>
              <select class="ranking-select" data-opt-idx="${idx}">
                <option value="-1">Select Rank</option>
                ${choices.map((_, preferenceIdx) => `
                  <option value="${preferenceIdx}">${preferenceIdx + 1}${preferenceIdx === 0 ? 'st' : preferenceIdx === 1 ? 'nd' : preferenceIdx === 2 ? 'rd' : 'th'}</option>
                `).join('')}
              </select>
            </div>
          `).join('');

          ui.playerInputContainer.innerHTML = `
            <div class="ranking-input-container">
              ${rowsHtml}
              <button class="btn btn-primary" id="submitRankingBtn" type="button" style="margin-top:10px;">Submit Preferences</button>
            </div>
          `;

          const selects = ui.playerInputContainer.querySelectorAll('.ranking-select');
          selects.forEach(select => {
            select.addEventListener('change', () => {
              const optIdx = Number(select.getAttribute('data-opt-idx'));
              const val = Number(select.value);
              playBeep(700, 0.04);
            });
          });

          document.getElementById('submitRankingBtn').addEventListener('click', async () => {
            const chosenRanks = [];
            let isValid = true;
            
            selects.forEach(select => {
              const val = Number(select.value);
              if (val === -1) {
                isValid = false;
              }
              chosenRanks.push({ optIdx: Number(select.getAttribute('data-opt-idx')), val });
            });

            if (!isValid) return alert('Please assign a rank preference to all choices!');

            const values = chosenRanks.map(item => item.val);
            const duplicates = values.filter((item, index) => values.indexOf(item) !== index);
            if (duplicates.length > 0) return alert('Rank preferences must be unique! Each option needs a different place.');

            const ranks = Array(choices.length).fill(0);
            chosenRanks.forEach(item => {
              ranks[item.val] = item.optIdx;
            });

            const ok = await window.quiz.submitRankingAnswer(state.sessionId, state.currentIndex, state.playerId, ranks);
            if (ok) {
              state.submitted = true;
              playBeep(880, 0.08);
              document.getElementById('answerState').innerText = 'Answered: Yes';
              renderQuestionForm(state.snapshot);
            }
          });
        }
        updateTimer(snapshot, question);
      }

      maybeAutoClearReveal(snapshot);

      if (state.submitted && snapshot?.state !== 'reveal' && snapshot?.state !== 'leaderboard') {
        document.getElementById('answerState').innerText = 'Answered: Yes';
      }
    }

    function watchRoom(sessionId) {
      if (state.unsubscribe) state.unsubscribe();
      let rAF = null;
      let pendingSnapshot = null;
      state.unsubscribe = window.quiz.onRoomUpdate(sessionId, (snapshot) => {
        pendingSnapshot = snapshot;
        if (!rAF) {
          rAF = requestAnimationFrame(() => {
            rAF = null;
            const snap = pendingSnapshot;
            state.snapshot = snap;
            setHeader(snap);
            renderLeaderboard(snap);
            renderQuestionForm(snap);
          });
        }
      });
    }

    ui.joinBtn.addEventListener('click', async () => {
      try {
        const name = document.getElementById('playerName').value.trim() || 'Anonymous Player';
        const code = document.getElementById('sessionCode').value.trim().toUpperCase();
        if (!code) return alert('Enter the Room code.');

        state.sessionId = code;
        state.playerName = name;
        
        state.playerId = await window.quiz.joinRoom(code, name, state.playerAvatar, state.playerId);
        
        ui.joinCard.style.display = 'none';
        ui.quizRoot.style.display = 'grid';
        setHeader({ state: 'lobby' });
        savePlayerSession();

        const url = new URL(window.location.href);
        url.searchParams.set('code', code);
        url.searchParams.set('name', name);
        history.replaceState({}, '', url);

        playSuccessSound();
        watchRoom(code);
      } catch (e) {
        alert('Error joining room: ' + (e.message || e));
      }
    });

    ui.leaveBtn.addEventListener('click', () => {
      if (state.sessionId && state.playerId) {
        window.quiz.leaveRoom(state.sessionId, state.playerId);
      }
      clearPlayerSession();
      location.reload();
    });

    async function resumeSavedSession() {
      const saved = readPlayerSession();
      if (!saved?.sessionId || !saved?.playerName) return;

      const code = String(saved.sessionId).trim().toUpperCase();
      const playerName = String(saved.playerName).trim() || 'Anonymous Player';
      const avatar = String(saved.playerAvatar || state.playerAvatar || '🐯');

      document.getElementById('sessionCode').value = code;
      document.getElementById('playerName').value = playerName;
      state.playerAvatar = avatar;
      ui.avatarPickerGrid.querySelectorAll('.avatar-item').forEach(item => {
        item.classList.toggle('selected', item.getAttribute('data-avatar') === avatar);
      });

      try {
        state.sessionId = code;
        state.playerName = playerName;
        state.playerId = saved.playerId || null;
        state.playerId = await window.quiz.joinRoom(code, playerName, avatar, state.playerId);
        savePlayerSession();

        ui.joinCard.style.display = 'none';
        ui.quizRoot.style.display = 'grid';
        setHeader({ state: 'lobby' });
        watchRoom(code);
      } catch (error) {
        console.warn('Could not resume saved quiz session:', error);
        clearPlayerSession();
      }
    }

    resumeSavedSession();
  
