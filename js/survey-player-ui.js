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

  // Handle untimed slides
  if (question.time >= 3600) {
    document.getElementById('playerTimer').innerText = 'Untimed';
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
  const savedAnswer = snapshot?.answers?.[index]?.[state.playerId] || null;

  state.currentIndex = Number.isInteger(index) ? index : null;
  state.currentQuestion = question;

  if (!question) {
    stopTimer();
    document.getElementById('timerFill').style.width = '0%';
    document.getElementById('playerTimer').innerText = '--';
    document.getElementById('questionIndex').innerText = '0';
    document.getElementById('liveSlideHeader').innerText = 'Lobby';
    document.getElementById('questionText').innerText = 'THE SURVEY WILL BEGIN SHORTLY';
    
    ui.playerInputContainer.innerHTML = `
      <div class="text-center" style="padding: 24px 0;">
        <h3 style="color:var(--primary); margin-bottom:8px; font-size:1.4rem;">Get Ready!</h3>
        <p style="color:var(--text-muted); font-size:1.05rem; line-height:1.4;">THE SURVEY WILL BEGIN SHORTLY</p>
      </div>
    `;
    document.getElementById('playerHint').innerText = 'Locked in. Waiting for presenter...';
    return;
  }

  const isAnonymous = snapshot?.isAnonymous === true;
  document.getElementById('questionIndex').innerText = index + 1;
  document.getElementById('liveSlideHeader').innerHTML = `Slide ${index + 1} (${question.type.replace('-', ' ')}) ${isAnonymous ? '<span style="color:var(--accent); margin-left:8px; font-weight:bold;">🕵️ Anonymous Survey</span>' : ''}`;
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
      if (!state.revealSoundPlayed) {
        if (state.selectedAnswer !== null) {
          playSuccessSound(); // Play neutral success chime in survey
        }
        state.revealSoundPlayed = true;
      }

      document.getElementById('playerTimer').innerText = 'Reveal';
      document.getElementById('timerFill').style.width = '100%';

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
        const isPlayerSelected = Number(state.selectedAnswer) === idx;

        return `
          <div style="margin-top: 8px; display: grid; grid-template-columns: 32px 1fr 50px; gap: 12px; align-items: center; background: ${isPlayerSelected ? 'rgba(30,78,216,0.04)' : '#ffffff'}; border: 1px solid ${isPlayerSelected ? 'var(--primary)' : 'var(--border)'}; padding: 10px 14px; border-radius: 12px; width:100%;">
            <span style="font-weight:800; color: var(--text-main); font-size:0.95rem;">${letter}</span>
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
          <h4 style="font-size: 0.95rem; color: var(--text-muted); border-bottom: 1px solid var(--border); padding-bottom: 6px; text-align:left;">Audience Vote Distribution</h4>
          ${chartBarsHtml}
        </div>
      `;
      document.getElementById('playerHint').innerText = 'Results are shown. Waiting for presenter...';
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
  } else if (question.type === 'word-cloud' || question.type === 'open-ended') {
    if (state.selectedAnswer !== null) {
      ui.playerInputContainer.innerHTML = `
        <div class="text-center" style="padding: 24px 0;">
          <h4 style="color:var(--primary); font-size:1.2rem; margin-bottom:6px;">Response Submitted!</h4>
          <p style="color:var(--text-muted); font-size:0.95rem;">"${state.selectedAnswer}"</p>
        </div>
      `;
      document.getElementById('playerHint').innerText = 'Locked in. Waiting for other players...';
      return;
    }
    ui.playerInputContainer.innerHTML = `
      <div style="width:100%;">
        <textarea id="textResponseInput" class="form-control" style="width:100%; min-height:80px; padding:12px; border-radius:12px; border:1px solid var(--border); font-family:inherit; font-size:1rem;" placeholder="Type your response here..."></textarea>
        <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="window.submitTextResponse()">Submit Response</button>
      </div>
    `;
    updateTimer(snapshot, question);
  } else if (question.type === 'scales') {
    const values = Array.isArray(state.selectedAnswer) ? state.selectedAnswer : (question.options || []).map(() => 5);
    
    if (state.selectedAnswer !== null && Array.isArray(state.selectedAnswer)) {
      let breakdownHtml = '<div style="width:100%; display:grid; gap:8px;">';
      (question.options || []).forEach((opt, idx) => {
        breakdownHtml += `
          <div style="display:flex; justify-content:space-between; background:#ffffff; border:1px solid var(--border); padding:8px 12px; border-radius:10px; font-size:0.9rem;">
            <span>${opt}</span>
            <strong style="color:var(--primary);">${values[idx]}/10</strong>
          </div>
        `;
      });
      breakdownHtml += '</div>';
      ui.playerInputContainer.innerHTML = breakdownHtml;
      document.getElementById('playerHint').innerText = 'Locked in. Waiting for next slide...';
      return;
    }

    let scalesHtml = '<div style="width:100%; display:grid; gap:16px;">';
    (question.options || []).forEach((opt, idx) => {
      scalesHtml += `
        <div style="display:grid; gap:6px;">
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:0.9rem; color:var(--text-main);">
            <span>${opt}</span>
            <span id="scaleValLabel_${idx}" style="color:var(--primary);">5/10</span>
          </div>
          <input type="range" class="scale-slider" id="scaleInput_${idx}" min="1" max="10" value="5" style="width:100%;" oninput="document.getElementById('scaleValLabel_${idx}').innerText = this.value + '/10'">
        </div>
      `;
    });
    scalesHtml += `<button class="btn btn-primary" style="width:100%; margin-top:8px;" onclick="window.submitScalesResponse()">Submit Ratings</button></div>`;
    ui.playerInputContainer.innerHTML = scalesHtml;
    updateTimer(snapshot, question);
  }

  // Update hints and side details
  const answered = state.selectedAnswer !== null;
  document.getElementById('answerState').innerText = `Submitted: ${answered ? 'Yes' : 'No'}`;
  document.getElementById('playerHint').innerText = answered ? 'Locked in. Waiting for presenter...' : 'Submit your response!';
}

