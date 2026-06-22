  <script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, push, set, update, onValue, get, remove, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAgXQe9wpVC5hrL053DNOX06x2C9oYIcEo",
  authDomain: "workmesh-ad848.firebaseapp.com",
  databaseURL: "https://workmesh-ad848-default-rtdb.asia-southeast1.firebasedatabase.app",
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
    const urlParams = new URLSearchParams(window.location.search);
    const isPresentMode = urlParams.get('present') === 'true';
    if (isPresentMode) {
      document.body.classList.add('present-mode');
    }

    const ADMIN_EMAIL_ALLOWLIST = ['admin@myhq.in'];

    const ui = {
      createSessionBtn: document.getElementById('createSessionBtn'),
      copyShareLinkBtn: document.getElementById('copyShareLinkBtn'),
      sidebarPrevBtn: document.getElementById('sidebarPrevBtn'),
      sidebarNextBtn: document.getElementById('sidebarNextBtn'),
      sidebarPresentBtn: document.getElementById('sidebarPresentBtn'),
      sidebarProjectorBtn: document.getElementById('sidebarProjectorBtn'),
      quickSlideController: document.getElementById('quickSlideController'),
      endQuestionBtn: document.getElementById('endQuestionBtn'),
      showLeaderboardBtn: document.getElementById('showLeaderboardBtn'),
      toggleResultsBtn: document.getElementById('toggleResultsBtn'),
      toggleResultsText: document.getElementById('toggleResultsText'),
      resetQuizBtn: document.getElementById('resetQuizBtn'),
      addNewSlideBtn: document.getElementById('addNewSlideBtn'),
      sessionCodeDisplay: document.getElementById('sessionCodeDisplay'),
      quizStateDisplay: document.getElementById('quizStateDisplay'),
      activeQuestionDisplay: document.getElementById('activeQuestionDisplay'),
      playerCountDisplay: document.getElementById('playerCountDisplay'),
      questionQueue: document.getElementById('questionQueue'),
      previewQuestion: document.getElementById('previewQuestion'),
      previewOptions: document.getElementById('previewOptions'),
      previewTimer: document.getElementById('previewTimer'),
      previewProgress: document.getElementById('previewProgress'),
      liveStateChip: document.getElementById('liveStateChip'),
      hostTimer: document.getElementById('hostTimer'),
      liveLeaderboard: document.getElementById('liveLeaderboard'),
      liveReveal: document.getElementById('liveReveal'),
      previewMeta: document.getElementById('previewMeta'),
      slideType: document.getElementById('slideType'),
      presenterStageLabel: document.getElementById('presenterStageLabel'),
      visualizerContainer: document.getElementById('visualizerContainer'),
      qaToggle: document.getElementById('qaToggle'),
      qaDrawer: document.getElementById('qaDrawer'),
      qaClose: document.getElementById('qaClose'),
      qaList: document.getElementById('qaList'),
      qaCount: document.getElementById('qaCount'),
      presenterStage: document.getElementById('presenterStage'),
      togglePresentBtn: document.getElementById('togglePresentBtn'),
      composerTitle: document.getElementById('composerTitle'),
      presenterToolbar: document.getElementById('presenterToolbar'),
      toolbarPrev: document.getElementById('toolbarPrev'),
      toolbarNext: document.getElementById('toolbarNext'),
      toolbarResults: document.getElementById('toolbarResults'),
      toolbarClose: document.getElementById('toolbarClose'),
      toolbarLeaderboard: document.getElementById('toolbarLeaderboard'),
      toolbarExit: document.getElementById('toolbarExit'),
      composerQuestionText: document.getElementById('composerQuestionText'),
      copyShareLinkBtnSidebar: document.getElementById('copyShareLinkBtnSidebar'),
      composerDynamicFields: document.getElementById('composerDynamicFields'),
      noSlideSelectedPlaceholder: document.getElementById('noSlideSelectedPlaceholder'),
      slideSettingsPanel: document.getElementById('slideSettingsPanel'),
      tabBtnComposer: document.getElementById('tabBtnComposer')
    };

    const state = {
      sessionId: null,
      questions: [],
      unsubscribe: null,
      session: null,
      revealClearTimeout: null,
      timerTickInterval: null,
      editingIndex: null, // Tracks active index slide being edited
      winnersFanfarePlayed: false,
      renderedLobbyPlayers: new Set()
    };

    window.activateTab = (tabId) => {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
      });
      const tabIdMap = {
        'control-room': 'tabContentControlRoom',
        'composer': 'tabContentComposer',
        'standings': 'tabContentStandings'
      };
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabIdMap[tabId]);
      });
    };

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.activateTab(btn.getAttribute('data-tab'));
      });
    });

    function isDeckLocked(snapshot = state.session) {
      return Boolean(snapshot && snapshot.state !== 'lobby' && snapshot.state !== 'finished');
    }

    const HOST_SESSION_KEY = 'myhq_quiz_host_session';

    function saveHostSession() {
      if (!state.sessionId) return;
      localStorage.setItem(HOST_SESSION_KEY, JSON.stringify({
        sessionId: state.sessionId,
        roomCode: document.getElementById('roomCodeInput')?.value?.trim() || '',
        roomTitle: document.getElementById('quizTitle')?.value?.trim() || ''
      }));
    }

    function clearHostSession() {
      localStorage.removeItem(HOST_SESSION_KEY);
    }

    function readHostSession() {
      try {
        return JSON.parse(localStorage.getItem(HOST_SESSION_KEY) || 'null');
      } catch {
        return null;
      }
    }

    function resumeHostSession() {
      const urlParams = new URLSearchParams(window.location.search);
      const isPresentMode = urlParams.get('present') === 'true';
      if (isPresentMode) {
        const codeParam = urlParams.get('code');
        if (codeParam) {
          state.sessionId = codeParam.toUpperCase();
          ui.sessionCodeDisplay.innerText = state.sessionId;
          wireRoom(state.sessionId);
          return;
        }
      }

      const saved = readHostSession();
      if (!saved?.sessionId) return;

      state.sessionId = String(saved.sessionId).trim().toUpperCase();
      if (saved.roomCode && document.getElementById('roomCodeInput')) {
        document.getElementById('roomCodeInput').value = String(saved.roomCode).trim().toUpperCase();
      }
      if (saved.roomTitle && document.getElementById('quizTitle')) {
        document.getElementById('quizTitle').value = saved.roomTitle;
      }

      ui.sessionCodeDisplay.innerText = state.sessionId;
      if (ui.copyShareLinkBtn) ui.copyShareLinkBtn.style.display = 'inline-block';
      wireRoom(state.sessionId);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function syncCorrectAnswerDropdown(question) {
      const correctSelect = document.getElementById('correctAnswer');
      if (!correctSelect) return;
      const opts = question.options || [];
      const currentValue = correctSelect.value;
      
      let html = '';
      opts.forEach((opt, idx) => {
        const letter = String.fromCharCode(65 + idx);
        html += `<option value="${idx}">Option ${letter}</option>`;
      });
      correctSelect.innerHTML = html;
      
      if (Number(currentValue) < opts.length) {
        correctSelect.value = currentValue;
      } else {
        correctSelect.value = String(question.correct || 0);
      }
    }

    function renderComposerDynamicFields(question) {
      const type = question.type || 'multiple-choice';
      const container = ui.composerDynamicFields;
      const label = document.getElementById('choiceInputsLabel');
      const locked = isDeckLocked();

      if (type === 'multiple-choice' || type === 'ranking') {
        label.style.display = 'block';
        label.innerText = type === 'multiple-choice' ? 'Options / Choices' : 'Ranking Options';
        const opts = question.options || [];

        const existingRows = container.querySelectorAll('.composer-option-row');
        if (existingRows.length === opts.length && container.dataset.type === type) {
          opts.forEach((opt, idx) => {
            const input = existingRows[idx].querySelector('.composer-option-input');
            if (input) {
              if (document.activeElement !== input) {
                input.value = opt;
              }
              input.disabled = locked;
            }
            const delBtn = existingRows[idx].querySelector('.btn-delete-option');
            if (delBtn) delBtn.disabled = locked || opts.length <= 2;
          });
          const addBtn = container.querySelector('.btn-add-option');
          if (addBtn) addBtn.style.display = (locked || opts.length >= 6) ? 'none' : 'block';
        } else {
          container.dataset.type = type;
          let html = opts.map((opt, idx) => `
            <div class="composer-option-row">
              <span class="quiz-option-tag">${String.fromCharCode(65 + idx)}</span>
              <input type="text" class="composer-option-input" data-index="${idx}" value="${escapeHtml(opt)}" ${locked ? 'disabled' : ''}>
              <button class="btn-delete-option" type="button" onclick="window.removeDraftOption(${idx})" ${locked || opts.length <= 2 ? 'disabled' : ''}>🗑️</button>
            </div>
          `).join('');
          if (!locked && opts.length < 6) {
            html += `<button class="btn btn-outline btn-add-option" type="button" style="width: 100%; margin-top: 6px; padding: 6px; font-size: 0.85rem;" onclick="window.addDraftOption()">➕ Add Option</button>`;
          }
          container.innerHTML = html;
          
          container.querySelectorAll('.composer-option-input').forEach(input => {
            input.addEventListener('input', () => {
              const idx = Number(input.dataset.index);
              if (state.editingIndex !== null) {
                const q = state.questions[state.editingIndex];
                if (q.options) {
                  q.options[idx] = input.value;
                  renderVisualizer(q, { state: 'question', isDraft: true });
                }
              }
              autoSaveDraft();
            });
          });
        }
      } else if (type === 'scales') {
        label.style.display = 'block';
        label.innerText = 'Statements to Rate';
        const stmts = question.statements || [];

        const existingRows = container.querySelectorAll('.composer-option-row');
        if (existingRows.length === stmts.length && container.dataset.type === type) {
          stmts.forEach((stmt, idx) => {
            const input = existingRows[idx].querySelector('.composer-option-input');
            if (input) {
              if (document.activeElement !== input) {
                input.value = stmt;
              }
              input.disabled = locked;
            }
            const delBtn = existingRows[idx].querySelector('.btn-delete-option');
            if (delBtn) delBtn.disabled = locked || stmts.length <= 1;
          });
          const addBtn = container.querySelector('.btn-add-option');
          if (addBtn) addBtn.style.display = (locked || stmts.length >= 6) ? 'none' : 'block';
        } else {
          container.dataset.type = type;
          let html = stmts.map((stmt, idx) => `
            <div class="composer-option-row">
              <span class="quiz-option-tag" style="background:var(--accent); color:white;">★</span>
              <input type="text" class="composer-option-input" data-index="${idx}" value="${escapeHtml(stmt)}" ${locked ? 'disabled' : ''}>
              <button class="btn-delete-option" type="button" onclick="window.removeDraftOption(${idx})" ${locked || stmts.length <= 1 ? 'disabled' : ''}>🗑️</button>
            </div>
          `).join('');
          if (!locked && stmts.length < 6) {
            html += `<button class="btn btn-outline btn-add-option" type="button" style="width: 100%; margin-top: 6px; padding: 6px; font-size: 0.85rem;" onclick="window.addDraftOption()">➕ Add Statement</button>`;
          }
          container.innerHTML = html;

          container.querySelectorAll('.composer-option-input').forEach(input => {
            input.addEventListener('input', () => {
              const idx = Number(input.dataset.index);
              if (state.editingIndex !== null) {
                const q = state.questions[state.editingIndex];
                if (q.statements) {
                  q.statements[idx] = input.value;
                  renderVisualizer(q, { state: 'question', isDraft: true });
                }
              }
              autoSaveDraft();
            });
          });
        }
      } else {
        label.style.display = 'none';
        container.innerHTML = '';
        container.removeAttribute('data-type');
      }
    }

    function syncComposerInputs(question) {
      if (!question) {
        ui.noSlideSelectedPlaceholder.style.display = 'block';
        ui.slideSettingsPanel.style.display = 'none';
        return;
      }
      ui.noSlideSelectedPlaceholder.style.display = 'none';
      ui.slideSettingsPanel.style.display = 'grid';

      const locked = isDeckLocked();

      ui.slideType.disabled = locked;
      ui.composerQuestionText.disabled = locked;
      document.getElementById('questionTime').disabled = locked;
      const correctSelect = document.getElementById('correctAnswer');
      if (correctSelect) correctSelect.disabled = locked;
      const deleteSlideBtn = document.getElementById('deleteSlideBtn');
      if (deleteSlideBtn) deleteSlideBtn.disabled = locked;

      if (document.activeElement !== ui.composerQuestionText) {
        ui.composerQuestionText.value = question.text || '';
      }

      ui.slideType.value = question.type || 'multiple-choice';

      const isMultipleChoice = question.type === 'multiple-choice';
      document.getElementById('correctAnswerLabel').style.display = isMultipleChoice ? 'block' : 'none';
      if (isMultipleChoice) {
        syncCorrectAnswerDropdown(question);
        document.getElementById('correctAnswer').value = String(question.correct || 0);
      }

      document.getElementById('questionTime').value = String(question.time || 15);

      renderComposerDynamicFields(question);
    }

    window.exitHostRoom = () => {
      if (confirm("Are you sure you want to exit this room? You will go back to the Room Creation screen.")) {
        if (state.unsubscribe) {
          state.unsubscribe();
          state.unsubscribe = null;
        }
        clearHostSession();
        state.sessionId = null;
        state.questions = [];
        state.session = null;
        state.editingIndex = null;
        clearComposer();
        renderLiveState(null);
      }
    };

    // Custom Web Audio Sounds
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

    function playWinnersFanfare() {
      try {
        playSuccessSound();
        setTimeout(() => { playBeep(659.25, 0.4); }, 150); // E5
        setTimeout(() => { playBeep(880.00, 0.6); }, 300); // A5
      } catch (e) {}
    }

    function isNativePresenterFullscreen() {
      return document.fullscreenElement === ui.presenterStage;
    }

    function syncPresenterUi(active) {
      ui.presenterStage.classList.toggle('fullscreen-present', active);
      ui.presenterToolbar.style.display = active ? 'flex' : 'none';
      ui.togglePresentBtn.innerText = active ? '⤫ Exit Present' : '📺 Present';
      ui.togglePresentBtn.setAttribute('aria-pressed', String(active));
    }

    async function enterPresenterMode() {
      syncPresenterUi(true);
      if (!isNativePresenterFullscreen() && ui.presenterStage.requestFullscreen) {
        try {
          await ui.presenterStage.requestFullscreen();
        } catch (err) {
          // Fall back to the CSS-only presenter mode if fullscreen is unavailable.
        }
      }
      if (state.session) renderLiveState(state.session);
      playBeep(880, 0.05);
    }

    async function exitPresenterMode() {
      if (isNativePresenterFullscreen() && document.exitFullscreen) {
        try {
          await document.exitFullscreen();
        } catch (err) {
          // Keep the CSS fallback in sync even if native fullscreen exit is blocked.
        }
      }
      syncPresenterUi(false);
      if (state.editingIndex !== null) {
        window.selectHostQuestion(state.editingIndex);
      } else {
        if (state.session) renderLiveState(state.session);
      }
      playBeep(500, 0.05);
    }

    async function togglePresenterMode() {
      if (ui.presenterStage.classList.contains('fullscreen-present') || isNativePresenterFullscreen()) {
        await exitPresenterMode();
        return;
      }
      await enterPresenterMode();
    }

    // Toggle Presenter Fullscreen Mode
    ui.togglePresentBtn.addEventListener('click', async () => {
      if (!state.sessionId) {
        alert('Please create or open a Room first before presenting.');
        return;
      }
      // Use in-page fullscreen presenter mode (works reliably)
      await enterPresenterMode();
    });
    ui.toolbarExit.addEventListener('click', exitPresenterMode);

    document.addEventListener('fullscreenchange', () => {
      if (isNativePresenterFullscreen()) {
        syncPresenterUi(true);
        return;
      }

      if (ui.presenterStage.classList.contains('fullscreen-present')) {
        syncPresenterUi(false);
        if (state.editingIndex !== null) {
          window.selectHostQuestion(state.editingIndex);
        } else if (state.session) {
          renderLiveState(state.session);
        }
      }
    });

    // Presenter floating toolbar button actions
    ui.toolbarPrev.addEventListener('click', async () => {
      const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : (state.session.revealQuestionIndex != null ? Number(state.session.revealQuestionIndex) : -1);
      const prevIdx = activeIdx - 1;
      if (prevIdx >= 0) {
        playBeep(700, 0.05);
        await window.quiz.startQuestion(state.sessionId, prevIdx);
      }
    });

    async function handleSmartNextAction() {
      if (!state.sessionId || !state.session) return;
      const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : (state.session.revealQuestionIndex != null ? Number(state.session.revealQuestionIndex) : -1);

      if (state.session.state === 'lobby') {
        if (!state.questions || state.questions.length === 0) {
          alert('Add at least one slide before starting the presentation.');
          return;
        }
        playBeep(700, 0.05);
        await window.quiz.startQuestion(state.sessionId, 0);
      } 
      else if (state.session.state === 'question') {
        playBeep(700, 0.05);
        await window.quiz.endQuestion(state.sessionId);
      } 
      else if (state.session.state === 'reveal') {
        playBeep(700, 0.05);
        await window.quiz.showLeaderboard(state.sessionId);
      } 
      else if (state.session.state === 'leaderboard') {
        const nextIdx = activeIdx + 1;
        if (nextIdx < state.questions.length) {
          playBeep(700, 0.05);
          await window.quiz.startQuestion(state.sessionId, nextIdx);
        } else {
          playBeep(600, 0.1);
          await window.quiz.startQuestion(state.sessionId, state.questions.length); // trigger finished
        }
      }
    }

    ui.toolbarNext.addEventListener('click', handleSmartNextAction);

    ui.toolbarResults.addEventListener('click', async () => {
      if (!state.sessionId || !state.session) return;
      const currentShow = state.session.showResults !== false;
      await window.quiz.toggleShowResults(state.sessionId, !currentShow);
      playBeep(880, 0.05);
    });

    ui.toolbarClose.addEventListener('click', async () => {
      if (!state.sessionId) return;
      await window.quiz.endQuestion(state.sessionId);
      playBeep(880, 0.05);
    });

    ui.toolbarLeaderboard.addEventListener('click', async () => {
      if (!state.sessionId) return;
      await window.quiz.showLeaderboard(state.sessionId);
      playBeep(880, 0.05);
    });

    // Fullscreen / Present mode arrow keys slide control
    document.addEventListener('keydown', async (e) => {
      const isFullscreen = ui.presenterStage.classList.contains('fullscreen-present');
      const isPresentPage = document.body.classList.contains('present-mode');
      if ((!isFullscreen && !isPresentPage) || !state.sessionId || !state.session) return;

      const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : (state.session.revealQuestionIndex != null ? Number(state.session.revealQuestionIndex) : -1);

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        await handleSmartNextAction();
      } 
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        const prevIdx = activeIdx - 1;
        if (prevIdx >= 0) {
          playBeep(700, 0.05);
          await window.quiz.startQuestion(state.sessionId, prevIdx);
        }
      } 
      else if (e.key === 'Escape') {
        exitPresenterMode();
      }
    });

    // Toggle drawer Q&A
    ui.qaToggle.addEventListener('click', () => ui.qaDrawer.classList.toggle('open'));
    ui.qaClose.addEventListener('click', () => ui.qaDrawer.classList.remove('open'));


    // Dynamic queue select and edit action handlers
    window.selectHostQuestion = async (index) => {
      const question = state.questions[index];
      if (!question) return;

      const isPresenting = ui.presenterStage.classList.contains('fullscreen-present') || document.body.classList.contains('present-mode');
      if (isPresenting) {
        playBeep(700, 0.05);
        await window.quiz.startQuestion(state.sessionId, index);
        return;
      }

      state.editingIndex = index;
      ui.composerTitle.innerText = `Slide ${index + 1} Settings`;
      
      window.activateTab('composer');
      
      syncComposerInputs(question);
      
      renderVisualizer(question, { state: 'question', isDraft: true });
      renderQueue(); // update active styling in sidebar
      playBeep(880, 0.05);
    };

    window.deleteHostQuestion = async (index) => {
      if (!state.sessionId) return;
      if (isDeckLocked()) return;
      if (confirm("Are you sure you want to delete this slide from the presentation?")) {
        await window.quiz.deleteQuestion(state.sessionId, index);
        playBeep(600, 0.08);
      }
    };

    window.moveHostQuestion = async (index, dir) => {
      if (!state.sessionId) return;
      if (isDeckLocked()) return;
      const targetIdx = index + dir;
      if (targetIdx >= 0 && targetIdx < state.questions.length) {
        await window.quiz.reorderQuestions(state.sessionId, index, targetIdx);
        playBeep(700, 0.05);
      }
    };

    // High fidelity real-time visualizers render engine in Light Theme
    function renderVisualizer(question, snapshot) {
      if (!question || snapshot?.state === 'lobby') {
        ui.previewProgress.style.width = '0%';
        ui.endQuestionBtn.style.display = 'inline-block';
        ui.toggleResultsBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'none';
        
        // Show Joined Players Lobby bubble wrap
        const players = snapshot?.players || {};
        const pKeys = Object.keys(players);
        
        ui.presenterStageLabel.innerText = "Lobby View";
        ui.previewQuestion.innerText = snapshot?.title || "Welcome to myHQ Quiz Lobby!";
        ui.previewMeta.innerText = "Waiting for participants to join with the code below...";
        
        let pBubbles = pKeys.map(k => {
          const isNew = !state.renderedLobbyPlayers.has(k);
          if (isNew) {
            state.renderedLobbyPlayers.add(k);
            if (pKeys.length > 1) playBeep(900 + Math.random() * 200, 0.06); // playful join sound
          }
          return `
          <div class="lobby-player-bubble ${isNew ? 'animate-pop' : ''}">
            <span>${players[k].avatar || '👤'}</span>
            <strong>${players[k].name || 'Player'}</strong>
          </div>
          `;
        }).join('');
        
        ui.visualizerContainer.innerHTML = `
          <style>
            @keyframes bubblePop {
              0% { transform: scale(0.3) translateY(20px); opacity: 0; }
              70% { transform: scale(1.1) translateY(-5px); opacity: 1; }
              100% { transform: scale(1) translateY(0); opacity: 1; }
            }
            .animate-pop { animation: bubblePop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
          </style>
          <div style="text-align:center; padding: 20px 0;">
            <div style="font-size: 1.4rem; font-weight:800; color:var(--primary); margin-bottom: 20px; font-family:'Roboto Mono', monospace; letter-spacing: 2px;">
              JOIN USING THE FOLLOWING CODE 
              <div style="font-size: 3.5rem; color:var(--text-main); font-weight:900; margin-top:8px; letter-spacing:8px; text-shadow:0 4px 10px rgba(30,78,216,0.12);">${state.sessionId || '----'}</div>
            </div>
            <h4 style="margin-top: 30px; font-size: 1.1rem; color: var(--text-muted); text-align: left; border-bottom: 1px solid var(--border); padding-bottom:8px;">Connected Participants (${pKeys.length})</h4>
            <div class="lobby-players-grid">
              ${pBubbles || '<div class="quiz-mini-note" style="padding: 10px 0;">No players joined yet. Send the code to your friends!</div>'}
            </div>
          </div>
        `;
        return;
      }

      const showResults = snapshot.showResults !== false;
      const type = question.type || 'multiple-choice';

      ui.presenterStageLabel.innerText = `${type.replace('-', ' ')} Slide`;
      ui.previewQuestion.innerText = question.text || 'Untitled slide';
      
      if (snapshot?.state === 'reveal') {
        ui.previewMeta.innerText = "Voting closed. The correct answer has been highlighted below.";
      } else {
        const typeMap = {
          'multiple-choice': "Select the correct option on your device.",
          'word-cloud': "Submit your answers to build the word cloud.",
          'open-ended': "Share your thoughts and ideas.",
          'scales': "Rate the statements shown below.",
          'ranking': "Drag/select to rank the options in order of preference."
        };
        ui.previewMeta.innerText = typeMap[type] || "Submit your responses on your device.";
      }

      ui.previewQuestion.removeAttribute('contenteditable');
      ui.previewQuestion.style.borderBottom = 'none';

      // Setup show/hide results button
      if (snapshot.state === 'question') {
        ui.toggleResultsBtn.style.display = 'inline-block';
        ui.endQuestionBtn.style.display = 'inline-block';
        ui.showLeaderboardBtn.style.display = 'none';
        ui.toolbarLeaderboard.style.display = 'none';
        
        if (showResults) {
          ui.toggleResultsText.innerText = "Hide Results";
          ui.toggleResultsBtn.classList.remove('btn-accent');
          ui.toggleResultsBtn.classList.add('btn-outline');
        } else {
          ui.toggleResultsText.innerText = "Show Results";
          ui.toggleResultsBtn.classList.remove('btn-outline');
          ui.toggleResultsBtn.classList.add('btn-accent');
        }
      } else {
        ui.toggleResultsBtn.style.display = 'none';
        if (snapshot.state === 'reveal') {
          ui.endQuestionBtn.style.display = 'none';
          ui.showLeaderboardBtn.style.display = 'inline-block';
          ui.toolbarLeaderboard.style.display = 'inline-block';
        } else {
          ui.endQuestionBtn.style.display = 'inline-block';
          ui.showLeaderboardBtn.style.display = 'none';
          ui.toolbarLeaderboard.style.display = 'none';
        }
      }

      // If results are hidden by presenter
      if (!showResults && snapshot.state === 'question') {
        const answersObj = snapshot.answers?.[snapshot.activeQuestionIndex ?? snapshot.revealQuestionIndex] || {};
        const answerKeys = Object.keys(answersObj);
        const totalConnected = snapshot.players ? Object.keys(snapshot.players).length : 0;
        const votesSubmitted = answerKeys.length;
        const progressPct = totalConnected > 0 ? (votesSubmitted / totalConnected) * 100 : 0;

        ui.visualizerContainer.innerHTML = `
          <div class="results-hidden-overlay" style="max-width: 500px; margin: 15px auto 0; padding: 24px; border-radius: 20px; background: rgba(255, 255, 255, 0.95); border: 1px solid var(--border); box-shadow: 0 10px 24px rgba(30,78,216,0.06); text-align: center; position:relative; overflow:hidden;">
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; font-weight:800; color:var(--primary); margin-bottom: 8px;">Round is Active</div>
            <h2 style="font-size: 1.6rem; font-weight: 800; color: var(--text-main); margin-bottom: 14px; letter-spacing:-0.02em;">Waiting for Participants to Vote...</h2>
            
            <div style="position: relative; width: 100px; height: 100px; margin: 0 auto 14px; display: grid; place-items: center;">
              <svg style="position: absolute; transform: rotate(-90deg); width: 100%; height: 100%;">
                <circle cx="50" cy="50" r="42" stroke="rgba(30, 78, 216, 0.06)" stroke-width="10" fill="transparent" />
                <circle cx="50" cy="50" r="42" stroke="var(--primary)" stroke-width="10" fill="transparent" 
                        stroke-dasharray="264" stroke-dashoffset="${264 - (264 * progressPct / 100)}" 
                        style="transition: stroke-dashoffset 0.4s ease;" />
              </svg>
              <div style="text-align: center; z-index: 2;">
                <span style="display: block; font-size: 1.8rem; font-weight: 900; color: var(--text-main); font-family: 'Roboto Mono', monospace; line-height: 1;">${votesSubmitted}</span>
                <span style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-top: 2px;">of ${totalConnected}</span>
              </div>
            </div>

            <p style="font-size: 0.95rem; color: var(--text-muted); font-weight: 600; margin-bottom: 8px;">${votesSubmitted === totalConnected && totalConnected > 0 ? "🎉 Everyone has voted! Host can close the round now." : "Players are locked in. Answers are hidden until closed."}</p>
            <div class="quiz-meter" style="max-width: 260px; margin: 10px auto 0; height: 6px;"><div class="quiz-meter-bar" style="width: ${progressPct}%;"></div></div>
          </div>
        `;
        return;
      }

      // Fetch all answers for this question
      const answersObj = snapshot.answers?.[snapshot.activeQuestionIndex ?? snapshot.revealQuestionIndex] || {};
      const answerKeys = Object.keys(answersObj);
      const totalConnected = snapshot.players ? Object.keys(snapshot.players).length : 0;

      if (type === 'multiple-choice') {
        const correctIndex = Number(snapshot.revealCorrectIndex ?? question.correct ?? 0);
        const choiceCounts = [0, 0, 0, 0, 0, 0];
        answerKeys.forEach(k => {
          const idx = Number(answersObj[k].answer);
          if (idx >= 0 && idx < choiceCounts.length) choiceCounts[idx] += 1;
        });

        const totalVotes = choiceCounts.reduce((a, b) => a + b, 0);
        const colors = [
          ['#2563eb', '#60a5fa'], // blue
          ['#06b6d4', '#5eead4'], // cyan
          ['#7c3aed', '#a78bfa'], // purple
          ['#f43f5e', '#fb7185'], // rose
          ['#10b981', '#34d399'], // emerald
          ['#f59e0b', '#fbbf24']  // amber
        ];

        let bars = (question.options || []).map((option, idx) => {
          const val = choiceCounts[idx] || 0;
          const pct = totalVotes > 0 ? (val / totalVotes) * 100 : 0;
          const letter = String.fromCharCode(65 + idx);
          const isCorrect = snapshot.state === 'reveal' && idx === correctIndex;
          
          return `
            <div class="mc-chart-bar-wrapper">
              <div class="mc-chart-bar ${isCorrect ? 'correct-bar' : ''}" style="height: ${Math.max(5, pct)}%; --color-start: ${colors[idx % colors.length][0]}; --color-end: ${colors[idx % colors.length][1]};">
                <span class="mc-chart-val">${val}</span>
              </div>
              <div style="display:flex; align-items:center; gap:4px; width:100%; justify-content:center;">
                <div class="mc-chart-label" style="${isCorrect ? 'color:var(--primary); font-weight:800;' : ''}">${letter}. ${option}</div>
              </div>
            </div>
          `;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          <div class="mc-chart-container">
            ${bars}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total responses: <strong>${totalVotes} of ${totalConnected} players voted</strong></div>
        `;
      } 
      else if (type === 'word-cloud') {
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
          const fontSize = 1 + scale * 2.5;
          const randColor = niceColors[Math.floor(Math.random() * niceColors.length)];
          const randRot = (Math.random() * 8 - 4) + 'deg';
          return `<span class="word-cloud-item" style="font-size: ${fontSize}rem; color: ${randColor}; --rand-rot: ${randRot}; transform: rotate(${randRot});">${word}</span>`;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          <div class="word-cloud-container">
            ${cloudHtml || '<div class="quiz-mini-note">Words will dynamically appear here as players submit them.</div>'}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total submissions: <strong>${answerKeys.length} players</strong></div>
        `;
      }
      else if (type === 'open-ended') {
        const noteColors = ['#fff9db', '#ffe3e3', '#e8f7ff', '#ebfbee', '#f3f0ff', '#fff4e6'];
        let cardsHtml = answerKeys.map((k, idx) => {
          const text = answersObj[k].text || '';
          const player = snapshot.players?.[k] || { name: 'Audience member', avatar: '👤' };
          const randColor = noteColors[idx % noteColors.length];
          const randRot = (Math.random() * 6 - 3) + 'deg';
          return `
            <div class="open-ended-card" style="background: ${randColor}; transform: rotate(${randRot}); border-top: 5px solid rgba(0,0,0,0.05);">
              <p>${text}</p>
              <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:0.8rem; color: rgba(0,0,0,0.38); align-items:center; font-weight:700;">
                <span>${player.avatar} ${player.name}</span>
                <span>💬</span>
              </div>
            </div>
          `;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          <div class="open-ended-grid">
            ${cardsHtml || '<div class="quiz-mini-note" style="grid-column: 1/-1; text-align:center; padding: 40px 0;">Audience brainstorm answers will appear here!</div>'}
          </div>
        `;
      }
      else if (type === 'scales') {
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
            <div class="scales-row">
              <span class="scales-label">${stmt}</span>
              <div class="scales-slider-bg">
                <div class="scales-slider-fill" style="width: ${pct}%;"></div>
                <div class="scales-avg-node" style="left: ${pct}%;">${avg.toFixed(1)}</div>
              </div>
              <span class="scales-avg-badge">${avg > 0 ? avg.toFixed(1) + ' ★' : 'No ratings'}</span>
            </div>
          `;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          <div class="scales-container">
            ${rowsHtml}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total ratings: <strong>${answerKeys.length} players</strong></div>
        `;
      }
      else if (type === 'ranking') {
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
            <div class="ranking-row">
              <div class="ranking-rank">${rankIdx + 1}</div>
              <span class="ranking-label">${entry.text}</span>
              <div class="ranking-bar">
                <div class="ranking-bar-fill" style="width: ${pct}%;"></div>
              </div>
              <span class="ranking-score">${entry.score} pts</span>
            </div>
          `;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          <div class="ranking-container">
            ${rowsHtml}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total responses: <strong>${answerKeys.length} rankings</strong></div>
        `;
      }
      else if (type === 'leaderboard') {
        const scores = snapshot?.scores || {};
        const leaderboard = Object.keys(scores)
          .map((playerId) => ({ 
            name: scores[playerId].name, 
            avatar: scores[playerId].avatar || '👤',
            score: scores[playerId].score 
          }))
          .sort((a, b) => b.score - a.score);

        if (leaderboard.length === 0) {
          ui.visualizerContainer.innerHTML = `
            <div style="text-align:center; padding: 60px 0;">
              <h3 style="color:var(--primary); font-size: 1.5rem; margin-bottom:12px;">🏆 Standings Preview 🏆</h3>
              <p class="quiz-mini-note">The leaderboard will dynamically display players and their points here.</p>
            </div>
          `;
        } else {
          let rowsHtml = leaderboard.slice(0, 5).map((entry, idx) => `
            <div class="present-leaderboard-row" style="background: ${idx === 0 ? 'linear-gradient(135deg, rgba(251,191,36,0.1), rgba(245,158,11,0.2))' : '#ffffff'}; border-color: ${idx === 0 ? '#fbbf24' : 'var(--border)'};">
              <div class="present-leaderboard-rank">${idx + 1}</div>
              <div class="present-leaderboard-avatar">${entry.avatar}</div>
              <span class="present-leaderboard-name">${entry.name} ${idx === 0 ? '👑' : ''}</span>
              <span class="present-leaderboard-score">${entry.score} pts</span>
            </div>
          `).join('');

          ui.visualizerContainer.innerHTML = `
            <div class="present-leaderboard-container">
              ${rowsHtml}
            </div>
          `;
        }
      }
    }

    // High fidelity fullscreen leaderboard slide renderer
    function renderLeaderboardSlide(snapshot) {
      ui.presenterStageLabel.innerText = "Round Leaderboard";
      ui.previewQuestion.innerText = "🏆 Top Scores this Round! 🏆";
      ui.previewMeta.innerText = "Here is how players rank after the scores were committed.";
      ui.previewTimer.innerText = "Scores";
      ui.previewProgress.style.width = '100%';
      
      ui.endQuestionBtn.style.display = 'none';
      ui.showLeaderboardBtn.style.display = 'none';
      ui.toggleResultsBtn.style.display = 'none';
      ui.toolbarLeaderboard.style.display = 'none';

      const scores = snapshot.scores || {};
      const currentRound = snapshot.revealQuestionIndex;
      
      if (ui.lastLeaderboardRound === currentRound && ui.visualizerContainer.querySelector('.present-leaderboard-container')) {
        return; // Prevent interrupting the score roll-up animation once the leaderboard is visible
      }
      ui.lastLeaderboardRound = currentRound;

      const leaderboard = Object.keys(scores)
        .map((playerId) => ({
          id: playerId,
          name: scores[playerId].name, 
          avatar: scores[playerId].avatar || '👤',
          lastScore: scores[playerId].lastScore || 0,
          roundPoints: scores[playerId].roundPoints || 0,
          score: scores[playerId].score || 0
        }));

      if (leaderboard.length === 0) {
        ui.visualizerContainer.innerHTML = `
          <div style="text-align:center; padding: 60px 0;">
            <h3 style="color:var(--primary); font-size: 1.5rem; margin-bottom:12px;">No scoreboard records yet</h3>
            <p class="quiz-mini-note">Launch slides and answers to score points!</p>
          </div>
        `;
        return;
      }

      // 1. Initial Render (Sorted by Old Score)
      const oldLeaderboard = [...leaderboard].sort((a, b) => b.lastScore - a.lastScore).slice(0, 5);
      const newLeaderboard = [...leaderboard].sort((a, b) => b.score - a.score).slice(0, 5);
      
      const containerHeight = oldLeaderboard.length * 85;

      let rowsHtml = oldLeaderboard.map((entry, idx) => `
        <div class="present-leaderboard-row" id="lb-row-${entry.id}" style="position: absolute; width: 100%; top: ${idx * 85}px; transition: top 1s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.5s, border 0.5s;">
          <div class="present-leaderboard-rank" id="lb-rank-${entry.id}">${idx + 1}</div>
          <span class="present-leaderboard-avatar">${entry.avatar}</span>
          <span class="present-leaderboard-name">${entry.name}</span>
          <div style="margin-left: auto; display: flex; align-items: center; gap: 12px;">
            <span id="lb-pill-${entry.id}" style="background: #10b981; color: white; padding: 4px 12px; border-radius: 12px; font-weight: 800; font-size: 0.95rem; opacity: 1; transition: opacity 0.4s ease-out; display: ${entry.roundPoints > 0 ? 'inline-block' : 'none'};">+${entry.roundPoints}</span>
            <span class="present-leaderboard-score" id="lb-score-${entry.id}">${entry.lastScore} pts</span>
          </div>
        </div>
      `).join('');

      ui.visualizerContainer.innerHTML = `
        <div class="present-leaderboard-container" style="position: relative; height: ${containerHeight}px; width: 100%; margin-top: 10px;">
          ${rowsHtml}
        </div>
      `;

      // 2. Animate Score Roll-up after 1 second
      setTimeout(() => {
        oldLeaderboard.forEach(entry => {
          const scoreEl = document.getElementById(`lb-score-${entry.id}`);
          const pillEl = document.getElementById(`lb-pill-${entry.id}`);
          if (!scoreEl) return;
          
          if (pillEl) pillEl.style.opacity = '0';
          
          let start = entry.lastScore;
          let end = entry.score;
          if (start === end) return;
          
          let duration = 1500;
          let startTime = null;
          
          function step(timestamp) {
            if (!startTime) startTime = timestamp;
            let progress = (timestamp - startTime) / duration;
            if (progress > 1) progress = 1;
            
            // easeOutQuart
            let ease = 1 - Math.pow(1 - progress, 4);
            let current = Math.floor(start + (end - start) * ease);
            scoreEl.innerText = current + ' pts';
            
            if (progress < 1) window.requestAnimationFrame(step);
            else scoreEl.innerText = end + ' pts';
          }
          window.requestAnimationFrame(step);
        });

        // 3. Re-order Rows with Glide Animation after score roll-up completes
        setTimeout(() => {
          newLeaderboard.forEach((entry, newIdx) => {
            const rowEl = document.getElementById(`lb-row-${entry.id}`);
            const rankEl = document.getElementById(`lb-rank-${entry.id}`);
            if (rowEl) {
               rowEl.style.top = `${newIdx * 85}px`;
               if (newIdx === 0) rowEl.classList.add('rank-1');
               else rowEl.classList.remove('rank-1');
            }
            if (rankEl) {
               rankEl.innerText = newIdx + 1;
            }
          });
          playBeep(800, 0.1);
        }, 1800);
      }, 1000);
    }

    // 3D Winners podium drawer in Light Theme style
    function renderWinnersPodium(snapshot) {
      ui.presenterStageLabel.innerText = "Game Show Results";
      ui.previewQuestion.innerText = "👑 Congratulations to our Winners! 👑";
      ui.previewMeta.innerText = "Thank you everyone for playing in the myHQ Arcade.";
      ui.previewTimer.innerText = "Ended";
      ui.previewProgress.style.width = '100%';
      
      ui.endQuestionBtn.style.display = 'none';
      ui.showLeaderboardBtn.style.display = 'none';
      ui.toggleResultsBtn.style.display = 'none';
      ui.toolbarLeaderboard.style.display = 'none';

      const scores = snapshot.scores || {};
      const leaderboard = Object.keys(scores)
        .map((playerId) => ({ 
          name: scores[playerId].name, 
          avatar: scores[playerId].avatar || '👤',
          score: scores[playerId].score 
        }))
        .sort((a, b) => b.score - a.score);

      if (leaderboard.length === 0) {
        ui.visualizerContainer.innerHTML = `
          <div style="text-align:center; padding: 60px 0;">
            <h3 style="color:var(--primary); font-size: 1.8rem; margin-bottom:12px;">No one participated in the quiz</h3>
            <p class="quiz-mini-note">Create a new Room to host another game night!</p>
          </div>
        `;
        return;
      }

      const p1 = leaderboard[0];
      const p2 = leaderboard[1] || null;
      const p3 = leaderboard[2] || null;

      if (!state.winnersFanfarePlayed) {
        playWinnersFanfare();
        state.winnersFanfarePlayed = true;

        if (window.confetti) {
          const end = Date.now() + 3000;
          (function frame() {
            confetti({ particleCount: 6, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#3b82f6', '#f5a623', '#10b981', '#f43f5e'] });
            confetti({ particleCount: 6, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#3b82f6', '#f5a623', '#10b981', '#f43f5e'] });
            if (Date.now() < end) requestAnimationFrame(frame);
          }());
        }
      }

      // Make dynamic confetti pieces
      let confettiHtml = '';
      const confettiColors = ['#ffd300', '#ff3b30', '#4cd964', '#00bcd4', '#7c3aed', '#ff9500'];
      for (let i = 0; i < 60; i++) {
        const left = Math.random() * 100 + '%';
        const delay = Math.random() * 4 + 's';
        const size = Math.random() * 6 + 6 + 'px';
        const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
        const tilt = Math.random() * 10 + 5 + 'px';
        confettiHtml += `<div class="confetti-piece" style="left: ${left}; animation-delay: ${delay}; width: ${size}; height: ${tilt}; background-color: ${color};"></div>`;
      }

      // Make 3D podium columns
      ui.visualizerContainer.innerHTML = `
        <div style="position: relative; width: 100%; height: 100%; overflow: visible;">
          <div class="confetti-wrapper">
            ${confettiHtml}
          </div>
          <div class="podium-container">
            <!-- 2nd Place -->
            ${p2 ? `
              <div class="podium-col">
                <span class="podium-avatar">${p2.avatar}</span>
                <div class="podium-name">${p2.name}</div>
                <div class="podium-bar silver">
                  <span class="podium-rank">2</span>
                  <span class="podium-score">${p2.score} pts</span>
                </div>
              </div>
            ` : '<div style="width:140px;"></div>'}

            <!-- 1st Place -->
            <div class="podium-col">
              <span class="podium-avatar" style="font-size: 3.3rem; margin-bottom: 4px;">👑<br>${p1.avatar}</span>
              <div class="podium-name" style="font-weight:900; font-size:1.25rem; color:var(--primary);">${p1.name}</div>
              <div class="podium-bar gold">
                <span class="podium-rank">1</span>
                <span class="podium-score">${p1.score} pts</span>
              </div>
            </div>

            <!-- 3rd Place -->
            ${p3 ? `
              <div class="podium-col">
                <span class="podium-avatar">${p3.avatar}</span>
                <div class="podium-name">${p3.name}</div>
                <div class="podium-bar bronze">
                  <span class="podium-rank">3</span>
                  <span class="podium-score">${p3.score} pts</span>
                </div>
              </div>
            ` : '<div style="width:140px;"></div>'}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 30px; font-size: 1.15rem; font-weight: 700; color: var(--text-main);">
            🎉 Gold Medalist: <strong style="color: var(--primary); font-size:1.3rem;">${p1.name}</strong> with <strong style="font-family:'Roboto Mono'; font-size:1.3rem;">${p1.score} points!</strong> 🎉
          </div>
        </div>
      `;
    }

    // Q&A audience drawer renderer
    function renderQa(qaData) {
      if (!qaData) {
        ui.qaCount.innerText = '0';
        ui.qaList.innerHTML = '<div class="quiz-mini-note">No questions from the audience yet.</div>';
        return;
      }

      const qKeys = Object.keys(qaData);
      const activeQuestions = qKeys.map(k => ({ id: k, ...qaData[k] })).sort((a,b) => b.ts - a.ts);
      
      const unansweredCount = activeQuestions.filter(q => !q.answered).length;
      ui.qaCount.innerText = String(unansweredCount);

      ui.qaList.innerHTML = activeQuestions.map(q => `
        <div class="qa-item ${q.answered ? 'answered' : ''}">
          <div class="qa-item-header">
            <span class="qa-item-avatar">${q.avatar || '👤'}</span>
            <span class="qa-item-name">${q.name}</span>
            <span class="quiz-mini-note" style="margin-left:auto; font-size:0.75rem;">${new Date(q.ts).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
          <p class="qa-item-text">${q.text}</p>
          <div class="qa-item-actions">
            <button class="btn btn-outline qa-item-btn" onclick="window.toggleHostQa('${q.id}', ${!q.answered})">
              ${q.answered ? 'Reopen' : 'Mark Answered'}
            </button>
          </div>
        </div>
      `).join('');
    }

    window.toggleHostQa = async (qid, status) => {
      if (!state.sessionId) return;
      await window.quiz.toggleQaAnswered(state.sessionId, qid, status);
    };

    function renderQueue() {
      const deckLocked = isDeckLocked();
      let html = '';
      if (state.questions.length === 0) {
        html = '<div class="quiz-mini-note">No slides in the deck yet.</div>';
      } else {
        state.questions.forEach((question, index) => {
          const isActive = Number(state.session?.activeQuestionIndex) === index && state.session?.state === 'question';
          const isReveal = Number(state.session?.revealQuestionIndex) === index && state.session?.state === 'reveal';
          
          html += `
            <div class="ppt-thumbnail-wrapper ${isActive || isReveal ? 'active' : ''}" onclick="window.selectHostQuestion(${index})">
              <div class="ppt-thumbnail-meta">
                <div>
                  <span class="quiz-badge">S${index * 2 + 1}</span>
                  <span class="quiz-badge"><strong>${question.time || 15}s</strong></span>
                </div>
                <div class="ppt-thumbnail-actions">
                  <button title="Move Up" ${deckLocked || index === 0 ? 'disabled' : ''} onclick="event.stopPropagation(); window.moveHostQuestion(${index}, -1)">⬆️</button>
                  <button title="Move Down" ${deckLocked || index === state.questions.length - 1 ? 'disabled' : ''} onclick="event.stopPropagation(); window.moveHostQuestion(${index}, 1)">⬇️</button>
                  <button title="Delete" style="color:#ff3b30;" ${deckLocked ? 'disabled' : ''} onclick="event.stopPropagation(); window.deleteHostQuestion(${index})">🗑️</button>
                </div>
              </div>
              <div class="ppt-thumbnail-slide">
                <div style="width: 100%;">
                  <div style="font-size: 0.6rem; font-weight:800; color:var(--primary); margin-bottom: 4px; text-transform:uppercase; letter-spacing:1px;">${question.type.replace('-', ' ')}</div>
                  <strong style="color:var(--text-main); font-size: 0.95rem; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${question.text || 'Untitled slide'}</strong>
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center;">
                ${isActive ? `<button class="btn btn-primary ppt-launch-btn" disabled>Live Now</button>` : `<button class="btn btn-outline ppt-launch-btn" onclick="event.stopPropagation(); window.quiz.startQuestion('${state.sessionId}', ${index})">▶️ Launch</button>`}
              </div>
            </div>`;
            
          const isLeaderboardActive = (state.session?.state === 'leaderboard' && (Number(state.session?.activeQuestionIndex) === index || Number(state.session?.revealQuestionIndex) === index));
          html += `
            <div class="ppt-thumbnail-wrapper ${isLeaderboardActive ? 'active' : ''}" style="background:#fcfcfc; border: 2px dashed var(--border);">
              <div class="ppt-thumbnail-meta">
                <span class="quiz-badge">S${index * 2 + 2}</span>
                <span class="badge-accent" style="padding:2px 8px; font-size:0.7rem;">Leaderboard</span>
              </div>
              <div class="ppt-thumbnail-slide" style="background:transparent; border:none; box-shadow:none;">
                <strong style="color:var(--text-muted); font-size: 0.9rem;">🏆 Round ${index + 1} Standings</strong>
              </div>
            </div>
          `;
        });
      }
      ui.questionQueue.innerHTML = html;
    }

    function setRevealAutoClear(snapshot) {
      return;
    }

    function syncProgressTimer(snapshot, question) {
      if (state.timerTickInterval) {
        clearInterval(state.timerTickInterval);
        state.timerTickInterval = null;
      }
      if (!snapshot || !question || snapshot.state !== 'question' || snapshot.activeQuestionEndsAt == null) {
        ui.previewTimer.innerText = '--';
        ui.previewProgress.style.width = '0%';
        return;
      }

      const endsAt = Number(snapshot.activeQuestionEndsAt);
      const startedAt = Number(snapshot.activeQuestionStartedAt || (endsAt - question.time * 1000));
      const totalMs = Math.max(5000, Number(question.time || 15) * 1000);

      const updateProgress = () => {
        const left = Math.max(0, endsAt - Date.now());
        const elapsed = Math.max(0, Date.now() - startedAt);
        const pct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));

        ui.previewTimer.innerText = `${Math.ceil(left / 1000)}s`;
        ui.previewProgress.style.width = `${pct}%`;
        ui.hostTimer.innerText = `${Math.ceil(left / 1000)}s`;

        const leftSecs = Math.ceil(left / 1000);
        if (leftSecs > 0 && leftSecs <= 5 && left % 1000 < 100) {
          playBeep(440, 0.05); // low tick sound
        }

        if (left <= 0) {
          clearInterval(state.timerTickInterval);
          state.timerTickInterval = null;
          playBeep(659.25, 0.2); // E5 end beep sound
          ui.hostTimer.innerText = 'Voting closed';
          
          if (state.session?.state === 'question') {
            window.quiz.endQuestion(state.sessionId);
          }
        }
      };

      updateProgress();
      state.timerTickInterval = setInterval(updateProgress, 100);
    }

    function updateHostControlButtons(snapshot) {
      if (!snapshot) {
        ui.quickSlideController.style.display = 'none';
        ui.endQuestionBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'none';
        ui.addNewSlideBtn.disabled = false;
        return;
      }

      const activeIdx = snapshot.activeQuestionIndex != null ? Number(snapshot.activeQuestionIndex) : null;
      const revealIdx = snapshot.revealQuestionIndex != null ? Number(snapshot.revealQuestionIndex) : null;
      const currentIdx = activeIdx ?? revealIdx ?? -1;
      const isLastSlide = currentIdx >= state.questions.length - 1;

      // 1. Sidebar Host Controls
      if (snapshot.state === 'lobby') {
        ui.quickSlideController.style.display = 'flex';
        ui.sidebarPrevBtn.disabled = true;
        ui.sidebarNextBtn.disabled = false;
        ui.sidebarNextBtn.innerText = "▶️ Start Show";
        
        ui.endQuestionBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'none';
      } 
      else if (snapshot.state === 'question') {
        ui.quickSlideController.style.display = 'flex';
        ui.sidebarPrevBtn.disabled = currentIdx <= 0;
        ui.sidebarNextBtn.disabled = true; // wait for close voting
        ui.sidebarNextBtn.innerText = "Next Slide ⏭️";

        ui.endQuestionBtn.style.display = 'inline-block';
        ui.endQuestionBtn.innerText = "🛑 Close Voting";
        ui.endQuestionBtn.className = "btn btn-accent";
        ui.showLeaderboardBtn.style.display = 'none';
      } 
      else if (snapshot.state === 'reveal') {
        ui.quickSlideController.style.display = 'flex';
        ui.sidebarPrevBtn.disabled = currentIdx <= 0;
        ui.sidebarNextBtn.disabled = true; // wait for leaderboard
        ui.sidebarNextBtn.innerText = "Next Slide ⏭️";

        ui.endQuestionBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'inline-block';
        ui.showLeaderboardBtn.innerText = "🏆 Show Leaderboard";
        ui.showLeaderboardBtn.className = "btn btn-primary";
      } 
      else if (snapshot.state === 'leaderboard') {
        ui.quickSlideController.style.display = 'flex';
        ui.sidebarPrevBtn.disabled = currentIdx <= 0;
        ui.sidebarNextBtn.disabled = false;
        ui.sidebarNextBtn.innerText = isLastSlide ? "🏁 Finish Show" : "Next Slide ⏭️";

        ui.endQuestionBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'none';
      }
      else if (snapshot.state === 'finished') {
        ui.quickSlideController.style.display = 'none';
        ui.endQuestionBtn.style.display = 'none';
        ui.showLeaderboardBtn.style.display = 'none';
      }

      ui.addNewSlideBtn.disabled = isDeckLocked(snapshot);

      // 2. Fullscreen Presenter Dock Toolbar Buttons
      if (snapshot.state === 'lobby') {
        ui.toolbarResults.style.display = 'none';
        ui.toolbarClose.style.display = 'none';
        ui.toolbarLeaderboard.style.display = 'none';
        ui.toolbarNext.style.display = 'inline-flex';
        ui.toolbarNext.innerText = "▶️ Start";
        ui.toolbarNext.className = "presenter-toolbar-btn primary";
      } 
      else if (snapshot.state === 'question') {
        ui.toolbarResults.style.display = 'inline-flex';
        ui.toolbarClose.style.display = 'inline-flex';
        ui.toolbarClose.innerText = "🛑 Close Voting";
        ui.toolbarClose.className = "presenter-toolbar-btn primary";
        ui.toolbarLeaderboard.style.display = 'none';
        ui.toolbarNext.style.display = 'none'; // hide Next so they close voting first!
      } 
      else if (snapshot.state === 'reveal') {
        ui.toolbarResults.style.display = 'none';
        ui.toolbarClose.style.display = 'none';
        ui.toolbarLeaderboard.style.display = 'inline-flex';
        ui.toolbarLeaderboard.innerText = "🏆 Leaderboard";
        ui.toolbarLeaderboard.className = "presenter-toolbar-btn primary";
        ui.toolbarNext.style.display = 'inline-flex';
        ui.toolbarNext.innerText = "🏆 Leaderboard";
        ui.toolbarNext.className = "presenter-toolbar-btn primary";
      } 
      else if (snapshot.state === 'leaderboard') {
        ui.toolbarResults.style.display = 'none';
        ui.toolbarClose.style.display = 'none';
        ui.toolbarLeaderboard.style.display = 'none';
        ui.toolbarNext.style.display = 'inline-flex';
        ui.toolbarNext.innerText = isLastSlide ? "🏁 Finish" : "Next Slide ▶️";
        ui.toolbarNext.className = "presenter-toolbar-btn primary";
      }
      else if (snapshot.state === 'finished') {
        ui.toolbarResults.style.display = 'none';
        ui.toolbarClose.style.display = 'none';
        ui.toolbarLeaderboard.style.display = 'none';
        ui.toolbarNext.style.display = 'none';
      }
    }

    function renderLiveState(snapshot) {
      state.session = snapshot || null;
      
      if (isDeckLocked(snapshot)) {
        state.editingIndex = null;
        const composerTabBtn = document.querySelector('.tab-btn[data-tab="composer"]');
        if (composerTabBtn && composerTabBtn.classList.contains('active')) {
          window.activateTab('control-room');
        }
      }

      ui.quizStateDisplay.innerText = snapshot?.state || 'idle';
      
      const activeIdx = snapshot?.activeQuestionIndex != null ? Number(snapshot.activeQuestionIndex) : null;
      const revealIdx = snapshot?.revealQuestionIndex != null ? Number(snapshot.revealQuestionIndex) : null;
      
      ui.activeQuestionDisplay.innerText = snapshot?.state === 'reveal' && revealIdx != null
        ? `S${revealIdx + 1}`
        : activeIdx != null
          ? `S${activeIdx + 1}`
          : 'None';
      
      ui.playerCountDisplay.innerText = String(snapshot?.players ? Object.keys(snapshot.players).length : 0);
      ui.liveStateChip.innerText = snapshot?.state || 'idle';

      // Update Creator Room active details card
      if (state.sessionId) {
        document.getElementById('roomCreationSection').style.display = 'none';
        document.getElementById('roomActiveSection').style.display = 'block';
        document.getElementById('activeRoomTitle').innerText = snapshot?.title || 'myHQ Quiz Session';
        document.getElementById('activeRoomCode').innerText = state.sessionId;
        ui.createSessionBtn.style.display = 'none';
        
        const exitBtn = document.getElementById('exitRoomBtnHeader');
        if (exitBtn) exitBtn.style.display = 'inline-block';
      } else {
        document.getElementById('roomCreationSection').style.display = 'block';
        document.getElementById('roomActiveSection').style.display = 'none';
        ui.createSessionBtn.style.display = 'block';
        
        const exitBtn = document.getElementById('exitRoomBtnHeader');
        if (exitBtn) exitBtn.style.display = 'none';
      }

      // Reset Fanfare flag if we leave finished state
      if (snapshot?.state !== 'finished') {
        state.winnersFanfarePlayed = false;
      }

      const isPresenting = ui.presenterStage.classList.contains('fullscreen-present') || document.body.classList.contains('present-mode');
      
      if (isDeckLocked(snapshot)) {
        if (state.editingIndex !== null) {
          syncComposerInputs(state.questions[state.editingIndex]);
        }
      }

      if (state.editingIndex !== null && !isPresenting) {
        const draftQuestion = state.questions[state.editingIndex];
        renderVisualizer(draftQuestion, { state: 'question', isDraft: true });
        syncComposerInputs(draftQuestion);
        
        ui.previewTimer.innerText = `${draftQuestion?.time || 15}s`;
        ui.previewProgress.style.width = '0%';
        
        renderQueue();
        updateHostControlButtons(snapshot);
        renderQa(snapshot?.qa);
        
        const scores = snapshot?.scores || {};
        const leaderboard = Object.keys(scores)
          .map((playerId) => ({ 
            name: scores[playerId].name, 
            avatar: scores[playerId].avatar || '👤',
            score: scores[playerId].score 
          }))
          .sort((a, b) => b.score - a.score);

        ui.liveLeaderboard.innerHTML = leaderboard.length
          ? leaderboard.map((entry, index) => `
              <li style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid var(--border); padding:8px 14px; border-radius:12px;">
                <span>${index + 1}. ${entry.avatar} ${entry.name}</span>
                <strong style="color:var(--primary); font-family:'Roboto Mono';">${entry.score} pts</strong>
              </li>
            `).join('')
          : '<li class="quiz-mini-note">No scores recorded yet.</li>';
        
        return;
      }

      // Stage Rendering (Lobby, Finished, Leaderboard, or Slide chart views)
      if (snapshot?.state === 'finished') {
        if (state.timerTickInterval) clearInterval(state.timerTickInterval);
        renderWinnersPodium(snapshot);
        return;
      }

      if (snapshot?.state === 'leaderboard') {
        if (state.timerTickInterval) clearInterval(state.timerTickInterval);
        renderLeaderboardSlide(snapshot);
        renderQueue();
        updateHostControlButtons(snapshot);
        return;
      }

      let activeQuestion = null;
      if (snapshot?.state === 'reveal' && revealIdx != null) {
        activeQuestion = state.questions[revealIdx] || null;
      } else if (activeIdx != null) {
        activeQuestion = state.questions[activeIdx] || null;
      }

      if (!activeQuestion) {
        renderVisualizer(null, snapshot);
      } else {
        renderVisualizer(activeQuestion, snapshot);
        syncProgressTimer(snapshot, activeQuestion);
      }

      // Multiple Choice Reveal Answer Logic
      if (snapshot?.state === 'reveal' && activeQuestion && activeQuestion.type === 'multiple-choice') {
        const revealIndex = Number(snapshot.revealCorrectIndex ?? activeQuestion.correct ?? 0);
        
        const revealAnswersObj = snapshot.answers?.[snapshot.revealQuestionIndex] || {};
        const revealAnswerKeys = Object.keys(revealAnswersObj);
        let correctCount = 0;
        revealAnswerKeys.forEach(k => {
          if (Number(revealAnswersObj[k].answer) === revealIndex) {
            correctCount++;
          }
        });
        const totalAnswers = revealAnswerKeys.length;

        ui.liveReveal.style.display = 'block';
        ui.liveReveal.innerHTML = `
          <div class="quiz-reveal-answer">${String.fromCharCode(65 + revealIndex)}. ${activeQuestion.options[revealIndex] || 'Correct answer'}</div>
          <div style="margin-top:6px; font-weight: 800; color: var(--primary); font-size: 1.1rem;">
             🎉 ${correctCount} of ${totalAnswers} players got it right!
          </div>
          <div style="margin-top:6px; color:var(--text-muted);">The correct answer has been highlighted above. Click "Show Leaderboard" to view points!</div>
        `;
      } else {
        ui.liveReveal.style.display = 'none';
      }

      renderQueue();

      renderQa(snapshot?.qa);

      const scores = snapshot?.scores || {};
      const leaderboard = Object.keys(scores)
        .map((playerId) => ({ 
          name: scores[playerId].name, 
          avatar: scores[playerId].avatar || '👤',
          score: scores[playerId].score 
        }))
        .sort((a, b) => b.score - a.score);

      ui.liveLeaderboard.innerHTML = leaderboard.length
        ? leaderboard.map((entry, index) => `
            <li style="display:flex; justify-content:space-between; align-items:center; background:#ffffff; border:1px solid var(--border); padding:8px 14px; border-radius:12px;">
              <span>${index + 1}. ${entry.avatar} ${entry.name}</span>
              <strong style="color:var(--primary); font-family:'Roboto Mono';">${entry.score} pts</strong>
            </li>
          `).join('')
        : '<li class="quiz-mini-note">No scores recorded yet.</li>';

      setRevealAutoClear(snapshot);
      updateHostControlButtons(snapshot);
    }

    function wireRoom(sessionId) {
      if (state.unsubscribe) state.unsubscribe();
      let rAF = null;
      let pendingSnapshot = null;
      state.unsubscribe = window.quiz.onRoomUpdate(sessionId, (snapshot) => {
        pendingSnapshot = snapshot;
        if (!rAF) {
          rAF = requestAnimationFrame(() => {
            rAF = null;
            const snap = pendingSnapshot;
            state.session = snap;
            if (snap?.questions) {
              state.questions = snap.questions;
              if (state.editingIndex !== null && state.editingIndex >= state.questions.length) {
                state.editingIndex = state.questions.length > 0 ? state.questions.length - 1 : null;
                if (state.editingIndex !== null) window.selectHostQuestion(state.editingIndex);
                else clearComposer();
              }
            } else {
              state.questions = [];
              state.editingIndex = null;
              clearComposer();
            }
            renderLiveState(snap);
          });
        }
      });
    }

    function clearComposer() {
      document.getElementById('questionTime').value = '15';
      document.getElementById('correctAnswer').value = '0';
      document.getElementById('slideSettingsPanel').style.display = 'none';
      state.editingIndex = null;
      renderLiveState(state.session);
    }

    onAuthStateChanged(auth, (user) => {
      const isPresentModeAuth = new URLSearchParams(window.location.search).get('present') === 'true';
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      let currentUser = user;
      if (!currentUser && isLocalhost) {
        currentUser = { email: 'admin@myhq.in' };
      }

      if (!currentUser || !currentUser.email || !ADMIN_EMAIL_ALLOWLIST.includes(currentUser.email.toLowerCase())) {
        if (isPresentModeAuth) {
          // Present-mode popup: skip auth redirect, just wire the room for read-only display
          resumeHostSession();
          renderLiveState(null);
          return;
        }
        window.location.href = 'admin.html';
        return;
      }

      ui.createSessionBtn.addEventListener('click', async () => {
        const title = document.getElementById('quizTitle').value.trim() || 'myHQ Live Slide Presentation';
        const requestedCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        state.sessionId = await window.quiz.createRoom({ title, code: requestedCode });
        ui.sessionCodeDisplay.innerText = state.sessionId;
        ui.copyShareLinkBtn.style.display = 'inline-block';
        saveHostSession();
        wireRoom(state.sessionId);
      });

      ui.copyShareLinkBtn.addEventListener('click', () => {
        if (!state.sessionId) return;
        const link = `${window.location.origin}/quiz-player.html?code=${state.sessionId}`;
        navigator.clipboard.writeText(link).then(() => {
          const originalText = ui.copyShareLinkBtn.innerText;
          ui.copyShareLinkBtn.innerText = "✅ Copied!";
          setTimeout(() => { ui.copyShareLinkBtn.innerText = originalText; }, 2000);
        });
      });

      ui.copyShareLinkBtnSidebar.addEventListener('click', () => {
        if (!state.sessionId) return;
        const link = `${window.location.origin}/quiz-player.html?code=${state.sessionId}`;
        navigator.clipboard.writeText(link).then(() => {
          const originalText = ui.copyShareLinkBtnSidebar.innerText;
          ui.copyShareLinkBtnSidebar.innerText = "✅ Copied!";
          setTimeout(() => { ui.copyShareLinkBtnSidebar.innerText = originalText; }, 2000);
        });
      });

      // Real-time Canvas Auto-Save Engine
      let saveTimeout;
      const autoSaveDraft = () => {
        if (state.editingIndex === null || !state.sessionId || isDeckLocked()) return;
        clearTimeout(saveTimeout);
        
        const type = ui.slideType.value;
        const text = ui.composerQuestionText.value.trim();
        const correct = Number(document.getElementById('correctAnswer').value || 0);
        const time = Number(document.getElementById('questionTime').value || 15);
        
        let options = [];
        let statements = [];
        
        const optionInputs = ui.composerDynamicFields.querySelectorAll('.composer-option-input');
        if (type === 'multiple-choice' || type === 'ranking') {
          optionInputs.forEach(input => {
            const txt = input.value.trim();
            if (txt) options.push(txt);
          });
          if (options.length === 0) options = ['Option 1', 'Option 2'];
          if (options.length === 1) options.push('Option 2');
        } else if (type === 'scales') {
          optionInputs.forEach(input => {
            const txt = input.value.trim();
            if (txt) statements.push(txt);
          });
          if (statements.length === 0) statements = ['Statement 1'];
        }
        
        const question = { type, text, options, statements, correct, time };

        state.questions[state.editingIndex] = question;
        renderVisualizer(question, { state: 'question', isDraft: true });
        
        saveTimeout = setTimeout(async () => {
          if (state.sessionId && state.editingIndex !== null) {
            await window.quiz.updateQuestion(state.sessionId, state.editingIndex, question);
          }
        }, 600); // 600ms debounce
      };

      ['slideType', 'questionTime', 'correctAnswer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => {
          if (state.editingIndex !== null) {
            const q = state.questions[state.editingIndex];
            q.type = ui.slideType.value;
            q.time = Number(document.getElementById('questionTime').value || 15);
            if (q.type === 'multiple-choice') {
              q.correct = Number(document.getElementById('correctAnswer').value || 0);
            }
            if (id === 'slideType') {
              if (q.type === 'multiple-choice' || q.type === 'ranking') {
                q.options = q.options || ['Option 1', 'Option 2'];
                q.statements = [];
              } else if (q.type === 'scales') {
                q.statements = q.statements || ['Statement 1'];
                q.options = [];
              } else {
                q.options = [];
                q.statements = [];
              }
              syncComposerInputs(q);
            }
            autoSaveDraft();
          }
        });
      });
      
      ui.composerQuestionText.addEventListener('input', autoSaveDraft);

      window.addDraftOption = () => {
        if (state.editingIndex === null) return;
        const q = state.questions[state.editingIndex];
        if (q.type === 'multiple-choice' || q.type === 'ranking') {
          q.options = q.options || [];
          q.options.push(`Option ${q.options.length + 1}`);
        } else if (q.type === 'scales') {
          q.statements = q.statements || [];
          q.statements.push(`Statement ${q.statements.length + 1}`);
        }
        renderVisualizer(q, { state: 'question', isDraft: true });
        renderComposerDynamicFields(q);
        autoSaveDraft();
      };

      window.removeDraftOption = (index) => {
        if (state.editingIndex === null) return;
        const q = state.questions[state.editingIndex];
        if (q.type === 'multiple-choice' || q.type === 'ranking') {
          q.options = q.options || [];
          if (q.options.length <= 2) return;
          q.options.splice(index, 1);
        } else if (q.type === 'scales') {
          q.statements = q.statements || [];
          if (q.statements.length <= 1) return;
          q.statements.splice(index, 1);
        }
        renderVisualizer(q, { state: 'question', isDraft: true });
        renderComposerDynamicFields(q);
        autoSaveDraft();
      };

      ui.addNewSlideBtn.addEventListener('click', async () => {
        if (!state.sessionId) {
          alert('Please create a Room first.');
          return;
        }
        if (isDeckLocked()) {
          alert('Prepare the slide deck before starting the quiz.');
          return;
        }

        const newSlide = {
          type: 'multiple-choice',
          text: 'New Question',
          options: ['Option 1', 'Option 2'],
          time: 15,
          correct: 0
        };

        await window.quiz.addQuestion(state.sessionId, newSlide);
        setTimeout(() => {
          if (state.questions && state.questions.length > 0) {
            window.selectHostQuestion(state.questions.length - 1);
          }
        }, 500);
      });

      document.getElementById('deleteSlideBtn').addEventListener('click', async () => {
        if (state.editingIndex !== null) {
          await window.deleteHostQuestion(state.editingIndex);
          clearComposer();
        }
      });

      ui.sidebarPrevBtn.addEventListener('click', async () => {
        if (!state.sessionId || !state.session) return;
        const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : (state.session.revealQuestionIndex != null ? Number(state.session.revealQuestionIndex) : -1);
        const prevIdx = activeIdx - 1;
        if (prevIdx >= 0) {
          playBeep(700, 0.05);
          await window.quiz.startQuestion(state.sessionId, prevIdx);
        }
      });

      ui.sidebarNextBtn.addEventListener('click', async () => {
        await handleSmartNextAction();
      });

      ui.sidebarPresentBtn.addEventListener('click', async () => {
        if (!state.sessionId) {
          alert('Please create or open a Room first.');
          return;
        }
        await enterPresenterMode();
      });

      ui.sidebarProjectorBtn.addEventListener('click', () => {
        if (!state.sessionId) {
          alert('Please create or open a Room first.');
          return;
        }
        const url = `quiz-admin.html?present=true&code=${state.sessionId}`;
        window.open(url, 'myhq_quiz_projector', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
        playBeep(880, 0.05);
      });

      ui.endQuestionBtn.addEventListener('click', async () => {
        if (!state.sessionId) return;
        await window.quiz.endQuestion(state.sessionId);
      });

      ui.showLeaderboardBtn.addEventListener('click', async () => {
        if (!state.sessionId) return;
        await window.quiz.showLeaderboard(state.sessionId);
      });

      ui.resetQuizBtn.addEventListener('click', async () => {
        if (!state.sessionId) return;
        if (confirm("Reset this room for a fresh group? Questions will stay, but players, scores, answers, and Q&A will be cleared.")) {
          await window.quiz.resetRoom(state.sessionId);
          saveHostSession();
          wireRoom(state.sessionId);
        }
      });

      resumeHostSession();
      renderLiveState(null);
    });
  </script>
