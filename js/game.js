/**
 * TAIGI FIGHTER 700 - Main Game Logic & State Machine
 */
class TaigiFighterGame {
  constructor() {
    this.words = window.TAIGI_700_WORDS || [];
    this.audio = window.arcadeAudio;
    this.renderer = null;

    // Game state
    this.state = 'TITLE'; // TITLE, VS, FIGHT, ROUND_OVER, MATCH_OVER, DOJO, SURVIVAL
    this.gameMode = 'ARCADE'; // ARCADE, SURVIVAL, DOJO

    // Arcade progress
    this.currentStageIndex = 0;
    this.stages = [
      {
        name: '夜市快手・火雞哥',
        title: '大東夜市霸王',
        location: '台南・大東夜市',
        dialogue: '「想佇我的地頭逞英雄？先食我一碗火雞肉飯閣來啦！」',
        winQuote: '「按呢就想欲贏我？夜市閣練十年啦！」',
        difficulty: 1,
        color: '#ff5722'
      },
      {
        name: '鐵拳廟公伯',
        title: '鎮瀾宮太極宗師',
        location: '台中・大甲鎮瀾宮',
        dialogue: '「少年仔，拳腳無目，台語有神！睇招！」',
        winQuote: '「後生可畏，汝這拳台語有夠氣力！」',
        difficulty: 2,
        color: '#ffc107'
      },
      {
        name: '港都海霸王',
        title: '旗津鐵壁水手',
        location: '高雄・旗津漁港',
        dialogue: '「浪頭大，我的拳頭閣較大！有膽就來拚看覓！」',
        winQuote: '「海風吹甲會透，你的台語比海湧閣較猛！」',
        difficulty: 3,
        color: '#03a9f4'
      },
      {
        name: '考官修羅',
        title: '終極台語大宗師',
        location: '台北・大稻埕天台',
        dialogue: '「歡迎來到最後擂台。700 字若袂通，莫想過此關！」',
        winQuote: '「好！台語七百字貫通，今日天下誰敢不服！」',
        difficulty: 4,
        color: '#9c27b0'
      }
    ];

    // Fighters state
    this.player = {
      name: '阿龍 (A-Liông)',
      title: '台語拳豪',
      x: 340,
      y: 460,
      hp: 100,
      maxHp: 100,
      superMeter: 0, // 0 to 100
      maxSuper: 100,
      state: 'idle', // idle, punch_light, punch_heavy, kick, hadouken, shoryuken, super, hit, dizzy, knockdown, win
      roundsWon: 0,
      combo: 0
    };

    this.enemy = {
      name: '火雞哥',
      title: '夜市霸王',
      x: 620,
      y: 460,
      hp: 100,
      maxHp: 100,
      state: 'idle',
      roundsWon: 0
    };

    // Match variables
    this.roundNumber = 1;
    this.matchTimer = 99;
    this.clashTimer = 10;
    this.timerInterval = null;
    this.currentQuestion = null;
    this.isClashActive = false;
    this.isSuperActive = false;
    this.score = 0;
    this.streak = 0;
    this.highScore = parseInt(localStorage.getItem('taigi_fighter_highscore') || '0', 10);

    // Dojo variables
    this.dojoIndex = 0;
    this.dojoFilter = '';
    this.filteredWords = [...this.words];

    // Binding loop
    this.lastTime = 0;

    // 2P Versus: chosen P2 character, and a token that invalidates
    // pending round timers when a match is abandoned or restarted
    this.versusChar = 0;
    this.matchToken = 0;
  }

