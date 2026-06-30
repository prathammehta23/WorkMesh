import { rtdb } from './firebase-config.js';
import { ref, push, set, update, onValue, get, remove, runTransaction } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

const state = {
  roomTypes: {} // Cache for detected room types: { 'CODE': 'quizzes' | 'surveys' }
};

async function detectRoomType(sid) {
  const code = String(sid).trim().toUpperCase();
  if (state.roomTypes[code]) return state.roomTypes[code];
  
  try {
    const quizSnap = await get(ref(rtdb, `quizzes/${code}`));
    if (quizSnap.exists()) {
      state.roomTypes[code] = 'quizzes';
      return 'quizzes';
    }
    const surveySnap = await get(ref(rtdb, `surveys/${code}`));
    if (surveySnap.exists()) {
      state.roomTypes[code] = 'surveys';
      return 'surveys';
    }
  } catch (error) {
    console.error('Error detecting room type for:', code, error);
  }
  // Default fallback
  return 'quizzes';
}

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

async function getSession(sid, rootType = null) {
  const code = String(sid).trim().toUpperCase();
  const root = rootType || await detectRoomType(code);
  const snap = await get(ref(rtdb, `${root}/${code}`));
  return snap.exists() ? snap.val() : null;
}

async function resolveUniqueCode() {
  let code = generateSessionCode(4);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const qSnap = await get(ref(rtdb, `quizzes/${code}`));
    const sSnap = await get(ref(rtdb, `surveys/${code}`));
    if (!qSnap.exists() && !sSnap.exists()) return code;
    code = generateSessionCode(attempt >= 4 ? 5 : 4);
  }
  return `${generateSessionCode(4)}${Date.now().toString().slice(-2)}`;
}

