import './quiz-core.js';
const quiz = window.quiz;

const ui = {
  avatarPickerGrid: document.getElementById('avatarPickerGrid'),
  playerName: document.getElementById('playerName'),
  sessionCode: document.getElementById('sessionCode'),
  joinBtn: document.getElementById('joinBtn')
};

const state = {
  playerAvatar: '🐯',
  sessionId: '',
  playerName: ''
};

const PLAYER_SESSION_KEY = 'workmesh_quiz_player_session';

function savePlayerSession() {
  localStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify({
    playerAvatar: state.playerAvatar,
    playerName: state.playerName,
    sessionId: state.sessionId
  }));
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
if (params.get('code')) ui.sessionCode.value = params.get('code').toUpperCase();
if (params.get('name')) ui.playerName.value = params.get('name');

const savedSession = readPlayerSession();
if (savedSession) {
  if (savedSession.playerAvatar) {
    state.playerAvatar = savedSession.playerAvatar;
    ui.avatarPickerGrid.querySelectorAll('.avatar-item').forEach(item => {
      item.classList.toggle('selected', item.getAttribute('data-avatar') === savedSession.playerAvatar);
    });
  }
  if (savedSession.playerName) {
    ui.playerName.value = savedSession.playerName;
  }
  if (savedSession.sessionId) {
    ui.sessionCode.value = savedSession.sessionId;
  }
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

ui.joinBtn.addEventListener('click', async () => {
  try {
    const name = ui.playerName.value.trim() || 'Anonymous Player';
    const code = ui.sessionCode.value.trim().toUpperCase();
    if (!code) return alert('Enter the Room code.');

    state.sessionId = code;
    state.playerName = name;
    savePlayerSession();
    playBeep(880, 0.05);

    ui.joinBtn.disabled = true;
    ui.joinBtn.innerText = 'Detecting Room...';

    const roomType = await quiz.detectRoomType(code);
    const targetHtml = roomType === 'surveys' ? 'survey.html' : 'quiz.html';
    
    // Redirect to the appropriate HTML with parameters
    window.location.href = `${targetHtml}?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(state.playerAvatar)}`;
  } catch (e) {
    alert('Error connecting: ' + (e.message || e));
    ui.joinBtn.disabled = false;
    ui.joinBtn.innerText = 'Join Room';
  }
});