  init() {
    const canvas = document.getElementById('gameCanvas');
    this.renderer = new ArcadeRenderer(canvas);
    this.audio.init();

    // Global user-interaction audio unlock for Apple iOS / Mobile WebKit
    const unlockAudio = () => {
      this.audio.init();
      ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
        window.removeEventListener(evt, unlockAudio);
      });
    };
    ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'keydown'].forEach(evt => {
      window.addEventListener(evt, unlockAudio, { passive: true, once: true });
    });

    // DOM UI bindings
    this.bindEvents();

    // Start requestAnimationFrame
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop.bind(this));

    // Show title
    this.showScreen('titleScreen');
  }

  bindEvents() {
    // Return to Title Home Button
    document.getElementById('btnReturnHome')?.addEventListener('click', () => {
      this.returnToTitle();
    });

    // About & Credits Modal
    document.getElementById('btnShowAbout')?.addEventListener('click', () => {
      this.audio.playSelect();
      this.showScreen('aboutOverlay');
    });

    document.getElementById('btnCloseAbout')?.addEventListener('click', () => {
      this.audio.playSelect();
      this.showScreen('titleScreen');
    });

    // Start Arcade Button
    document.getElementById('btnStartArcade')?.addEventListener('click', () => {
      this.audio.playCoin();
      setTimeout(() => {
        this.audio.playStart();
        this.startArcadeMode();
      }, 300);
    });

    // Start Dojo Button
    document.getElementById('btnStartDojo')?.addEventListener('click', () => {
      this.audio.playSelect();
      this.startDojoMode();
    });

    // Start Survival Button
    document.getElementById('btnStartSurvival')?.addEventListener('click', () => {
      this.audio.playCoin();
      setTimeout(() => {
        this.audio.playStart();
        this.startSurvivalMode();
      }, 300);
    });

    // 2P Versus Mode
    document.getElementById('btnStartVersus')?.addEventListener('click', () => {
      this.audio.playSelect();
      this.openVersusSelect();
    });
    document.getElementById('btnVersusBack')?.addEventListener('click', () => this.returnToTitle());
    document.querySelectorAll('#versusCharGrid .vs-char-card').forEach(card => {
      card.addEventListener('click', () => {
        this.audio.playCoin();
        this.startVersusMode(parseInt(card.dataset.char, 10) || 0);
      });
    });
    // pointerdown (not click) so both players can buzz at the same time on a
    // shared touch screen and the faster finger wins without the click delay
    document.querySelectorAll('#vsBuzzerRow [data-player]').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.handleVersusAnswer(parseInt(btn.dataset.player, 10), parseInt(btn.dataset.opt, 10));
      });
    });
    document.getElementById('btnVersusRematch')?.addEventListener('click', () => {
      this.audio.playCoin();
      this.startVersusMode(this.versusChar);
    });

    // Remember the arcade champion screen text so versus results can reuse it
    this.winScreenDefaults = {
      banner: document.getElementById('winBannerText')?.textContent || '',
      sub: document.getElementById('winSubText')?.textContent || ''
    };

    // Settings & Toggles
    document.getElementById('btnToggleBGM')?.addEventListener('click', (e) => {
      const on = this.audio.toggleBGM();
      e.target.textContent = on ? '🎵 BGM: 開' : '🎵 BGM: 關';
      e.target.classList.toggle('active', on);
    });

    document.getElementById('btnToggleSFX')?.addEventListener('click', (e) => {
      const on = this.audio.toggleSFX();
      e.target.textContent = on ? '🔊 音效: 開' : '🔊 音效: 關';
      e.target.classList.toggle('active', on);
    });

    document.getElementById('btnTogglePixel')?.addEventListener('click', (e) => {
      this.renderer.pixelMode = !this.renderer.pixelMode;
      e.target.textContent = this.renderer.pixelMode ? '👾 像素: 開' : '👾 像素: 關';
      e.target.classList.toggle('active', this.renderer.pixelMode);
    });

    document.getElementById('btnToggleCRT')?.addEventListener('click', (e) => {
      this.renderer.crtEnabled = !this.renderer.crtEnabled;
      e.target.textContent = this.renderer.crtEnabled ? '📺 CRT: 開' : '📺 CRT: 關';
      e.target.classList.toggle('active', this.renderer.crtEnabled);
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // Options Click / Touch
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`optBtn${i}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.handleOptionSelect(i);
        });
      }
    }

    // Virtual Touch Pad Buttons
    document.getElementById('btnPadA')?.addEventListener('click', () => this.handleOptionSelect(0));
    document.getElementById('btnPadB')?.addEventListener('click', () => this.handleOptionSelect(1));
    document.getElementById('btnPadC')?.addEventListener('click', () => this.handleOptionSelect(2));
    document.getElementById('btnPadD')?.addEventListener('click', () => this.handleOptionSelect(3));

    // Super Combo Button
    document.getElementById('btnPadSuper')?.addEventListener('click', () => {
      this.triggerSuperCombo();
    });

    // Audio Replay Button
    document.getElementById('btnReplayAudio')?.addEventListener('click', () => {
      if (this.currentQuestion && this.currentQuestion.wordObj) {
        this.audio.playTaigiAudio(this.currentQuestion.wordObj);
      }
    });

    // Continue / Restart Buttons
    document.getElementById('btnContinueYes')?.addEventListener('click', () => {
      this.audio.playCoin();
      this.startStage(this.currentStageIndex);
    });

    document.getElementById('btnBackToMenu')?.addEventListener('click', () => {
      this.audio.playSelect();
      this.audio.stopBGM();
      this.showScreen('titleScreen');
    });

    // Dojo controls
    document.getElementById('btnDojoNext')?.addEventListener('click', () => this.dojoNext(1));
    document.getElementById('btnDojoPrev')?.addEventListener('click', () => this.dojoNext(-1));
    document.getElementById('btnDojoAudio')?.addEventListener('click', () => {
      const w = this.filteredWords[this.dojoIndex];
      if (w) this.audio.playTaigiAudio(w);
    });
    document.getElementById('btnDojoHit')?.addEventListener('click', () => {
      this.player.state = 'punch_heavy';
      this.audio.playHeavyHit();
      this.renderer.addHitSpark(this.enemy.x, 380, true);
      this.renderer.triggerShake(8);
      setTimeout(() => { this.player.state = 'idle'; }, 300);
    });
    document.getElementById('dojoSearchInput')?.addEventListener('input', (e) => {
      this.filterDojoWords(e.target.value);
    });
  }

  returnToTitle() {
    this.matchToken++;
    this.isClashActive = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    if (this.continueInterval) {
      clearInterval(this.continueInterval);
      this.continueInterval = null;
    }
    this.audio.stopBGM();
    this.audio.stopTaigiAudio();
    this.audio.playSelect();
    this.state = 'TITLE';
    this.showScreen('titleScreen');
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.returnToTitle();
      return;
    }

    if (this.state === 'TITLE') {
      if (e.key === 'Enter' || e.key === ' ' || e.key === '1') {
        this.audio.playCoin();
        setTimeout(() => {
          this.audio.playStart();
          this.startArcadeMode();
        }, 300);
      }
      return;
    }

    if (this.state === 'FIGHT' && this.gameMode === 'VERSUS') {
      if (e.repeat) return;
      // Physical key codes: 1P = top-row 1-4, 2P = top-row 7-0 or numpad 1-4
      const p1Keys = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      const p2Keys = { Digit7: 0, Digit8: 1, Digit9: 2, Digit0: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
      if (e.code in p1Keys) {
        e.preventDefault();
        this.handleVersusAnswer(1, p1Keys[e.code]);
      } else if (e.code in p2Keys) {
        e.preventDefault();
        this.handleVersusAnswer(2, p2Keys[e.code]);
      } else if ((e.key === 'r' || e.key === 'R') && this.currentQuestion && this.currentQuestion.wordObj) {
        this.audio.playTaigiAudio(this.currentQuestion.wordObj);
      }
      return;
    }

    if (this.state === 'FIGHT') {
      if (e.key === '1' || e.key === 'j' || e.key === 'J' || e.key === 'a' || e.key === 'A') {
        this.handleOptionSelect(0);
      } else if (e.key === '2' || e.key === 'k' || e.key === 'K' || e.key === 'b' || e.key === 'B') {
        this.handleOptionSelect(1);
      } else if (e.key === '3' || e.key === 'u' || e.key === 'U' || e.key === 'c' || e.key === 'C') {
        this.handleOptionSelect(2);
      } else if (e.key === '4' || e.key === 'i' || e.key === 'I' || e.key === 'd' || e.key === 'D') {
        this.handleOptionSelect(3);
      } else if (e.key === ' ' || e.key === 's' || e.key === 'S') {
        this.triggerSuperCombo();
      } else if (e.key === 'r' || e.key === 'R') {
        // Replay audio
        if (this.currentQuestion && this.currentQuestion.wordObj) {
          this.audio.playTaigiAudio(this.currentQuestion.wordObj);
        }
      }
    }
  }

  showScreen(screenId) {
    document.body.classList.toggle('versus-mode', this.gameMode === 'VERSUS');
    const screens = ['titleScreen', 'versusSelectOverlay', 'vsScreen', 'hudOverlay', 'dojoOverlay', 'continueOverlay', 'winOverlay', 'aboutOverlay'];
    screens.forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(screenId);
    if (target) target.classList.remove('hidden');

    if (screenId === 'hudOverlay') {
      document.getElementById('arcadePad')?.classList.remove('hidden');
      document.getElementById('questionBox')?.classList.remove('hidden');
    } else {
      document.getElementById('arcadePad')?.classList.add('hidden');
      document.getElementById('questionBox')?.classList.add('hidden');
    }
  }

  // --- Game Modes ---

  startArcadeMode() {
    this.matchToken++;
    this.gameMode = 'ARCADE';
    this.currentStageIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.startStage(0);
  }

  startSurvivalMode() {
    this.matchToken++;
    this.gameMode = 'SURVIVAL';
    this.currentStageIndex = 0;
    this.score = 0;
    this.streak = 0;
    this.player.hp = 100;
    this.player.roundsWon = 0;
    this.startStage(0);
  }

  startDojoMode() {
    this.matchToken++;
    this.gameMode = 'DOJO';
    this.state = 'DOJO';
    this.showScreen('dojoOverlay');
    this.audio.startBGM('title');
    this.renderer.setStage(1); // Temple Dojo
    this.player.x = 350;
    this.enemy.x = 650;
    this.dojoIndex = 0;
    this.updateDojoCard();
  }

  // --- Stage & Fight Flow ---

  startStage(stageIdx) {
    this.currentStageIndex = stageIdx;
    const stage = this.stages[stageIdx % this.stages.length];
    this.renderer.setStage(stageIdx);

    // Setup fighters
    this.player.hp = 100;
    this.player.roundsWon = 0;
    this.player.superMeter = Math.max(0, this.player.superMeter);
    this.player.state = 'idle';

    this.enemy.name = stage.name;
    this.enemy.title = stage.title;
    this.enemy.hp = 100;
    this.enemy.roundsWon = 0;
    this.enemy.state = 'idle';

    this.roundNumber = 1;

    // Show VS Screen
    this.state = 'VS';
    this.showVSScreen(stage, () => {
      this.startRound();
    });
  }

  showVSScreen(stage, callback) {
    this.showScreen('vsScreen');
    document.getElementById('vsP1Name').textContent = this.player.name;
    document.getElementById('vsP1Title').textContent = this.player.title;
    document.getElementById('vsP2Name').textContent = stage.name;
    document.getElementById('vsP2Title').textContent = stage.title;
    document.getElementById('vsStageLocation').textContent =
      this.gameMode === 'VERSUS' ? `🆚 雙人對戰・${stage.location}` : stage.location;
    document.getElementById('vsEnemyQuote').textContent = stage.dialogue;

    this.audio.playAnnouncer('Versus!');

    setTimeout(() => {
      callback();
    }, 2800);
  }

  startRound() {
    this.state = 'FIGHT';
    this.showScreen('hudOverlay');
    this.audio.startBGM('battle');

    // Classic arcade spacing: close enough that dashing attacks connect
    this.player.x = 340;
    this.enemy.x = 620;
    this.player.state = 'idle';
    this.enemy.state = 'idle';

    this.updateHUD();

    // Round announcement
    const roundText = (this.roundNumber === 3) ? 'FINAL ROUND' : `ROUND ${this.roundNumber}`;
    this.renderer.showBanner(roundText, '準備開戰！', '#ffdf00', 70);
    this.audio.playAnnouncer(roundText);

    setTimeout(() => {
      this.renderer.showBanner('FIGHT!', '出招！', '#ff3b30', 50);
      this.audio.playAnnouncer('Fight!');
      this.isClashActive = true;
      this.matchTimer = 99;
      this.startTimer();
      this.nextClashQuestion();
    }, 1300);
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state !== 'FIGHT' || !this.isClashActive) return;
      this.matchTimer--;
      if (this.matchTimer <= 0) {
        this.matchTimer = 0;
        this.timeOver();
      }
      this.updateHUD();
    }, 1000);
  }

  // --- Dynamic Question Generator (from Taigi 700) ---

  nextClashQuestion() {
    if (this.state !== 'FIGHT') return;

    if (this.words.length === 0) {
      console.warn('No words loaded');
      return;
    }

    // Pick a random target word
    const targetIdx = Math.floor(Math.random() * this.words.length);
    const targetWord = this.words[targetIdx];

    // Pick 3 random distractors
    const distractors = [];
    while (distractors.length < 3) {
      const r = Math.floor(Math.random() * this.words.length);
      if (r !== targetIdx && !distractors.includes(this.words[r])) {
        distractors.push(this.words[r]);
      }
    }

    // Choose question attack type
    // 0: Light Punch (漢字出招 - See Tâi-lô, pick 漢字)
    // 1: Heavy Punch (拼音連擊 - See 漢字, pick Tâi-lô)
    // 2: Hadouken (華台釋義波 - See 華語釋義, pick 台語詞)
    // 3: Shoryuken (聽音辨字斬 - Listen to audio, pick 漢字)
    const types = ['LIGHT_PUNCH', 'HEAVY_PUNCH', 'HADOUKEN', 'SHORYUKEN'];
    const chosenType = types[Math.floor(Math.random() * types.length)];

    let questionTitle = '';
    let questionPrompt = '';
    let questionSub = '';
    let options = [];
    let correctOptionIndex = 0;

    const allChoices = [targetWord, ...distractors];
    // Shuffle choices
    for (let i = allChoices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allChoices[i], allChoices[j]] = [allChoices[j], allChoices[i]];
    }
    correctOptionIndex = allChoices.indexOf(targetWord);

    const taiLo = (targetWord.read && targetWord.read[0]) ? targetWord.read[0] : '';

    if (chosenType === 'LIGHT_PUNCH') {
      questionTitle = '👊 輕拳出招：依拼音選漢字';
      questionPrompt = `「${taiLo}」`;
      questionSub = `釋義：${targetWord.mean}`;
      options = allChoices.map(c => c.word);
    } else if (chosenType === 'HEAVY_PUNCH') {
      questionTitle = '💥 重拳出擊：依漢字選臺羅拼音';
      questionPrompt = `「${targetWord.word}」`;
      questionSub = `華語：${targetWord.mean}`;
      options = allChoices.map(c => (c.read && c.read[0]) ? c.read[0] : c.word);
    } else if (chosenType === 'HADOUKEN') {
      questionTitle = '🔥 波動拳衝擊：華台釋義對決';
      questionPrompt = `華語「${targetWord.mean}」對應台語？`;
      questionSub = targetWord.sample ? `例句：${targetWord.sample}` : '';
      options = allChoices.map(c => `${c.word} (${(c.read && c.read[0]) ? c.read[0] : ''})`);
    } else { // SHORYUKEN
      questionTitle = '⚡ 昇龍拳：聽音辨字！';
      questionPrompt = '🔊 請聽真人台語發音！';
      questionSub = `華語釋義提示：${targetWord.mean}`;
      options = allChoices.map(c => `${c.word}`);
    }

    this.currentQuestion = {
      type: chosenType,
      wordObj: targetWord,
      correctIndex: correctOptionIndex,
      startTime: performance.now()
    };

    // Auto play audio for pronunciation learning
    this.audio.playTaigiAudio(targetWord);

    // Update UI
    this.renderQuestionUI(questionTitle, questionPrompt, questionSub, options);
  }

  renderQuestionUI(title, prompt, sub, options) {
    document.getElementById('qAttackBadge').textContent = title;
    document.getElementById('qPromptText').textContent = prompt;
    document.getElementById('qSubText').textContent = sub;

    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`optBtn${i}`);
      if (btn) {
        btn.textContent = `${['A', 'B', 'C', 'D'][i]}. ${options[i]}`;
        btn.className = `arcade-opt-btn btn-${'abcd'[i]}`;
        btn.disabled = false;
      }
    }
  }

  handleOptionSelect(selectedIndex) {
    if (this.gameMode === 'VERSUS') return; // versus uses the 1P/2P buzzers
    if (this.state !== 'FIGHT' || !this.isClashActive || !this.currentQuestion) return;

    this.isClashActive = false;
    const isCorrect = (selectedIndex === this.currentQuestion.correctIndex);
    const elapsedSeconds = (performance.now() - this.currentQuestion.startTime) / 1000;
    const isFast = elapsedSeconds <= 2.8;

    // Highlight buttons
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`optBtn${i}`);
      if (btn) {
        btn.disabled = true;
        if (i === this.currentQuestion.correctIndex) {
          btn.classList.add('correct');
        } else if (i === selectedIndex && !isCorrect) {
          btn.classList.add('wrong');
        }
      }
    }

    if (isCorrect) {
      this.handleCorrectAnswer(isFast);
    } else {
      this.handleWrongAnswer();
    }
  }

  handleCorrectAnswer(isFast) {
    this.streak++;
    this.player.combo++;
    const comboBonus = Math.min(this.player.combo * 20, 100);
    const baseDmg = isFast ? 35 : 24;
    const finalDmg = baseDmg + (this.player.combo > 1 ? 6 : 0);

    // Score
    this.score += 200 + comboBonus + (isFast ? 150 : 0);
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('taigi_fighter_highscore', this.highScore.toString());
    }

    // Super Meter increase
    this.player.superMeter = Math.min(this.player.maxSuper, this.player.superMeter + 34);

    // Visual strike animation
    const qType = this.currentQuestion.type;
    if (qType === 'HADOUKEN') {
      this.player.state = 'hadouken';
      this.audio.playHadouken();
      this.renderer.addFireball(this.player.x + 60, 380, this.enemy.x, true, false);
    } else if (qType === 'SHORYUKEN') {
      this.player.state = 'shoryuken';
      this.audio.playShoryuken();
    } else if (qType === 'HEAVY_PUNCH') {
      this.player.state = 'punch_heavy';
      this.audio.playHeavyHit();
    } else {
      this.player.state = 'kick';
      this.audio.playLightHit();
    }

    // Floating text & spark
    setTimeout(() => {
      this.enemy.state = 'hit';
      this.enemy.hp = Math.max(0, this.enemy.hp - finalDmg);
      this.renderer.triggerShake(isFast ? 16 : 9);
      this.renderer.addHitSpark(this.enemy.x, 380, isFast);

      const hitLabel = isFast ? '⚡ CRITICAL HIT!' : (this.player.combo > 1 ? `🔥 ${this.player.combo} HITS COMBO!` : '💥 HIT!');
      this.renderer.addFloatingText(hitLabel, this.enemy.x, 340, '#ffd700');
      this.renderer.addFloatingText(`-${finalDmg} HP`, this.enemy.x, 370, '#ff4d4f');

      this.updateHUD();

      // Check KO
      if (this.enemy.hp <= 0) {
        this.handleEnemyKO();
      } else {
        setTimeout(() => {
          this.player.state = 'idle';
          this.enemy.state = 'idle';
          this.isClashActive = true;
          this.nextClashQuestion();
        }, 900);
      }
    }, (qType === 'HADOUKEN' ? 260 : 150));
  }

  handleWrongAnswer() {
    this.streak = 0;
    this.player.combo = 0;

    // Enemy strikes player!
    this.enemy.state = 'punch';
    this.audio.playHeavyHit();

    setTimeout(() => {
      const enemyDmg = 28;
      this.player.state = 'hit';
      this.player.hp = Math.max(0, this.player.hp - enemyDmg);
      this.renderer.triggerShake(14);
      this.renderer.addHitSpark(this.player.x, 380, true);
      this.renderer.addFloatingText('💔 COUNTERED!', this.player.x, 340, '#ff4d4f');
      this.renderer.addFloatingText(`-${enemyDmg} HP`, this.player.x, 370, '#ff7875');

      this.updateHUD();

      if (this.player.hp <= 0) {
        this.handlePlayerKO();
      } else {
        setTimeout(() => {
          this.player.state = 'idle';
          this.enemy.state = 'idle';
          this.isClashActive = true;
          this.nextClashQuestion();
        }, 1100);
      }
    }, 200);
  }

  triggerSuperCombo() {
    if (this.gameMode === 'VERSUS') return;
    if (this.state !== 'FIGHT' || this.player.superMeter < this.player.maxSuper || !this.isClashActive) return;

    this.isClashActive = false;
    this.player.superMeter = 0;
    this.updateHUD();

    // Cinematic Super
    this.audio.playSuper();
    this.renderer.showBanner('真空波動拳！', 'SUPER COMBO FINISH!', '#00e5ff', 80);
    this.renderer.triggerShake(25);

    this.player.state = 'hadouken';
    this.renderer.addFireball(this.player.x + 60, 380, this.enemy.x, true, true);

    setTimeout(() => {
      const superDmg = 65;
      this.enemy.state = 'hit';
      this.enemy.hp = Math.max(0, this.enemy.hp - superDmg);
      this.renderer.addHitSpark(this.enemy.x, 380, true);
      this.renderer.addFloatingText('🔥 999 HITS SUPER FINISH!', this.enemy.x, 320, '#00e5ff');
      this.renderer.addFloatingText(`-${superDmg} HP`, this.enemy.x, 360, '#ff4d4f');
      this.updateHUD();

      if (this.enemy.hp <= 0) {
        this.handleEnemyKO();
      } else {
        setTimeout(() => {
          this.player.state = 'idle';
          this.enemy.state = 'idle';
          this.isClashActive = true;
          this.nextClashQuestion();
        }, 1200);
      }
    }, 400);
  }

  timeOver() {
    if (this.gameMode === 'VERSUS') {
      this.versusTimeOver();
      return;
    }
    this.isClashActive = false;
    this.renderer.showBanner('TIME OVER', '', '#ff4d4f', 80);
    this.audio.playAnnouncer('Time Over!');

    setTimeout(() => {
      if (this.player.hp > this.enemy.hp) {
        this.handleEnemyKO();
      } else {
        this.handlePlayerKO();
      }
    }, 1500);
  }

  handleEnemyKO() {
    this.isClashActive = false;
    clearInterval(this.timerInterval);
    this.enemy.state = 'knockdown';
    this.audio.playKO();
    this.renderer.triggerShake(22);
    this.renderer.showBanner('K.O.!', '完勝！', '#ff0033', 100);
    this.audio.playAnnouncer('K.O.!');

    setTimeout(() => {
      this.player.roundsWon++;
      const isPerfect = (this.player.hp === this.player.maxHp);
      if (isPerfect) {
        this.score += 1000;
        this.renderer.showBanner('PERFECT!', '毫髮無傷！', '#ffd700', 90);
        this.audio.playAnnouncer('Perfect!');
      } else {
        this.renderer.showBanner('YOU WIN!', '', '#ffdf00', 80);
        this.audio.playAnnouncer('You Win!');
      }
      this.player.state = 'win';
      this.audio.playVictory();

      setTimeout(() => {
        if (this.player.roundsWon >= 2 || this.gameMode === 'SURVIVAL') {
          this.handleMatchWon();
        } else {
          // Next round in this match
          this.roundNumber++;
          this.player.hp = 100;
          this.enemy.hp = 100;
          this.startRound();
        }
      }, 2500);
    }, 1500);
  }

  handlePlayerKO() {
    this.isClashActive = false;
    clearInterval(this.timerInterval);
    this.player.state = 'knockdown';
    this.audio.playKO();
    this.renderer.triggerShake(20);
    this.renderer.showBanner('K.O.!', '', '#ff0033', 100);
    this.audio.playAnnouncer('K.O.!');

    setTimeout(() => {
      this.enemy.roundsWon++;
      if (this.enemy.roundsWon >= 2 || this.gameMode === 'SURVIVAL') {
        this.showContinueScreen();
      } else {
        this.roundNumber++;
        this.player.hp = 100;
        this.enemy.hp = 100;
        this.startRound();
      }
    }, 2000);
  }

  handleMatchWon() {
    if (this.gameMode === 'SURVIVAL') {
      // Survival mode: next continuous challenger
      this.currentStageIndex++;
      this.player.hp = Math.min(100, this.player.hp + 35); // heal 35%
      this.startStage(this.currentStageIndex);
      return;
    }

    // Arcade mode: check if beaten final boss
    if (this.currentStageIndex >= this.stages.length - 1) {
      // Game Beaten!
      this.showWinScreen();
    } else {
      // Next Boss Stage!
      this.currentStageIndex++;
      this.startStage(this.currentStageIndex);
    }
  }

  showContinueScreen() {
    this.state = 'MATCH_OVER';
    this.audio.stopBGM();
    this.showScreen('continueOverlay');

    let count = 9;
    const cntEl = document.getElementById('continueCountdown');
    cntEl.textContent = count.toString();
    this.audio.playAnnouncer('Continue?');

    const interval = setInterval(() => {
      count--;
      cntEl.textContent = count.toString();
      this.audio.playSelect();
      if (count <= 0) {
        clearInterval(interval);
        this.showScreen('titleScreen');
      }
    }, 1000);

    // Save interval so if user clicks continue it clears
    this.continueInterval = interval;
  }

  showWinScreen() {
    this.state = 'MATCH_OVER';
    this.showScreen('winOverlay');
    this.setWinScreen(this.winScreenDefaults.banner, this.winScreenDefaults.sub, false);
    this.audio.stopBGM();
    this.audio.playVictory();
    document.getElementById('finalScoreText').textContent = this.score.toString();
  }

  updateHUD() {
    // Player HP
    const p1HpBar = document.getElementById('p1HpFill');
    const p1DmgBar = document.getElementById('p1HpDamage');
    const p1HpPct = Math.max(0, (this.player.hp / this.player.maxHp) * 100);
    if (p1HpBar) p1HpBar.style.width = `${p1HpPct}%`;
    if (p1DmgBar) {
      setTimeout(() => {
        p1DmgBar.style.width = `${p1HpPct}%`;
      }, 350);
    }

    // Enemy HP
    const p2HpBar = document.getElementById('p2HpFill');
    const p2DmgBar = document.getElementById('p2HpDamage');
    const p2HpPct = Math.max(0, (this.enemy.hp / this.enemy.maxHp) * 100);
    if (p2HpBar) p2HpBar.style.width = `${p2HpPct}%`;
    if (p2DmgBar) {
      setTimeout(() => {
        p2DmgBar.style.width = `${p2HpPct}%`;
      }, 350);
    }

    // HP Bar Danger Pulse
    p1HpBar?.parentElement?.classList.toggle('danger', p1HpPct <= 25);
    p2HpBar?.parentElement?.classList.toggle('danger', p2HpPct <= 25);

    // Super Meter
    const superBar = document.getElementById('superMeterFill');
    const superText = document.getElementById('superMeterText');
    const superPct = Math.min(100, (this.player.superMeter / this.player.maxSuper) * 100);
    if (superBar) {
      superBar.style.width = `${superPct}%`;
      superBar.classList.toggle('max', superPct >= 100);
    }
    if (superText) {
      superText.textContent = (superPct >= 100) ? 'MAX SUPER READY!' : `EX: ${Math.floor(superPct)}%`;
      superText.classList.toggle('max-text', superPct >= 100);
    }

    // Timer & Hurry Up
    const timerEl = document.getElementById('arcadeTimer');
    if (timerEl) {
      timerEl.textContent = this.matchTimer.toString().padStart(2, '0');
      timerEl.classList.toggle('hurry-up', this.matchTimer <= 10);
    }

    // Score & Combo
    const scoreEl = document.getElementById('currentScoreText');
    if (scoreEl) scoreEl.textContent = this.score.toString();

    const comboEl = document.getElementById('comboBadge');
    if (comboEl) {
      if (this.player.combo > 1) {
        comboEl.textContent = `${this.player.combo} HITS!`;
        comboEl.classList.remove('hidden');
      } else {
        comboEl.classList.add('hidden');
      }
    }

    // Rounds won markers
    const p1Wins = document.getElementById('p1Wins');
    if (p1Wins) {
      p1Wins.innerHTML = (this.player.roundsWon >= 1 ? '● ' : '○ ') + (this.player.roundsWon >= 2 ? '●' : '○');
    }
    const p2Wins = document.getElementById('p2Wins');
    if (p2Wins) {
      p2Wins.innerHTML = (this.enemy.roundsWon >= 1 ? '● ' : '○ ') + (this.enemy.roundsWon >= 2 ? '●' : '○');
    }

    // Fighter Names
    const isVersus = this.gameMode === 'VERSUS';
    document.getElementById('hudP1Name').textContent = isVersus ? '1P 阿龍' : this.player.name;
    document.getElementById('hudP2Name').textContent = isVersus ? `2P ${this.enemy.name}` : this.enemy.name;
  }

  // --- 2P Versus Mode (same-device buzzer battle) ---

  openVersusSelect() {
    this.matchToken++;
    this.gameMode = 'VERSUS';
    this.state = 'VERSUS_SELECT';
    this.showScreen('versusSelectOverlay');
  }

  startVersusMode(charIdx) {
    this.matchToken++;
    this.gameMode = 'VERSUS';
    this.versusChar = charIdx;
    this.score = 0;
    this.streak = 0;
    this.player.combo = 0;
    this.player.superMeter = 0;
    this.audio.playStart();
    this.startStage(charIdx);
  }

  handleVersusAnswer(playerNum, selectedIndex) {
    if (this.gameMode !== 'VERSUS' || this.state !== 'FIGHT' || !this.isClashActive || !this.currentQuestion) return;

    this.isClashActive = false;
    const q = this.currentQuestion;
    const isCorrect = selectedIndex === q.correctIndex;
    const isFast = (performance.now() - q.startTime) / 1000 <= 2.8;

    // Reveal the answer and tag who buzzed in
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`optBtn${i}`);
      if (!btn) continue;
      btn.disabled = true;
      if (i === q.correctIndex) btn.classList.add('correct');
      else if (i === selectedIndex) btn.classList.add('wrong');
      if (i === selectedIndex) btn.classList.add(`by-p${playerNum}`);
    }

    const other = playerNum === 1 ? 2 : 1;
    if (isCorrect) {
      const label = isFast ? `⚡ ${playerNum}P 秒答！` : `💥 ${playerNum}P 答對！`;
      this.versusStrike(playerNum, isFast ? 30 : 22, label, isFast, q.type);
    } else {
      this.versusStrike(other, 18, `❌ ${playerNum}P 答錯！反擊！`, false, q.type);
    }
  }

  versusStrike(attacker, dmg, label, isHeavy, qType) {
    const token = this.matchToken;
    const defender = attacker === 1 ? this.enemy : this.player;
    let delay = 160;

    if (attacker === 1) {
      if (qType === 'HADOUKEN') {
        this.player.state = 'hadouken';
        this.audio.playHadouken();
        this.renderer.addFireball(this.player.x + 60, 380, this.enemy.x, true, false);
        delay = 260;
      } else if (qType === 'SHORYUKEN') {
        this.player.state = 'shoryuken';
        this.audio.playShoryuken();
      } else if (qType === 'HEAVY_PUNCH') {
        this.player.state = 'punch_heavy';
        this.audio.playHeavyHit();
      } else {
        this.player.state = 'kick';
        this.audio.playLightHit();
      }
    } else {
      this.enemy.state = 'punch';
      if (qType === 'HADOUKEN') {
        this.audio.playHadouken();
        this.renderer.addFireball(this.enemy.x - 60, 380, this.player.x, false, false);
        delay = 260;
      } else {
        this.audio.playHeavyHit();
        delay = 180;
      }
    }

    setTimeout(() => {
      if (token !== this.matchToken || this.state !== 'FIGHT') return;
      defender.state = 'hit';
      defender.hp = Math.max(0, defender.hp - dmg);
      this.renderer.triggerShake(isHeavy ? 16 : 10);
      this.renderer.addHitSpark(defender.x, 380, isHeavy);
      this.renderer.addFloatingText(label, defender.x, 330, attacker === 1 ? '#00e5ff' : '#ff7043');
      this.renderer.addFloatingText(`-${dmg} HP`, defender.x, 365, '#ff4d4f');
      this.updateHUD();

      if (defender.hp <= 0) {
        this.versusRoundOver(attacker);
      } else {
        setTimeout(() => {
          if (token !== this.matchToken || this.state !== 'FIGHT') return;
          this.player.state = 'idle';
          this.enemy.state = 'idle';
          this.isClashActive = true;
          this.nextClashQuestion();
        }, 1000);
      }
    }, delay);
  }

  versusTimeOver() {
    const token = this.matchToken;
    this.isClashActive = false;
    clearInterval(this.timerInterval);
    this.renderer.showBanner('TIME OVER', '', '#ff4d4f', 80);
    this.audio.playAnnouncer('Time Over!');
    setTimeout(() => {
      if (token !== this.matchToken) return;
      const winner = this.player.hp > this.enemy.hp ? 1 : (this.enemy.hp > this.player.hp ? 2 : 0);
      this.versusRoundOver(winner);
    }, 1500);
  }

  // winner: 1 or 2, or 0 for a drawn round
  versusRoundOver(winner) {
    const token = this.matchToken;
    this.isClashActive = false;
    clearInterval(this.timerInterval);

    const winF = winner === 1 ? this.player : (winner === 2 ? this.enemy : null);
    const loseF = winner === 1 ? this.enemy : (winner === 2 ? this.player : null);

    if (loseF) {
      loseF.state = 'knockdown';
      this.audio.playKO();
      this.renderer.triggerShake(22);
      this.renderer.showBanner('K.O.!', '', '#ff0033', 100);
      this.audio.playAnnouncer('K.O.!');
    }

    setTimeout(() => {
      if (token !== this.matchToken) return;
      if (winF) {
        winF.roundsWon++;
        winF.state = 'win';
        const name = winner === 1 ? '阿龍' : this.enemy.name;
        this.renderer.showBanner(`${winner}P WIN!`, `${name} 勝！`, winner === 1 ? '#00e5ff' : '#ff7043', 90);
        this.audio.playVictory();
      } else {
        this.renderer.showBanner('DRAW', '平手！', '#ffdf00', 90);
      }
      this.updateHUD();

      setTimeout(() => {
        if (token !== this.matchToken) return;
        const p1 = this.player.roundsWon, p2 = this.enemy.roundsWon;
        if (p1 >= 2 || p2 >= 2 || this.roundNumber >= 5) {
          this.showVersusResult(p1 > p2 ? 1 : (p2 > p1 ? 2 : 0));
        } else {
          this.roundNumber++;
          this.player.hp = 100;
          this.enemy.hp = 100;
          this.startRound();
        }
      }, 2500);
    }, loseF ? 1500 : 300);
  }

  showVersusResult(winner) {
    this.state = 'MATCH_OVER';
    this.showScreen('winOverlay');
    this.audio.stopBGM();
    this.audio.playVictory();
    if (winner === 0) {
      this.setWinScreen('DRAW GAME', '平分秋色，閣來一場！', true);
    } else {
      const name = winner === 1 ? '1P 阿龍' : `2P ${this.enemy.name}`;
      this.setWinScreen(`${winner}P WINS!`, `${name} 三戰兩勝，台語拳頭上強！`, true);
    }
  }

  setWinScreen(banner, sub, isVersus) {
    const bannerEl = document.getElementById('winBannerText');
    const subEl = document.getElementById('winSubText');
    if (bannerEl) bannerEl.textContent = banner;
    if (subEl) subEl.textContent = sub;
    document.getElementById('winStatsBox')?.classList.toggle('hidden', isVersus);
    document.getElementById('btnVersusRematch')?.classList.toggle('hidden', !isVersus);
  }

  // --- Dojo Logic ---

  filterDojoWords(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      this.filteredWords = [...this.words];
    } else {
      this.filteredWords = this.words.filter(w => {
        return w.word.includes(q) ||
          (w.read && w.read.some(r => r.toLowerCase().includes(q))) ||
          w.mean.includes(q);
      });
    }
    this.dojoIndex = 0;
    this.updateDojoCard();
  }

  dojoNext(delta) {
    if (this.filteredWords.length === 0) return;
    this.dojoIndex = (this.dojoIndex + delta + this.filteredWords.length) % this.filteredWords.length;
    this.updateDojoCard();
    const w = this.filteredWords[this.dojoIndex];
    if (w) this.audio.playTaigiAudio(w);
  }

  updateDojoCard() {
    if (this.filteredWords.length === 0) {
      document.getElementById('dojoWordHanzi').textContent = '無符合字詞';
      document.getElementById('dojoWordTailo').textContent = '';
      document.getElementById('dojoWordMean').textContent = '';
      document.getElementById('dojoWordSample').textContent = '';
      document.getElementById('dojoCounter').textContent = '0 / 0';
      return;
    }

    const w = this.filteredWords[this.dojoIndex];
    document.getElementById('dojoWordHanzi').textContent = w.word;
    document.getElementById('dojoWordTailo').textContent = (w.read && w.read.length) ? w.read.join(', ') : '';
    document.getElementById('dojoWordMean').textContent = `華語釋義：${w.mean}`;
    document.getElementById('dojoWordSample').textContent = w.sample ? `例句：${w.sample}` : '';
    document.getElementById('dojoCounter').textContent = `${this.dojoIndex + 1} / ${this.filteredWords.length} (編號 #${w.no})`;
  }

  // --- Main Animation Loop ---

  loop(currentTime) {
    // Fixed 60Hz simulation step so animation speed is identical on
    // 60/90/120/144Hz screens; render once per display frame.
    const STEP = 1000 / 60;
    const elapsed = Math.min(Math.max(currentTime - this.lastTime, 0), 250);
    this.lastTime = currentTime;
    this.frameAccumulator = (this.frameAccumulator || 0) + elapsed;

    if (this.renderer) {
      try {
        let steps = 0;
        while (this.frameAccumulator >= STEP && steps < 5) {
          this.renderer.update();
          this.frameAccumulator -= STEP;
          steps++;
        }
        if (steps === 5) this.frameAccumulator = 0;
        this.renderer.render(this.player, this.enemy, this.state);
      } catch (err) {
        console.error('Renderer loop error:', err);
      }
    }

    requestAnimationFrame(this.loop.bind(this));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new TaigiFighterGame();
  window.game.init();
});
