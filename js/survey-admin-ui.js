import { auth } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { playClickSound, playSuccessSound } from './sounds.js';
import './quiz-core.js';

    document.body.classList.add('quiz-page');

    const ADMIN_EMAIL_ALLOWLIST = ['admin@workmesh.in'];

    const ui = {
      createSessionBtn: document.getElementById('createSessionBtn'),
      copyShareLinkBtn: document.getElementById('copyShareLinkBtn'),
      backSlideBtn: document.getElementById('backSlideBtn'),
      startNextBtn: document.getElementById('startNextBtn'),
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
      toolbarAnonToggle: document.getElementById('toolbarAnonToggle'),
      toolbarDeepDive: document.getElementById('toolbarDeepDive'),
      toolbarCrossFilter: document.getElementById('toolbarCrossFilter'),
      toolbarExit: document.getElementById('toolbarExit')
    };

    const state = {
      sessionId: null,
      questions: [],
      unsubscribe: null,
      unsubscribeReactions: null,
      session: null,
      revealClearTimeout: null,
      timerTickInterval: null,
      editingIndex: null, // Tracks active index slide being edited
      winnersFanfarePlayed: false,
      renderedLobbyPlayers: new Set(),
      filterSlideIndex: null,
      filterOptionIndex: null,
      processedReactions: new Set()
    };

    function isDeckLocked(snapshot = state.session) {
      return Boolean(snapshot && snapshot.state !== 'lobby' && snapshot.state !== 'finished');
    }

    const HOST_SESSION_KEY = 'workmesh_survey_host_session';

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
      const saved = readHostSession();
      if (!saved?.sessionId) return;

      state.sessionId = String(saved.sessionId).trim().toUpperCase();
      if (saved.roomCode) document.getElementById('roomCodeInput').value = String(saved.roomCode).trim().toUpperCase();
      if (saved.roomTitle) document.getElementById('quizTitle').value = saved.roomTitle;

      ui.sessionCodeDisplay.innerText = state.sessionId;
      ui.copyShareLinkBtn.style.display = 'inline-block';
      wireRoom(state.sessionId);
    }

    // Toggling creator input fields
    ui.slideType.addEventListener('change', () => {
      const type = ui.slideType.value;
      const choiceInputs = document.querySelector('.quiz-option-inputs');
      const correctLabel = document.getElementById('correctAnswerLabel');
      const scalesSection = document.getElementById('scalesStatementsSection');

      if (type === 'multiple-choice') {
        choiceInputs.style.display = 'grid';
        correctLabel.style.display = 'none';
        scalesSection.style.display = 'none';
      } else if (type === 'ranking') {
        choiceInputs.style.display = 'grid';
        correctLabel.style.display = 'none';
        scalesSection.style.display = 'none';
      } else if (type === 'scales') {
        choiceInputs.style.display = 'none';
        correctLabel.style.display = 'none';
        scalesSection.style.display = 'flex';
      } else { // word-cloud & open-ended
        choiceInputs.style.display = 'none';
        correctLabel.style.display = 'none';
        scalesSection.style.display = 'none';
      }
    });

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

    function enterPresenterMode() {
      ui.presenterStage.classList.add('fullscreen-present');
      ui.presenterToolbar.style.display = 'flex';
      if (state.session) renderLiveState(state.session);
      playBeep(880, 0.05);
    }

    function exitPresenterMode() {
      ui.presenterStage.classList.remove('fullscreen-present');
      ui.presenterToolbar.style.display = 'none';
      if (state.editingIndex !== null) {
        window.selectHostQuestion(state.editingIndex);
      } else {
        if (state.session) renderLiveState(state.session);
      }
      playBeep(500, 0.05);
    }

    // Toggle Presenter Fullscreen Mode
    ui.togglePresentBtn.addEventListener('click', enterPresenterMode);
    ui.toolbarExit.addEventListener('click', exitPresenterMode);

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
      const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : -1;

      if (state.session.state === 'lobby') {
        playBeep(700, 0.05);
        await window.quiz.startQuestion(state.sessionId, 0);
      } 
      else if (state.session.state === 'question') {
        const votingActive = state.session.activeQuestionEndsAt != null;
        if (votingActive) {
          playBeep(700, 0.05);
          await window.quiz.endQuestion(state.sessionId);
        } else {
          // Voting is closed, go to next slide or finish survey
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
    }

    ui.toolbarNext.addEventListener('click', handleSmartNextAction);

    const toggleResultsAction = async () => {
      if (!state.sessionId || !state.session) return;
      const currentShow = state.session.showResults !== false;
      await window.quiz.toggleShowResults(state.sessionId, !currentShow);
      playBeep(880, 0.05);
    };

    ui.toggleResultsBtn.addEventListener('click', toggleResultsAction);
    ui.toolbarResults.addEventListener('click', toggleResultsAction);

    let crossFilterEnabled = false;

    window.clearCrossFilter = () => {
      state.filterSlideIndex = null;
      state.filterOptionIndex = null;
      playBeep(600, 0.05);
      renderLiveState(state.session);
    };

    ui.toolbarAnonToggle.addEventListener('click', async () => {
      if (!state.sessionId || !state.session) return;
      const currentAnon = state.session.isAnonymous === true;
      await window.quiz.updateSession(state.sessionId, { isAnonymous: !currentAnon });
      ui.toolbarAnonToggle.innerHTML = !currentAnon ? '🕵️ Anonymity: ON' : '👤 Anonymity: OFF';
      playBeep(880, 0.05);
    });

    ui.toolbarDeepDive.addEventListener('click', async () => {
      if (!state.sessionId || !state.session) return;
      
      const qIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : Number(state.session.revealQuestionIndex);
      if (isNaN(qIdx)) return;
      
      const currentQ = state.questions[qIdx];
      const selectedOption = ui.toolbarDeepDive.dataset.selectedOption;
      const followUpText = selectedOption 
        ? `Deep Dive: Elaborate on why you chose "${selectedOption}" for "${currentQ.text}".`
        : `Deep Dive: Following up on "${currentQ.text}", please elaborate on your choice.`;

      const newSlide = {
        type: 'open-ended',
        text: followUpText,
        time: 3600,
        options: []
      };
      
      // Use atomic add and start helper to prevent race condition
      await window.quiz.addAndStartQuestion(state.sessionId, newSlide);
      playBeep(950, 0.1);
    });

    ui.toolbarCrossFilter.addEventListener('click', async () => {
      crossFilterEnabled = !crossFilterEnabled;
      ui.toolbarCrossFilter.innerHTML = crossFilterEnabled ? '🔗 Cross Filter: ON' : '🔗 Cross Filter: OFF';
      playBeep(880, 0.05);
      renderLiveState(state.session); // Re-render live state to show filter handles
    });

    // Fullscreen / Present mode arrow keys slide control
    document.addEventListener('keydown', async (e) => {
      const isFullscreen = ui.presenterStage.classList.contains('fullscreen-present');
      if (!isFullscreen || !state.sessionId || !state.session) return;

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
    window.selectChartBar = (idx) => {
      document.querySelectorAll('.mc-chart-bar').forEach(b => {
        b.style.opacity = '0.4';
        b.style.boxShadow = 'none';
      });
      const selected = document.getElementById('bar-' + idx);
      if (selected) {
        selected.style.opacity = '1';
        selected.style.boxShadow = '0 0 0 4px var(--primary-light)';
      }
      
      const qIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : Number(state.session.revealQuestionIndex);
      const currentQ = state.questions[qIdx];
      const optionText = currentQ.options[idx];
      
      state.filterSlideIndex = qIdx;
      state.filterOptionIndex = idx;
      
      ui.toolbarDeepDive.dataset.selectedOption = optionText;
      ui.toolbarDeepDive.innerHTML = `🔍 Deep Dive: "${optionText}"`;
      ui.toolbarDeepDive.style.display = 'inline-block';
    };

    window.pinCard = (el) => {
      const isPinned = el.classList.contains('pinned-card');
      if (isPinned) {
        el.classList.remove('pinned-card');
        el.style.transform = el.dataset.origTransform;
        el.style.position = 'relative';
        el.style.zIndex = '1';
        el.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
        document.querySelector('.open-ended-grid').style.opacity = '1';
      } else {
        document.querySelectorAll('.open-ended-card').forEach(c => c.classList.remove('pinned-card'));
        el.dataset.origTransform = el.style.transform;
        el.classList.add('pinned-card');
        el.style.position = 'fixed';
        el.style.top = '50%';
        el.style.left = '50%';
        el.style.transform = 'translate(-50%, -50%) scale(1.5)';
        el.style.zIndex = '9999';
        el.style.boxShadow = '0 20px 40px rgba(0,0,0,0.2)';
        document.querySelector('.open-ended-grid').style.opacity = '0.3';
      }
    };
    
    // Existing helper functions below
    window.selectHostQuestion = async (index) => {
      const question = state.questions[index];
      if (!question) return;

      const isPresenting = ui.presenterStage.classList.contains('fullscreen-present');
      if (!isPresenting && isDeckLocked()) {
        alert('Prepare the slide deck before starting the quiz. Deck editing is locked while the room is live.');
        return;
      }
      if (isPresenting) {
        playBeep(700, 0.05);
        await window.quiz.startQuestion(state.sessionId, index);
        return;
      }

      state.editingIndex = index;
      document.getElementById('slideSettingsPanel').style.display = 'block';
      ui.composerTitle.innerText = `Slide ${index + 1} Settings`;
      
      ui.slideType.value = question.type || 'multiple-choice';
      document.getElementById('correctAnswerLabel').style.display = 'none';
      
      document.getElementById('questionTime').value = String(question.time || 15);
      
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
        ui.previewQuestion.innerText = snapshot?.title || "Welcome to WorkMesh Quiz Lobby!";
        ui.previewMeta.innerText = "Waiting for participants to join with the code below...";
        
        let pBubbles = pKeys.map((k, i) => {
          const isNew = !state.renderedLobbyPlayers.has(k);
          if (isNew) {
            state.renderedLobbyPlayers.add(k);
            if (pKeys.length > 1) playBeep(900 + Math.random() * 200, 0.06); // playful join sound
          }
          const isAnon = snapshot.isAnonymous === true;
          return `
          <div class="lobby-player-bubble ${isNew ? 'animate-pop' : ''}" style="${isAnon ? 'opacity: 0.7; filter: grayscale(100%);' : ''}">
            <span>${isAnon ? '🕵️' : (players[k].avatar || '👤')}</span>
            <strong>${isAnon ? 'Anonymous ' + (i+1) : (players[k].name || 'Player')}</strong>
          </div>
          `;
        }).join('');
        
        ui.visualizerContainer.innerHTML = `
          <link rel="stylesheet" href="css/admin.css">
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

      const isAnonymous = snapshot.isAnonymous === true;
      const anonBadge = isAnonymous ? ' <span class="quiz-badge" style="color:var(--accent); font-weight:bold; margin-left:8px;">🕵️ Anonymous Responses</span>' : '';
      ui.presenterStageLabel.innerHTML = `${type.replace('-', ' ')} Slide${anonBadge}`;
      ui.previewQuestion.innerText = question.text || 'Untitled slide';
      
      if (snapshot?.isDraft) {
        ui.previewQuestion.setAttribute('contenteditable', 'true');
        ui.previewQuestion.style.outline = 'none';
        ui.previewQuestion.style.borderBottom = '1px dashed #cbd5e1';
      } else {
        ui.previewQuestion.removeAttribute('contenteditable');
        ui.previewQuestion.style.borderBottom = 'none';
      }

      // Setup show/hide results button
      if (snapshot.state === 'question') {
        ui.toggleResultsBtn.style.display = 'inline-block';
        ui.endQuestionBtn.style.display = 'inline-block';
        ui.showLeaderboardBtn.style.display = 'none';
        if(ui.toolbarLeaderboard) ui.toolbarLeaderboard.style.display = 'none';
        
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
          ui.toolbarLeaderboard.style.display = 'inline-block'; // show inside fullscreen presenter too
        } else {
          ui.endQuestionBtn.style.display = 'inline-block';
          ui.showLeaderboardBtn.style.display = 'none';
          if(ui.toolbarLeaderboard) ui.toolbarLeaderboard.style.display = 'none';
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
          <div class="results-hidden-overlay" style="max-width: 600px; margin: 40px auto 0; padding: 40px; border-radius: 28px; background: rgba(255, 255, 255, 0.95); border: 1px solid var(--border); box-shadow: 0 20px 40px rgba(30,78,216,0.06); text-align: center; position:relative; overflow:hidden;">
            <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; font-weight:800; color:var(--primary); margin-bottom: 12px;">Round is Active</div>
            <h2 style="font-size: 2.2rem; font-weight: 800; color: var(--text-main); margin-bottom: 24px; letter-spacing:-0.02em;">Waiting for Participants to Vote...</h2>
            
            <div style="position: relative; width: 140px; height: 140px; margin: 0 auto 24px; display: grid; place-items: center;">
              <svg style="position: absolute; transform: rotate(-90deg); width: 100%; height: 100%;">
                <circle cx="70" cy="70" r="62" stroke="rgba(30, 78, 216, 0.06)" stroke-width="12" fill="transparent" />
                <circle cx="70" cy="70" r="62" stroke="var(--primary)" stroke-width="12" fill="transparent" 
                        stroke-dasharray="390" stroke-dashoffset="${390 - (390 * progressPct / 100)}" 
                        style="transition: stroke-dashoffset 0.4s ease;" />
              </svg>
              <div style="text-align: center; z-index: 2;">
                <span style="display: block; font-size: 2.4rem; font-weight: 900; color: var(--text-main); font-family: 'Roboto Mono', monospace; line-height: 1;">${votesSubmitted}</span>
                <span style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-top: 4px;">of ${totalConnected}</span>
              </div>
            </div>

            <p style="font-size: 1.1rem; color: var(--text-muted); font-weight: 600; margin-bottom: 10px;">${votesSubmitted === totalConnected && totalConnected > 0 ? "🎉 Everyone has voted! Host can close the round now." : "Players are locked in. Answers are hidden until closed."}</p>
            <div class="quiz-meter" style="max-width: 320px; margin: 15px auto 0; height: 8px;"><div class="quiz-meter-bar" style="width: ${progressPct}%;"></div></div>
          </div>
        `;
        return;
      }

      // Fetch all answers for this question
      const answersObj = snapshot.answers?.[snapshot.activeQuestionIndex ?? snapshot.revealQuestionIndex] || {};
      let answerKeys = Object.keys(answersObj);

      // Apply cross filtering if enabled and a filter is active
      let filterNoticeHtml = '';
      if (crossFilterEnabled && state.filterSlideIndex != null && state.filterOptionIndex != null) {
        const currentQIdx = snapshot.activeQuestionIndex ?? snapshot.revealQuestionIndex;
        if (currentQIdx !== state.filterSlideIndex) {
          const filterAnswers = snapshot.answers?.[state.filterSlideIndex] || {};
          const allowedPids = new Set(
            Object.keys(filterAnswers).filter(
              pid => Number(filterAnswers[pid]?.answer) === state.filterOptionIndex
            )
          );
          answerKeys = answerKeys.filter(pid => allowedPids.has(pid));
          const filterQuestion = state.questions[state.filterSlideIndex];
          const filterOptionText = filterQuestion?.options?.[state.filterOptionIndex] || `Option ${state.filterOptionIndex + 1}`;
          filterNoticeHtml = `
            <div style="background: rgba(30,78,216,0.06); border: 1px dashed var(--primary); padding: 8px 16px; border-radius: 12px; font-size: 0.9rem; font-weight: 700; color: var(--primary); text-align: center; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 8px;">
              🔗 Cross Filter Active: showing responses from participants who chose "${filterOptionText}" on Slide ${state.filterSlideIndex + 1} (${answerKeys.length} matching)
              <button class="btn btn-outline" style="padding: 2px 8px; font-size: 0.75rem; border-color: var(--primary); color: var(--primary); margin-left: 8px;" onclick="window.clearCrossFilter()">Clear</button>
            </div>
          `;
        }
      }

      if (type === 'multiple-choice') {
        const correctIndex = Number(snapshot.revealCorrectIndex ?? question.correct ?? 0);
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

        let bars = (question.options || []).map((option, idx) => {
          const val = choiceCounts[idx];
          const pct = totalVotes > 0 ? (val / totalVotes) * 100 : 0;
          const letter = String.fromCharCode(65 + idx);
          const isCorrect = snapshot.state === 'reveal' && idx === correctIndex;
          
          return `
            <div class="mc-chart-bar-wrapper" onclick="if(window.selectChartBar) window.selectChartBar(${idx})">
              <div id="bar-${idx}" class="mc-chart-bar ${isCorrect ? 'correct-bar' : ''}" style="height: ${Math.max(5, pct)}%; --color-start: ${colors[idx % colors.length][0]}; --color-end: ${colors[idx % colors.length][1]}; cursor: pointer; transition: all 0.2s;">
                <span class="mc-chart-val">${val}</span>
              </div>
              <div style="display:flex; align-items:center; gap:4px; width:100%; justify-content:center;">
                <div class="mc-chart-label" data-option-idx="${idx}" ${snapshot?.isDraft ? 'contenteditable="true" style="outline:none; border-bottom:1px dashed #cbd5e1;"' : `style="${isCorrect ? 'color:var(--primary); font-weight:800;' : ''}"`}>${snapshot?.isDraft ? option : letter + '. ' + option}</div>
                ${snapshot?.isDraft ? `<button style="background:none; border:none; cursor:pointer; font-size:14px; opacity:0.6;" onclick="window.removeDraftOption(${idx})" title="Delete Option">🗑️</button>` : ''}
              </div>
            </div>
          `;
        }).join('');

        const addBtnHtml = snapshot?.isDraft ? `<div style="text-align:center; margin-top:20px;"><button class="btn btn-outline" style="padding:4px 12px; font-size:0.8rem;" onclick="window.addDraftOption()">➕ Add Option</button></div>` : '';

        ui.visualizerContainer.innerHTML = `
          ${filterNoticeHtml}
          <div class="mc-chart-container">
            ${bars}
          </div>
          ${addBtnHtml}
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total responses: <strong>${totalVotes}</strong></div>
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
          const fontSize = 1 + scale * 2.5; // from 1rem to 3.5rem
          const randColor = niceColors[Math.floor(Math.random() * niceColors.length)];
          const randRot = (Math.random() * 8 - 4) + 'deg';
          return `<span class="word-cloud-item" style="font-size: ${fontSize}rem; color: ${randColor}; --rand-rot: ${randRot}; transform: rotate(${randRot});">${word}</span>`;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          ${filterNoticeHtml}
          <div class="word-cloud-container">
            ${cloudHtml || '<div class="quiz-mini-note">Words will dynamically appear here as players submit them.</div>'}
          </div>
          <div class="quiz-mini-note text-center" style="margin-top: 15px;">Total submissions: <strong>${answerKeys.length} players</strong></div>
        `;
      }
      else if (type === 'open-ended') {
        const noteColors = ['#fff9db', '#ffe3e3', '#e8f7ff', '#ebfbee', '#f3f0ff', '#fff4e6'];
        let cardsHtml = answerKeys.map((k, idx) => {
          const text = answersObj[k].answer || answersObj[k].text || '';
          const player = snapshot.players?.[k] || { name: 'Audience member', avatar: '👤' };
          const randColor = noteColors[idx % noteColors.length];
          const randRot = (Math.random() * 6 - 3) + 'deg';
          const displayName = state.session.isAnonymous ? 'Anonymous' : `${player.avatar} ${player.name}`;
          return `
            <div class="open-ended-card" style="background: ${randColor}; transform: rotate(${randRot}); border-top: 5px solid rgba(0,0,0,0.05); cursor: pointer;" onclick="if(window.pinCard) window.pinCard(this)">
              <p>${text}</p>
              <div style="display:flex; justify-content:space-between; margin-top:12px; font-size:0.8rem; color: rgba(0,0,0,0.38); align-items:center; font-weight:700;">
                <span>${displayName}</span>
                <span>💬</span>
              </div>
            </div>
          `;
        }).join('');

        ui.visualizerContainer.innerHTML = `
          ${filterNoticeHtml}
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
          const avg = votes > 0 ? (sum / votes) : 0; // 0 to 5
          const pct = (avg / 5) * 100; // 0 to 100%

          return `
            <div class="scales-row">
              <span class="scales-label" data-statement-idx="${idx}" ${snapshot?.isDraft ? 'contenteditable="true" style="outline:none; border-bottom:1px dashed #cbd5e1;"' : ''}>${stmt}</span>
              <div class="scales-slider-bg">
                <div class="scales-slider-fill" style="width: ${pct}%;"></div>
                <div class="scales-avg-node" style="left: ${pct}%;">${avg.toFixed(1)}</div>
              </div>
              <span class="scales-avg-badge">${avg > 0 ? avg.toFixed(1) + ' ★' : 'No ratings'}</span>
            </div>
          `;
        }).join('');

        const addBtnHtml = snapshot?.isDraft ? `<div style="text-align:center; margin-top:20px;"><button class="btn btn-outline" style="padding:4px 12px; font-size:0.8rem;" onclick="window.addDraftOption()">➕ Add Statement</button></div>` : '';

        ui.visualizerContainer.innerHTML = `
          ${filterNoticeHtml}
          <div class="scales-container">
            ${rowsHtml}
          </div>
          ${addBtnHtml}
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
              <span class="ranking-label" data-option-idx="${entry.index}" ${snapshot?.isDraft ? 'contenteditable="true" style="outline:none; border-bottom:1px dashed #cbd5e1;"' : ''}>${entry.text}</span>
              <div class="ranking-bar">
                <div class="ranking-bar-fill" style="width: ${pct}%;"></div>
              </div>
              <span class="ranking-score">${entry.score} pts</span>
            </div>
          `;
        }).join('');

        const addBtnHtml = snapshot?.isDraft ? `<div style="text-align:center; margin-top:20px;"><button class="btn btn-outline" style="padding:4px 12px; font-size:0.8rem;" onclick="window.addDraftOption()">➕ Add Choice</button></div>` : '';

        ui.visualizerContainer.innerHTML = `
          ${filterNoticeHtml}
          <div class="ranking-container">
            ${rowsHtml}
          </div>
          ${addBtnHtml}
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
      if(ui.toolbarLeaderboard) ui.toolbarLeaderboard.style.display = 'none';

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
      ui.presenterStageLabel.innerText = "Survey Results";
      ui.previewQuestion.innerText = "🎉 Survey Completed! 🎉";
      ui.previewMeta.innerText = "Thank you for participating in this WorkMesh Survey.";
      ui.previewTimer.innerText = "Ended";
      ui.previewProgress.style.width = '100%';
      
      ui.endQuestionBtn.style.display = 'none';
      ui.showLeaderboardBtn.style.display = 'none';
      ui.toggleResultsBtn.style.display = 'none';
      if(ui.toolbarLeaderboard) ui.toolbarLeaderboard.style.display = 'none';

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

      ui.visualizerContainer.innerHTML = `
        <div style="text-align:center; padding: 60px 0;">
          <div style="font-size: 5rem; margin-bottom: 20px;">🎉</div>
          <h3 style="color:var(--primary); font-size: 2.2rem; margin-bottom:12px; font-weight:800;">All survey slides completed!</h3>
          <p class="quiz-mini-note" style="font-size: 1.2rem;">The final results have been captured. Thank you for your active participation and valuable insights!</p>
        </div>
      `;
      return;
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
      const isLastSlide = state.questions && state.questions.length > 0 && 
                          Number(snapshot.activeQuestionIndex) === state.questions.length - 1;

      if (!snapshot) {
        ui.startNextBtn.style.display = 'inline-block';
        ui.startNextBtn.innerText = "Start Slide";
        ui.endQuestionBtn.style.display = 'none';
        ui.addNewSlideBtn.disabled = false;
        return;
      }

      const activeIdx = snapshot.activeQuestionIndex != null ? Number(snapshot.activeQuestionIndex) : null;

      // 1. Sidebar Next/Prev logic
      if (snapshot.state === 'lobby') {
        ui.startNextBtn.style.display = 'inline-block';
        ui.startNextBtn.innerText = "▶️ Start Survey";
        ui.endQuestionBtn.style.display = 'none';
        ui.backSlideBtn.style.display = 'none';
      } 
      else if (snapshot.state === 'question') {
        ui.startNextBtn.style.display = 'inline-block';
        ui.startNextBtn.innerText = isLastSlide ? "🏁 Finish Survey" : "Next Slide ▶️";
        ui.endQuestionBtn.style.display = 'inline-block';
        ui.backSlideBtn.style.display = (activeIdx > 0) ? 'inline-block' : 'none';
      } 
      else if (snapshot.state === 'finished') {
        ui.startNextBtn.style.display = 'none';
        ui.endQuestionBtn.style.display = 'none';
        ui.backSlideBtn.style.display = 'none';
      }

      ui.addNewSlideBtn.disabled = isDeckLocked(snapshot);

      // 2. Fullscreen Presenter Dock Toolbar Buttons
      if (snapshot.state === 'lobby') {
        if (ui.toolbarResults) ui.toolbarResults.style.display = 'none';
        if (ui.toolbarNext) {
          ui.toolbarNext.style.display = 'inline-flex';
          ui.toolbarNext.innerText = "▶️ Start";
          ui.toolbarNext.className = "presenter-toolbar-btn primary";
        }
      } 
      else if (snapshot.state === 'question') {
        if (ui.toolbarResults) {
          ui.toolbarResults.style.display = 'inline-flex';
          const showResults = snapshot.showResults !== false;
          ui.toolbarResults.innerHTML = showResults ? '👁️ Results: ON' : '🙈 Results: OFF';
        }
        if (ui.toolbarNext) {
          ui.toolbarNext.style.display = 'inline-flex';
          ui.toolbarNext.innerText = isLastSlide ? "🏁 Finish" : "Next Slide ▶️";
          ui.toolbarNext.className = "presenter-toolbar-btn primary";
        }
      } 
      else if (snapshot.state === 'finished') {
        if (ui.toolbarResults) ui.toolbarResults.style.display = 'none';
        if (ui.toolbarNext) ui.toolbarNext.style.display = 'none';
      }
    }

    function renderLiveState(snapshot) {
      state.session = snapshot || null;
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

      // Reset Fanfare flag if we leave finished state
      if (snapshot?.state !== 'finished') {
        state.winnersFanfarePlayed = false;
      }

      // If we are actively editing a draft, do NOT overwrite the central canvas with live state updates.
      // We only update the sidebars (queue and controls).
      const isPresenting = ui.presenterStage.classList.contains('fullscreen-present');
      if (isDeckLocked(snapshot)) {
        document.getElementById('slideSettingsPanel').style.display = 'none';
        state.editingIndex = null;
      }
      if (state.editingIndex !== null && !isPresenting) {
        renderQueue();
        updateHostControlButtons(snapshot);
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
        ui.liveReveal.style.display = 'block';
        ui.liveReveal.innerHTML = `
          <div class="quiz-reveal-answer">${String.fromCharCode(65 + revealIndex)}. ${activeQuestion.options[revealIndex] || 'Correct answer'}</div>
          <div style="margin-top:6px; color:var(--text-muted);">The correct answer has been highlighted above. Click "Show Leaderboard" to view points!</div>
        `;
      } else {
        ui.liveReveal.style.display = 'none';
      }

      renderQueue();

      // Render Floating Emojis
      // Render Audience Q&A Drawer
      renderQa(snapshot?.qa);

      // Render Leaderboard in Host sidebar
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

    function spawnFloatingEmoji(emoji) {
      const container = document.getElementById('reactionsContainer');
      if (!container) return;

      const el = document.createElement('span');
      el.className = 'floating-emoji';
      el.innerText = emoji;

      // Random horizontal start position
      const leftPos = Math.random() * 80 + 10; // 10% to 90%
      el.style.left = `${leftPos}%`;
      el.style.bottom = '0%';

      // Random rotation
      const rot = Math.random() * 40 - 20; // -20deg to 20deg
      el.style.setProperty('--rand-rot', `${rot}deg`);

      container.appendChild(el);

      // Remove element after animation finishes
      setTimeout(() => {
        el.remove();
      }, 3000);
    }

    function wireRoom(sessionId) {
      if (state.unsubscribe) state.unsubscribe();
      if (state.unsubscribeReactions) state.unsubscribeReactions();
      
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

      // Wire reactions listener
      state.unsubscribeReactions = window.quiz.onReaction(sessionId, (reactions) => {
        if (!reactions) return;
        Object.keys(reactions).forEach(key => {
          if (!state.processedReactions.has(key)) {
            state.processedReactions.add(key);
            spawnFloatingEmoji(reactions[key].emoji);
          }
        });
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


      ui.createSessionBtn.addEventListener('click', async () => {
        try {
          const title = document.getElementById('quizTitle').value.trim() || 'WorkMesh Live Slide Presentation';
          const requestedCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
          state.sessionId = await window.quiz.createRoom({ title, code: requestedCode, type: 'survey' });
          ui.sessionCodeDisplay.innerText = state.sessionId;
          ui.copyShareLinkBtn.style.display = 'inline-block';
          saveHostSession();
          wireRoom(state.sessionId);
        } catch (e) {
          alert('Error creating room: ' + (e.message || e));
        }
      });

      ui.copyShareLinkBtn.addEventListener('click', () => {
        if (!state.sessionId) return;
        const link = `${window.location.origin}/index.html?code=${state.sessionId}`;
        navigator.clipboard.writeText(link).then(() => {
          const originalText = ui.copyShareLinkBtn.innerText;
          ui.copyShareLinkBtn.innerText = "✅ Copied!";
          setTimeout(() => { ui.copyShareLinkBtn.innerText = originalText; }, 2000);
        });
      });

      // Real-time Canvas Auto-Save Engine
      let saveTimeout;
      const autoSaveDraft = () => {
        if (state.editingIndex === null || !state.sessionId || isDeckLocked()) return;
        clearTimeout(saveTimeout);
        
        const type = ui.slideType.value;
        const text = ui.previewQuestion.innerText.trim();
        const correct = Number(document.getElementById('correctAnswer').value || 0);
        const time = Number(document.getElementById('questionTime').value || 15);
        
        let options = [];
        let statements = [];
        
        if (type === 'multiple-choice' || type === 'ranking') {
          const optEls = document.querySelectorAll('.mc-chart-label, .ranking-label');
          optEls.forEach(el => {
            const txt = el.innerText.trim();
            if (txt) options.push(txt);
          });
          // Ensure at least 2 options exist to prevent total breakage
          if (options.length === 0) options = ['Option 1', 'Option 2'];
          if (options.length === 1) options.push('Option 2');
        } else if (type === 'scales') {
          const optEls = document.querySelectorAll('.scales-label');
          optEls.forEach(el => {
            const txt = el.innerText.trim();
            if (txt) statements.push(txt);
          });
        }
        
        const question = { type, text, options, statements, correct, time };
        
        saveTimeout = setTimeout(async () => {
          await window.quiz.updateQuestion(state.sessionId, state.editingIndex, question);
        }, 600); // 600ms debounce
      };

      ['slideType', 'questionTime', 'correctAnswer'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', autoSaveDraft);
      });
      
      ui.slideType.addEventListener('change', () => {
        if (state.editingIndex !== null) {
          const q = state.questions[state.editingIndex];
          q.type = ui.slideType.value;
          renderVisualizer(q, { state: 'question', isDraft: true });
        }
      });

      // Bi-directional On-Canvas editing sync
      ui.previewQuestion.addEventListener('input', autoSaveDraft);
      ui.visualizerContainer.addEventListener('input', autoSaveDraft);

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
        autoSaveDraft();
      };

      window.removeDraftOption = (index) => {
        if (state.editingIndex === null) return;
        const q = state.questions[state.editingIndex];
        if (q.type === 'multiple-choice' || q.type === 'ranking') {
          q.options = q.options || [];
          if (q.options.length <= 2) return; // Prevent deleting below 2 options
          q.options.splice(index, 1);
        } else if (q.type === 'scales') {
          q.statements = q.statements || [];
          if (q.statements.length <= 1) return;
          q.statements.splice(index, 1);
        }
        renderVisualizer(q, { state: 'question', isDraft: true });
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

      ui.backSlideBtn.addEventListener('click', async () => {
        if (!state.sessionId || !state.session) return;
        const activeIdx = state.session.activeQuestionIndex != null ? Number(state.session.activeQuestionIndex) : -1;
        const prevIdx = activeIdx - 1;
        if (prevIdx >= 0) {
          playBeep(700, 0.05);
          await window.quiz.startQuestion(state.sessionId, prevIdx);
        }
      });

      ui.startNextBtn.addEventListener('click', async () => {
        await handleSmartNextAction();
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

// Pinning Logic for Open-Ended responses
window.pinCard = function(cardEl) {
  const overlay = document.createElement('div');
  overlay.className = 'pinned-card-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
  overlay.style.backdropFilter = 'blur(12px)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.cursor = 'pointer';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.3s ease';
  
  const clone = cardEl.cloneNode(true);
  // remove onclick and adjust style for pinned display
  clone.removeAttribute('onclick');
  clone.style.transform = 'scale(0.8)';
  clone.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  clone.style.width = '80vw';
  clone.style.maxWidth = '800px';
  clone.style.fontSize = '2rem';
  clone.style.lineHeight = '1.5';
  clone.style.padding = '40px';
  clone.style.borderRadius = '24px';
  clone.style.boxShadow = '0 30px 60px rgba(0,0,0,0.4)';
  clone.style.cursor = 'default';
  
  // adjust internal font sizing if necessary
  const p = clone.querySelector('p');
  if (p) {
    p.style.fontSize = '2.2rem';
    p.style.lineHeight = '1.4';
  }
  
  overlay.appendChild(clone);
  document.body.appendChild(overlay);
  
  // Trigger animation
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    clone.style.transform = 'scale(1)';
  });
  
  overlay.onclick = function(e) {
    if (e.target === overlay || e.target.closest('.pinned-card-overlay') && e.target !== clone && !clone.contains(e.target)) {
      overlay.style.opacity = '0';
      clone.style.transform = 'scale(0.8)';
      setTimeout(() => overlay.remove(), 300);
    }
  };
};