window.selectAnswer = async (idx) => {
  if (state.selectedAnswer !== null) return;
  state.selectedAnswer = idx;
  playBeep(880, 0.08);
  document.getElementById('answerState').innerText = 'Submitted: Yes';
  document.getElementById('playerHint').innerText = 'Submitting answer...';
  
  try {
    await quiz.submitAnswer(state.sessionId, state.currentIndex, state.playerId, idx);
    document.getElementById('playerHint').innerText = 'Locked in. Waiting for other players...';
  } catch (err) {
    alert('Error submitting answer: ' + err.message);
    state.selectedAnswer = null;
    document.getElementById('answerState').innerText = 'Submitted: No';
  }
};

window.submitTextResponse = async () => {
  const el = document.getElementById('textResponseInput');
  if (!el) return;
  const val = el.value.trim();
  if (!val) return alert('Please enter some text before submitting.');
  
  state.selectedAnswer = val;
  playBeep(880, 0.08);
  document.getElementById('answerState').innerText = 'Submitted: Yes';
  document.getElementById('playerHint').innerText = 'Submitting response...';
  
  try {
    await quiz.submitAnswer(state.sessionId, state.currentIndex, state.playerId, val);
    renderQuestionForm(state.snapshot);
  } catch (err) {
    alert('Error submitting response: ' + err.message);
    state.selectedAnswer = null;
    document.getElementById('answerState').innerText = 'Submitted: No';
  }
};

window.submitScalesResponse = async () => {
  const sliders = ui.playerInputContainer.querySelectorAll('.scale-slider');
  const values = [];
  sliders.forEach(slider => {
    values.push(Number(slider.value));
  });

  state.selectedAnswer = values;
  playBeep(880, 0.08);
  document.getElementById('answerState').innerText = 'Submitted: Yes';
  document.getElementById('playerHint').innerText = 'Submitting ratings...';

  try {
    await quiz.submitAnswer(state.sessionId, state.currentIndex, state.playerId, values);
    renderQuestionForm(state.snapshot);
  } catch (err) {
    alert('Error submitting ratings: ' + err.message);
    state.selectedAnswer = null;
    document.getElementById('answerState').innerText = 'Submitted: No';
  }
};

// Bind floating emoji reaction buttons
document.querySelectorAll('.reaction-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const emoji = btn.getAttribute('data-emoji');
    if (!state.sessionId) return;
    
    // Scale animation on click
    btn.style.transform = 'scale(1.4)';
    setTimeout(() => btn.style.transform = 'scale(1)', 150);
    
    try {
      await quiz.sendReaction(state.sessionId, emoji);
    } catch (e) {
      console.warn('Could not send emoji reaction:', e);
    }
  });
});

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

async function initSurveyPlayer() {
  const params = new URLSearchParams(window.location.search);
  const codeParam = params.get('code');
  const nameParam = params.get('name');
  const avatarParam = params.get('avatar');

  if (!codeParam || !nameParam) {
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
    alert('Error joining survey room: ' + error.message);
    window.location.href = 'index.html';
  }
}

initSurveyPlayer();