window.quiz = {
  createRoom: async (payload) => {
    const root = payload.type === 'survey' ? 'surveys' : 'quizzes';
    const otherRoot = payload.type === 'survey' ? 'quizzes' : 'surveys';
    const requestedCode = String(payload?.code ?? payload?.sessionId ?? '').trim().toUpperCase();
    if (requestedCode) {
      const otherSnap = await get(ref(rtdb, `${otherRoot}/${requestedCode}`));
      if (otherSnap.exists()) {
        const otherName = payload.type === 'survey' ? 'Quiz' : 'Survey';
        throw new Error(`Room code "${requestedCode}" is already in use by a ${otherName}. Please choose a different code.`);
      }
      
      const sameSnap = await get(ref(rtdb, `${root}/${requestedCode}`));
      if (sameSnap.exists()) {
        // Cache immediately and return the code (do NOT overwrite!)
        state.roomTypes[requestedCode] = root;
        return requestedCode;
      }
    }
    const sid = requestedCode || await resolveUniqueCode();

    // Cache immediately to prevent network lookup loop on redirect
    state.roomTypes[sid] = root;

    const data = {
      type: payload.type || 'quiz',
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
    await set(ref(rtdb, `${root}/${sid}`), data);
    return sid;
  },

  addQuestion: async (sid, question) => {
    const root = await detectRoomType(sid);
    const nextQuestion = normalizeQuestion(question);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    questions.push(nextQuestion);
    await set(ref(rtdb, `${root}/${sid}/questions`), questions);
    return questions.length - 1;
  },

  updateQuestion: async (sid, qIdx, question) => {
    const root = await detectRoomType(sid);
    const normalized = normalizeQuestion(question);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx >= 0 && qIdx < questions.length) {
      questions[qIdx] = normalized;
      await set(ref(rtdb, `${root}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  reorderQuestions: async (sid, qIdx1, qIdx2) => {
    const root = await detectRoomType(sid);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx1 >= 0 && qIdx1 < questions.length && qIdx2 >= 0 && qIdx2 < questions.length) {
      const temp = questions[qIdx1];
      questions[qIdx1] = questions[qIdx2];
      questions[qIdx2] = temp;
      await set(ref(rtdb, `${root}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  deleteQuestion: async (sid, qIdx) => {
    const root = await detectRoomType(sid);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    if (qIdx >= 0 && qIdx < questions.length) {
      questions.splice(qIdx, 1);
      await set(ref(rtdb, `${root}/${sid}/questions`), questions);
      return true;
    }
    return false;
  },

  onRoomUpdate: (sid, cb) => {
    let unsub = null;
    let isCancelled = false;
    detectRoomType(sid).then((root) => {
      if (isCancelled) return;
      const r = ref(rtdb, `${root}/${sid}`);
      unsub = onValue(r, (snap) => {
        cb(snap.val());
      });
    });
    return () => {
      isCancelled = true;
      if (unsub) unsub();
    };
  },

  joinRoom: async (sid, name, avatar = '👤', playerId = null) => {
    const root = await detectRoomType(sid);
    const pid = String(playerId || '').trim() || push(ref(rtdb, `${root}/${sid}/players`)).key;
    const existingScoreSnap = await get(ref(rtdb, `${root}/${sid}/scores/${pid}`));

    await set(ref(rtdb, `${root}/${sid}/players/${pid}`), { name, avatar, joinedAt: Date.now() });
    await update(ref(rtdb, `${root}/${sid}/scores/${pid}`), {
      name,
      avatar,
      score: existingScoreSnap.exists() ? Number(existingScoreSnap.val()?.score || 0) : 0
    });
    return pid;
  },

  leaveRoom: async (sid, pid) => {
    try {
      const root = await detectRoomType(sid);
      await remove(ref(rtdb, `${root}/${sid}/players/${pid}`));
    } catch (e) {}
  },

  submitAnswer: async (sid, qIdx, pid, answerIdx) => {
    const root = await detectRoomType(sid);
    const path = `${root}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid, root);
    if (!session || Number(session.activeQuestionIndex) !== Number(qIdx) || session.state !== 'question') return false;

    const question = Array.isArray(session.questions) ? session.questions[qIdx] : null;
    if (!question) return false;

    const answeredAt = Date.now();
    const isCorrect = Number(answerIdx) === Number(question.correct);
    let awardedPoints = 0;

    // Only compute speed points for Quizzes
    if (isCorrect && root === 'quizzes') {
      const totalMs = Math.max(5000, Number(question.time || 15) * 1000);
      const startAt = Number(session.activeQuestionStartedAt || answeredAt);
      const remaining = Math.max(0, (startAt + totalMs) - answeredAt);
      const speedRatio = Math.min(1, Math.max(0, remaining / totalMs));
      awardedPoints = Math.round(500 + (speedRatio * 500));
    }

    const { committed } = await runTransaction(ref(rtdb, path), (currentData) => {
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
    const root = await detectRoomType(sid);
    const path = `${root}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid, root);
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
    const root = await detectRoomType(sid);
    const path = `${root}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid, root);
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
    const root = await detectRoomType(sid);
    const path = `${root}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid, root);
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
    const root = await detectRoomType(sid);
    const path = `${root}/${sid}/answers/${qIdx}/${pid}`;
    const session = await getSession(sid, root);
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
    const root = await detectRoomType(sid);
    const qaRef = push(ref(rtdb, `${root}/${sid}/qa`));
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
    const root = await detectRoomType(sid);
    await update(ref(rtdb, `${root}/${sid}/qa/${qid}`), {
      answered: Boolean(answeredStatus)
    });
  },

  toggleShowResults: async (sid, showResults) => {
    const root = await detectRoomType(sid);
    await update(ref(rtdb, `${root}/${sid}`), {
      showResults: Boolean(showResults)
    });
  },

  startQuestion: async (sid, qIdx = null) => {
    const root = await detectRoomType(sid);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');

    const questions = Array.isArray(session.questions) ? session.questions : [];
    
    // Progress naturally from active slide or last completed reveal/leaderboard slide index
    const currentIndex = session.activeQuestionIndex != null ? Number(session.activeQuestionIndex) : (session.revealQuestionIndex != null ? Number(session.revealQuestionIndex) : -1);
    const nextIndex = qIdx == null ? (Number.isInteger(currentIndex) ? currentIndex + 1 : 0) : Number(qIdx);
    const nextQuestion = questions[nextIndex];

    if (!nextQuestion) {
      await update(ref(rtdb, `${root}/${sid}`), {
        state: 'finished',
        activeQuestionIndex: null,
        activeQuestionStartedAt: null,
        activeQuestionEndsAt: null,
      });
      return null;
    }

    const startedAt = Date.now();
    await update(ref(rtdb, `${root}/${sid}`), {
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
    const root = await detectRoomType(sid);
    const session = await getSession(sid, root);
    if (!session || !Number.isInteger(Number(session.activeQuestionIndex))) return null;
    const idx = Number(session.activeQuestionIndex);

    if (root === 'surveys') {
      await update(ref(rtdb, `surveys/${sid}`), {
        state: 'question',
        activeQuestionEndsAt: null,
        showResults: true
      });
      return idx;
    }

    // Quiz correctness and points scoring logic
    const question = Array.isArray(session.questions) ? session.questions[idx] : null;
    const updatedScores = { ...(session.scores || {}) };

    if (question && question.type === 'multiple-choice') {
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

      const answersSnap = await get(ref(rtdb, `${root}/${sid}/answers/${idx}`));
      if (answersSnap.exists()) {
        const answers = answersSnap.val();
        Object.keys(answers).forEach((pid) => {
          const ans = answers[pid];
          if (ans.isCorrect && ans.awardedPoints > 0) {
            if (!updatedScores[pid]) {
               updatedScores[pid] = { name: 'Player', avatar: '👤', lastScore: 0, roundPoints: 0, score: 0 };
            }
            updatedScores[pid].roundPoints = ans.awardedPoints;
            updatedScores[pid].score = updatedScores[pid].lastScore + ans.awardedPoints;
          }
        });
      }
    }

    await update(ref(rtdb, `${root}/${sid}`), {
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
    const root = await detectRoomType(sid);
    if (root === 'surveys') return true; // No leaderboard in survey mode

    await update(ref(rtdb, `${root}/${sid}`), {
      state: 'leaderboard'
    });
    return true;
  },

  clearReveal: async (sid) => {
    const root = await detectRoomType(sid);
    await update(ref(rtdb, `${root}/${sid}`), {
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
    const root = await detectRoomType(sid);
    await update(ref(rtdb, `${root}/${sid}`), {
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

  detectRoomType: async (sid) => detectRoomType(sid),

  updateSession: async (sid, payload) => {
    const root = await detectRoomType(sid);
    await update(ref(rtdb, `${root}/${sid}`), payload);
  },

  addAndStartQuestion: async (sid, question) => {
    const root = await detectRoomType(sid);
    const nextQuestion = normalizeQuestion(question);
    const session = await getSession(sid, root);
    if (!session) throw new Error('Room not found');
    const questions = Array.isArray(session.questions) ? session.questions.slice() : [];
    questions.push(nextQuestion);
    const nextIndex = questions.length - 1;
    const startedAt = Date.now();

    const updates = {};
    updates['questions'] = questions;
    updates['state'] = 'question';
    updates['activeQuestionIndex'] = nextIndex;
    updates['activeQuestionStartedAt'] = startedAt;
    updates['activeQuestionEndsAt'] = startedAt + Math.max(5, Number(nextQuestion.time || 15) * 1000);
    updates['revealQuestionIndex'] = null;
    updates['revealCorrectIndex'] = null;
    updates['revealEndsAt'] = null;
    updates['showResults'] = false;

    await update(ref(rtdb, `${root}/${sid}`), updates);
    return nextIndex;
  },

  sendReaction: async (sid, emoji) => {
    const root = await detectRoomType(sid);
    const reactionsRef = push(ref(rtdb, `${root}/${sid}/reactions`));
    await set(reactionsRef, {
      emoji: String(emoji),
      ts: Date.now()
    });
    return reactionsRef.key;
  },

  onReaction: (sid, cb) => {
    let unsub = null;
    let isCancelled = false;
    detectRoomType(sid).then((root) => {
      if (isCancelled) return;
      const r = ref(rtdb, `${root}/${sid}/reactions`);
      unsub = onValue(r, (snap) => {
        cb(snap.val());
      });
    });
    return () => {
      isCancelled = true;
      if (unsub) unsub();
    };
  },

  // Legacy compatibility mapping
  createSession: async (p) => window.quiz.createRoom(p),
  joinSession: async (sid, name) => window.quiz.joinRoom(sid, name),
  leaveSession: async (sid, pid) => window.quiz.leaveRoom(sid, pid),
  onSessionUpdate: (sid, cb) => window.quiz.onRoomUpdate(sid, cb),
  resetSession: async (sid) => window.quiz.resetRoom(sid)
};

