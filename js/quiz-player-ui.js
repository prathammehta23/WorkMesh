import './quiz-core.js';
const quiz = window.quiz;

const ui = {
  quizRoot: document.getElementById('quizRoot'),
  optionList: document.getElementById('optionList'),
  playerInputContainer: document.getElementById('playerInputContainer'),
  leaveBtn: document.getElementById('leaveBtn')
};

const state = {
  sessionId: '',
  playerId: '',
  playerName: '',
  playerAvatar: '🐯',
  currentIndex: null,
  currentQuestion: null,
  selectedAnswer: null,
  revealSoundPlayed: false,
  timerInterval: null,
  unsubscribe: null
};

const PLAYER_SESSION_KEY = 'workmesh_quiz_player_session';

function savePlayerSession() {
  localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify({
    playerAvatar: state.playerAvatar,
    playerId: state.playerId,
    playerName: state.playerName,
    sessionId: state.sessionId
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

function updateTimer(snapshot, question) {
  stopTimer();
  if (!snapshot || !question || snapshot.state !== 'question' || snapshot.activeQuestionEndsAt == null) {
    document.getElementById('playerTimer').innerText = '--';
    document.getElementById('timerFill').style.width = '0%';
    if (snapshot && snapshot.state === 'question' && snapshot.activeQuestionEndsAt == null) {
      document.getElementById('playerHint').innerText = 'Voting closed by presenter. Waiting for next slide...';
      ui.playerInputContainer.querySelectorAll('button, input, select, textarea').forEach(el => el.disabled = true);
    }
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

function playSuccessSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const playNote = (freq, time, dur) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + dur);
    };
    playNote(523.25, now, 0.15);     // C5
    playNote(659.25, now + 0.1, 0.15); // E5
    playNote(783.99, now + 0.2, 0.15); // G5
    playNote(1046.50, now + 0.3, 0.3); // C6
  } catch (e) {}
}

function renderQuestionForm(snapshot) {
  const index = Number(snapshot?.activeQuestionIndex ?? snapshot?.revealQuestionIndex);
  const question = snapshot?.questions?.[index] || null;
  const questionChanged = state.currentIndex !== index;
  const isReveal = snapshot?.state === 'reveal' || (snapshot?.state === 'question' && snapshot?.activeQuestionEndsAt == null);
  const isLeaderboardState = snapshot?.state === 'leaderboard' || question?.type === 'leaderboard';
  const savedAnswer = snapshot?.answers?.[index]?.[state.playerId] || null;

  state.currentIndex = Number.isInteger(index) ? index : null;
  state.currentQuestion = question;

  if (isLeaderboardState) {
    stopTimer();
    document.getElementById('timerFill').style.width = '0%';
    document.getElementById('playerTimer').innerText = '--';
    document.getElementById('questionIndex').innerText = 'Score';
    document.getElementById('liveSlideHeader').innerText = 'Leaderboard';
    document.getElementById('questionText').innerText = 'Round Standings';
    
    const scores = snapshot.scores || {};
    const rankItems = Object.keys(scores)
      .map(k => ({ name: scores[k].name, avatar: scores[k].avatar || '👤', score: scores[k].score }))
      .sort((a, b) => b.score - a.score);

    let html = '<div style="width:100%; display:grid; gap:8px;">';
    rankItems.forEach((entry, idx) => {
      const isMe = entry.name === state.playerName;
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:${isMe ? 'rgba(30,78,216,0.06)' : '#ffffff'}; border: 1px solid ${isMe ? 'var(--primary)' : 'var(--border)'}; padding: 12px 16px; border-radius:12px; font-weight:${isMe ? '700' : '500'};">
          <span style="font-size:1.05rem;">${idx + 1}. ${entry.avatar} ${entry.name} ${isMe ? '<strong>(You)</strong>' : ''}</span>
          <strong style="color:var(--primary); font-family:'Roboto Mono'; font-size:1.05rem;">${entry.score} pts</strong>
        </div>
      `;
    });
    html += '</div>';
    
    ui.playerInputContainer.innerHTML = html;
    document.getElementById('playerHint').innerText = 'Check the standings!';
    return;
  }

  if (!question) {
    stopTimer();
    document.getElementById('timerFill').style.width = '0%';
    document.getElementById('playerTimer').innerText = '--';
    document.getElementById('questionIndex').innerText = '0';
    document.getElementById('liveSlideHeader').innerText = 'Lobby';
    document.getElementById('questionText').innerText = 'THE QUIZ WILL BEGIN SHORTLY';
    
    ui.playerInputContainer.innerHTML = `
      <div class="text-center" style="padding: 24px 0;">
        <h3 style="color:var(--primary); margin-bottom:8px; font-size:1.4rem;">Get Ready!</h3>
        <p style="color:var(--text-muted); font-size:1.05rem; line-height:1.4;">THE QUIZ WILL BEGIN SHORTLY</p>
      </div>
    `;
    document.getElementById('playerHint').innerText = 'Locked in. Waiting for host...';
    return;
  }

  document.getElementById('questionIndex').innerText = index + 1;
  document.getElementById('liveSlideHeader').innerText = `Slide ${index + 1} (${question.type.replace('-', ' ')})`;
  document.getElementById('questionText').innerText = question.text || 'Untitled Slide';

  if (questionChanged) {
    state.selectedAnswer = null;
    state.revealSoundPlayed = false;
  }

  if (savedAnswer !== null && state.selectedAnswer === null) {
    state.selectedAnswer = savedAnswer.answer;
  }

  const isClosed = snapshot.activeQuestionEndsAt != null && Number(snapshot.activeQuestionEndsAt) <= Date.now();

  if (question.type === 'multiple-choice') {
    const revealedCorrectIndex = Number(snapshot.revealCorrectIndex != null ? snapshot.revealCorrectIndex : question.correctOptionIndex);
    
    if (isReveal) {
      stopTimer();
      const isCorrect = state.selectedAnswer === revealedCorrectIndex;
      const correctLetter = String.fromCharCode(65 + revealedCorrectIndex);

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

      const answersObj = snapshot.answers?.[index] || {};
      const choiceCounts = [0, 0, 0, 0];
      Object.keys(answersObj).forEach(k => {
        const idx = Number(answersObj[k].answer);
        if (idx >= 0 && idx < 4) choiceCounts[idx] += 1;
      });

      const totalVotes = choiceCounts.reduce((a, b) => a + b, 0);
      const colors = [['#2563eb', '#60a5fa'], ['#06b6d4', '#5eead4'], ['#7c3aed', '#a78bfa'], ['#f43f5e', '#fb7185']];

      let chartBarsHtml = (question.options || []).map((option, idx) => {
        const val = choiceCounts[idx];
        const pct = totalVotes > 0 ? (val / totalVotes) * 100 : 0;
        const letter = String.fromCharCode(65 + idx);
        const isCorrectOption = idx === revealedCorrectIndex;
        const isPlayerSelected = Number(state.selectedAnswer) === idx;

        return `
          <div style="margin-top: 8px; display: grid; grid-template-columns: 32px 1fr 50px; gap: 12px; align-items: center; background: ${isCorrectOption ? 'rgba(34,197,94,0.06)' : isPlayerSelected ? 'rgba(30,78,216,0.04)' : '#ffffff'}; border: 1px solid ${isCorrectOption ? '#22c55e' : isPlayerSelected ? 'var(--primary)' : 'var(--border)'}; padding: 10px 14px; border-radius: 12px; width:100%;">
            <span style="font-weight:800; color: ${isCorrectOption ? '#22c55e' : 'var(--text-main)'}; font-size:0.95rem;">${letter}</span>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:700; color:var(--text-main); font-size:0.9rem; word-break:break-word;">${option}</div>
              <div style="height: 6px; background: rgba(30,78,216,0.06); border-radius:999px; margin-top: 6px; overflow:hidden;">
                <div style="height:100%; width: ${pct}%; background: linear-gradient(90deg, ${colors[idx][0]}, ${colors[idx][1]}); border-radius:inherit;"></div>
              </div>
            </div>
            <span style="text-align:right; font-family:'Roboto Mono'; font-weight:700; font-size:0.8rem; color:var(--text-muted);">${val} (${Math.round(pct)}%)</span>
          </div>
        `;
      }).join('');

      ui.playerInputContainer.innerHTML = `
        <div style="width: 100%; display: grid; gap: 8px; margin-bottom:12px;">
          ${feedbackHtml}
          <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Audience Vote Distribution</h4>
          ${chartBarsHtml}
        </div>
      `;
      document.getElementById('playerHint').innerText = 'Results are shown. Waiting for host...';
      return;
    }

    const alphabet = ['A', 'B', 'C', 'D'];
    const html = (question.options || []).map((opt, idx) => {
      const isSelected = Number(state.selectedAnswer) === idx;
      const isDisabled = state.selectedAnswer !== null || isClosed;
      return `
        <button class="answer-card ${isSelected ? 'selected' : ''}" 
                style="display:flex; align-items:center; gap:16px; text-align:left;"
                ${isDisabled ? 'disabled' : ''} 
                onclick="window.selectAnswer(${idx})">
          <span class="answer-badge">${alphabet[idx]}</span>
          <span style="font-weight:700; font-size:1.05rem; overflow-wrap:anywhere;">${opt}</span>
        </button>
      `;
    }).join('');

    ui.playerInputContainer.innerHTML = `<div class="quiz-answer-grid" style="width:100%;">${html}</div>`;
    updateTimer(snapshot, question);
  }

  // Update hints and side details
  const answered = state.selectedAnswer !== null;
  document.getElementById('answerState').innerText = `Answered: ${answered ? 'Yes' : 'No'}`;
  document.getElementById('playerHint').innerText = answered ? 'Locked in. Waiting for other players...' : 'Select an option to lock in your answer!';
}

window.selectAnswer = async (idx) => {
  if (state.selectedAnswer !== null) return;
  state.selectedAnswer = idx;
  playBeep(880, 0.08);
  document.getElementById('answerState').innerText = 'Answered: Yes';
  document.getElementById('playerHint').innerText = 'Submitting answer...';
  
  try {
    await quiz.submitAnswer(state.sessionId, state.currentIndex, state.playerId, idx);
    document.getElementById('playerHint').innerText = 'Locked in. Waiting for other players...';
  } catch (err) {
    alert('Error submitting answer: ' + err.message);
    state.selectedAnswer = null;
    document.getElementById('answerState').innerText = 'Answered: No';
  }
};

function watchRoom(sessionId) {
  if (state.unsubscribe) state.unsubscribe();
  let rAF = null;
  let pendingSnapshot = null;
  state.unsubscribe = quiz.onRoomUpdate(sessionId, (snapshot) => {
    if (snapshot && snapshot.state !== 'finished' && state.playerId && (!snapshot.players || !snapshot.players[state.playerId])) {
      quiz.joinRoom(state.sessionId, state.playerName, state.playerAvatar, state.playerId)
        .catch(err => console.warn("Failed to auto-rejoin:", err));
    }
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

ui.leaveBtn.addEventListener('click', () => {
  if (state.sessionId && state.playerId) {
    quiz.leaveRoom(state.sessionId, state.playerId);
  }
  clearPlayerSession();
  window.location.href = 'index.html';
});

async function initQuizPlayer() {
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('code');
  const nameParam = params.get('name');
  const avatarParam = params.get('avatar');

  if (!codeParam || !nameParam) {
    // If not direct URL, check if there's a saved session
    const saved = readPlayerSession();
    if (saved?.sessionId && saved?.playerName) {
      state.sessionId = saved.sessionId;
      state.playerName = saved.playerName;
      state.playerAvatar = saved.playerAvatar || '🐯';
      state.playerId = saved.playerId || null;
    } else {
      window.location.href = 'index.html';
      return;
    }
  } else {
    state.sessionId = codeParam.toUpperCase();
    state.playerName = nameParam;
    state.playerAvatar = avatarParam || '🐯';
  }

  try {
    state.playerId = await quiz.joinRoom(state.sessionId, state.playerName, state.playerAvatar, state.playerId || null);
    savePlayerSession();
    setHeader({ state: 'lobby' });
    watchRoom(state.sessionId);
  } catch (error) {
    alert('Error joining room: ' + error.message);
    window.location.href = 'index.html';
  }
}

initQuizPlayer();
