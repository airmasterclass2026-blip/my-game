/* Ball Party 3D — a bouncy ball-pit learning game for toddlers.
 * Level 1 (Momo the mouse): collect balls of a color — color names + counting.
 * Level 2 (Bolt the buddy): give Bolt N balls, find the BIG ball — counting + size.
 * Free play everywhere: tap a ball to make it jump, tap the floor for a boom, drag to stir. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const V3 = THREE.Vector3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ease = {
    outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('tinyexp.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem('tinyexp.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
  };

  const COLORS = [
    { name: 'red', hex: 0xff3b3b, css: '#ff3b3b' },
    { name: 'blue', hex: 0x2f74ff, css: '#2f74ff' },
    { name: 'yellow', hex: 0xffd21f, css: '#ffd21f' },
    { name: 'green', hex: 0x2ecc40, css: '#2ecc40' },
    { name: 'orange', hex: 0xff8c1a, css: '#ff8c1a' },
    { name: 'purple', hex: 0x9b4dff, css: '#9b4dff' },
  ];
  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const PRAISE = ['Great job!', 'You did it!', 'Wonderful!', 'Yay!', 'Super!', 'Amazing!', 'Hooray!'];
  const ROUNDS_PER_LEVEL = 3;

  // ---------------------------------------------------------------- sound
  const Sound = {
    ctx: null,
    master: null,
    muted: store.get('muted', false),
    lastBonk: 0,
    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type, vol, when, slideTo) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + Math.max(0, when || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    },
    noise(dur, vol, freq) {
      if (!this.ctx || this.muted) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
    },
    bonk(strength) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastBonk < 0.07) return;
      this.lastBonk = now;
      const f = rand(260, 420);
      this.tone(f, 0.12, 'sine', 0.05 + 0.18 * strength, 0, f * 0.6);
    },
    boing() { this.tone(160, 0.35, 'triangle', 0.3, 0, 640); },
    boom() { this.noise(0.3, 0.6, 260); this.tone(140, 0.3, 'sine', 0.35, 0, 50); },
    ding() { this.tone(880, 0.35, 'sine', 0.3); this.tone(1320, 0.5, 'sine', 0.22, 0.09); },
    boop() { this.tone(320, 0.25, 'triangle', 0.3, 0, 220); },
    plop(i) {
      const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
      const f = 392 * Math.pow(2, scale[Math.min(i, scale.length - 1)] / 12);
      this.tone(f, 0.3, 'triangle', 0.35, 0, f * 1.02);
      this.tone(f * 2, 0.15, 'sine', 0.1);
    },
    twinkle() { for (let i = 0; i < 3; i++) this.tone(rand(1200, 2200), 0.18, 'sine', 0.08, i * 0.05); },
    giggle() { for (let i = 0; i < 5; i++) this.tone(950 - i * 70, 0.09, 'sine', 0.22, i * 0.09, 1100 - i * 70); },
    whoosh() { this.noise(0.35, 0.35, 700); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.28, i * 0.12));
      this.tone(1047, 0.9, 'triangle', 0.25, 0.5);
      this.tone(1319, 0.9, 'sine', 0.18, 0.5);
      this.tone(1568, 0.9, 'sine', 0.12, 0.5);
    },
  };

  // A soft music-box loop that plays during the game.
  const Music = {
    playing: false,
    next: 0,
    step: 0,
    melody: [72, 76, 79, 76, 77, 81, 79, 0, 76, 79, 84, 79, 77, 74, 72, 0],
    bass: [48, 53, 55, 48],
    tick() {
      const ctx = Sound.ctx;
      if (!ctx || Sound.muted || !this.playing) return;
      if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;
      while (this.next < ctx.currentTime + 0.25) {
        const when = this.next - ctx.currentTime;
        const n = this.melody[this.step % this.melody.length];
        if (n) Sound.tone(440 * Math.pow(2, (n - 69) / 12), 0.35, 'triangle', 0.035, when);
        if (this.step % 4 === 0) {
          const b = this.bass[Math.floor(this.step / 4) % this.bass.length];
          Sound.tone(440 * Math.pow(2, (b - 69) / 12), 0.6, 'sine', 0.05, when);
        }
        this.step += 1;
        this.next += 0.32;
      }
    },
  };

  // ---------------------------------------------------------------- voice
  const Voice = {
    voice: null,
    lastAt: 0,
    ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    init() {
      if (!this.ok) return;
      const choose = () => {
        const en = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
        this.voice =
          en.find((v) => /samantha|karen|moira|tessa|google us english|aria|jenny|zira|female/i.test(v.name)) ||
          en.find((v) => /en-US/i.test(v.lang) && v.localService) ||
          en.find((v) => v.localService) || en[0] || null;
      };
      choose();
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', choose);
    },
    say(text, rate, pitch) {
      if (!this.ok || Sound.muted) return;
      this.lastAt = performance.now();
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = this.voice ? this.voice.lang : 'en-US';
        u.rate = rate || 0.9;
        u.pitch = pitch || 1.25;
        speechSynthesis.speak(u);
      } catch (e) { /* speech unavailable */ }
    },
    quiet(ms) { return performance.now() - this.lastAt > ms; },
    stop() { if (this.ok) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------- renderer & world
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe3a8);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const camPos = new V3(0, 10, 12), camLook = new V3(0, 0.6, -0.7);
  const camPosTarget = camPos.clone(), camLookTarget = camLook.clone();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xffd9b0, 2.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(4, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const matCache = {};
  function mat(hex, opts) {
    const key = hex + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.55, metalness: 0 }, opts));
    return matCache[key];
  }
  function mesh(geo, material, shadow) {
    const m = new THREE.Mesh(geo, material);
    if (shadow !== false) m.castShadow = true;
    return m;
  }
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function blob(material, x, y, z, sx, sy, sz) {
    const m = mesh(sphereGeo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    return m;
  }
  function canvasTexture(w, h, draw, repeatX, repeatY) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeatX) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
    }
    return tex;
  }

  // ---------------------------------------------------------------- the ball house room
  {
    // Soft foam play mats.
    const MAT_COLORS = ['#ff9f9f', '#ffd27a', '#9fe0a0', '#8fc8ff', '#d3a8ff', '#ffb3d9'];
    const floorTex = canvasTexture(256, 256, (g) => {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = MAT_COLORS[(x + y * 3) % MAT_COLORS.length];
        g.fillRect(x * 64, y * 64, 64, 64);
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 3;
        g.strokeRect(x * 64 + 2, y * 64 + 2, 60, 60);
      }
    }, 10, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls painted with bubbles and stars.
    const wallTex = canvasTexture(512, 512, (g, w, h) => {
      g.fillStyle = '#fff3cf';
      g.fillRect(0, 0, w, h);
      const cols = ['#ffb3b3', '#ffe08a', '#b5ecb5', '#a9d6ff', '#dcc2ff'];
      for (let i = 0; i < 18; i++) {
        g.fillStyle = cols[i % cols.length];
        g.globalAlpha = 0.75;
        g.beginPath();
        g.arc(rand(0, w), rand(0, h), rand(18, 46), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#ffd21f';
      for (let i = 0; i < 6; i++) {
        const cx = rand(30, w - 30), cy = rand(30, h - 30), r = rand(12, 20);
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
          g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.fill();
      }
    }, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), wallMat);
    back.position.set(0, 8, -9);
    back.receiveShadow = true;
    scene.add(back);
    [-1, 1].forEach((s) => {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), wallMat);
      side.position.set(s * 16, 8, 6);
      side.rotation.y = -s * Math.PI / 2;
      scene.add(side);
    });
    const skirting = mesh(new THREE.BoxGeometry(64, 0.6, 0.3), mat(0x7fc7ff), false);
    skirting.position.set(0, 0.3, -8.85);
    scene.add(skirting);

    // "BALL HOUSE" sign with rainbow letters.
    const signTex = canvasTexture(1024, 256, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect ? g.roundRect(8, 8, w - 16, h - 16, 100) : g.rect(8, 8, w - 16, h - 16);
      g.fill();
      g.font = 'bold 150px "Arial Rounded MT Bold", "Comic Sans MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const text = 'BALL HOUSE';
      const cols = ['#ff3b3b', '#ff8c1a', '#ffc400', '#2ecc40', '#2f74ff', '#9b4dff'];
      let x = 80;
      const widths = [...text].map((ch) => g.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      x = (w - total) / 2;
      [...text].forEach((ch, i) => {
        g.fillStyle = cols[i % cols.length];
        g.fillText(ch, x + widths[i] / 2, h / 2 + 8);
        x += widths[i];
      });
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(0, 4.6, -8.9);
    scene.add(sign);

    // Party bunting across the wall.
    const flagGeo = new THREE.BufferGeometry().setFromPoints([new V3(-0.35, 0, 0), new V3(0.35, 0, 0), new V3(0, -0.6, 0)]);
    flagGeo.computeVertexNormals();
    for (let i = 0; i < 34; i++) {
      const x = -16 + i * 0.95;
      const flag = new THREE.Mesh(flagGeo, basicMatFlat(COLORS[i % COLORS.length].hex));
      flag.position.set(x, 7.2 - Math.abs(Math.sin((x / 16) * Math.PI * 2)) * 0.8, -8.8);
      scene.add(flag);
    }
    // Giant decorative wall balls.
    [[-11, 1.2, 1.2, 0], [11.5, 1.0, 1.0, 1], [-8.5, 0.7, 0.7, 2], [9, 0.8, 0.8, 3]].forEach(([x, y, r, ci]) => {
      const b = blob(mat(COLORS[ci].hex, { roughness: 0.3 }), x, y, -8.2, r);
      scene.add(b);
    });
  }
  function basicMatFlat(hex) {
    return new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
  }

  // ---------------------------------------------------------------- the ball pit
  const pit = { W: 5, D: 2.8, group: new THREE.Group() };
  scene.add(pit.group);
  const postGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.8, 16);
  const capGeo = new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const POST_COLORS = [0xff6b6b, 0xffb84d, 0xffe14d, 0x6bdc6b, 0x5aa9ff, 0xb07cff];

  function buildPit(W, D) {
    pit.W = W;
    pit.D = D;
    while (pit.group.children.length) pit.group.remove(pit.group.children[0]);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 0.4, 0.1, 2 * D + 0.4), mat(0xe3f4ff, { roughness: 0.9 }));
    floor.position.y = -0.04;
    floor.receiveShadow = true;
    pit.group.add(floor);
    const spots = [];
    const step = 0.72;
    for (let x = -W - 0.34; x <= W + 0.35; x += step) spots.push([x, -D - 0.34], [x, D + 0.34]);
    for (let z = -D - 0.34 + step; z < D + 0.34 - 0.2; z += step) spots.push([-W - 0.34, z], [W + 0.34, z]);
    spots.forEach(([x, z], i) => {
      const m = mat(POST_COLORS[i % POST_COLORS.length], { roughness: 0.4 });
      const post = mesh(postGeo, m);
      post.position.set(x, 0.4, z);
      post.receiveShadow = true;
      const top = mesh(capGeo, m);
      top.position.set(x, 0.8, z);
      pit.group.add(post, top);
    });
  }

  // ---------------------------------------------------------------- play equipment: slide, trampoline, hopper ball
  const slide = { group: new THREE.Group(), top: new V3(), bottom: new V3(), dir: new V3() };
  scene.add(slide.group);
  function buildSlide(top, bottom) {
    const g = slide.group;
    while (g.children.length) g.remove(g.children[0]);
    slide.top.copy(top);
    slide.bottom.copy(bottom);
    slide.dir.set(bottom.x - top.x, 0, bottom.z - top.z).normalize();
    const back = new V3(top.x, 0, top.z).addScaledVector(slide.dir, -0.6);
    const h = top.y;
    const postGeo2 = new THREE.CylinderGeometry(0.09, 0.09, h + 1.3, 10);
    const perp = new V3(-slide.dir.z, 0, slide.dir.x);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b], i) => {
      const post = mesh(postGeo2, mat([0x2f74ff, 0xff3b3b, 0x2ecc40, 0xff8c1a][i]));
      post.position.copy(back).addScaledVector(slide.dir, a * 0.6).addScaledVector(perp, b * 0.6);
      post.position.y = (h + 1.3) / 2;
      g.add(post);
    });
    const deck = mesh(new THREE.BoxGeometry(1.35, 0.14, 1.35), mat(0xffd21f));
    deck.position.copy(back);
    deck.position.y = h - 0.1;
    deck.rotation.y = Math.atan2(slide.dir.x, slide.dir.z);
    g.add(deck);
    const roof = mesh(new THREE.ConeGeometry(1.15, 0.9, 4), mat(0xff4f6d));
    roof.position.copy(back);
    roof.position.y = h + 1.7;
    roof.rotation.y = Math.PI / 4 + deck.rotation.y;
    g.add(roof);
    // Ladder on the far side.
    const ladderBase = back.clone().addScaledVector(slide.dir, -0.75);
    [-0.35, 0.35].forEach((o) => {
      const rail = mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), mat(0x9b4dff));
      rail.position.copy(ladderBase).addScaledVector(perp, o);
      rail.position.y = h / 2;
      g.add(rail);
    });
    for (let y = 0.4; y < h; y += 0.45) {
      const rung = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), mat(0xffffff));
      rung.rotation.z = Math.PI / 2;
      rung.rotation.y = deck.rotation.y;
      rung.position.copy(ladderBase);
      rung.position.y = y;
      g.add(rung);
    }
    // The chute.
    const chute = new THREE.Group();
    const len = top.distanceTo(bottom);
    const bed = mesh(new THREE.BoxGeometry(1.0, 0.1, len), mat(0xffc400, { roughness: 0.25 }));
    chute.add(bed);
    [-1, 1].forEach((s) => {
      const rail = mesh(new THREE.BoxGeometry(0.1, 0.32, len), mat(0xff8c1a, { roughness: 0.3 }));
      rail.position.set(s * 0.52, 0.14, 0);
      chute.add(rail);
    });
    chute.position.lerpVectors(top, bottom, 0.5);
    chute.position.y -= 0.12;
    chute.lookAt(bottom.x, bottom.y - 0.12, bottom.z);
    g.add(chute);
    const lip = mesh(new THREE.BoxGeometry(1.0, 0.1, 0.5), mat(0xffc400, { roughness: 0.25 }));
    lip.position.copy(bottom).addScaledVector(slide.dir, 0.2);
    lip.position.y = bottom.y - 0.12;
    lip.rotation.y = deck.rotation.y;
    g.add(lip);
  }

  const tramp = { group: new THREE.Group(), pos: new V3(), bed: null, pad: null, sag: 0, H: 0.62 };
  scene.add(tramp.group);
  {
    const g = tramp.group;
    const pad = new THREE.MeshStandardMaterial({ color: 0x2f74ff, roughness: 0.4, emissive: 0x2f74ff, emissiveIntensity: 0 });
    const ring = mesh(new THREE.TorusGeometry(1.15, 0.2, 12, 40), pad);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = tramp.H;
    g.add(ring);
    const bed = mesh(new THREE.CircleGeometry(1.0, 40), mat(0x2b2f45, { roughness: 0.9 }), false);
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = tramp.H - 0.02;
    bed.receiveShadow = true;
    g.add(bed);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = mesh(new THREE.CylinderGeometry(0.06, 0.06, tramp.H, 6), mat(0x9aa3b5));
      leg.position.set(Math.cos(a) * 1.05, tramp.H / 2, Math.sin(a) * 1.05);
      g.add(leg);
    }
    // Colourful zig-zag springs around the edge.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.add(blob(mat(COLORS[i % COLORS.length].hex), Math.cos(a) * 1.15, tramp.H + 0.18, Math.sin(a) * 1.15, 0.07));
    }
    tramp.bed = bed;
    tramp.pad = pad;
  }

  // A big bouncy "hopper" ball with handles.
  const hopper = { group: new THREE.Group(), jump: 0, squash: 0 };
  scene.add(hopper.group);
  {
    const orange = mat(0xff8c1a, { roughness: 0.3 });
    const ball = blob(orange, 0, 0.75, 0, 0.75);
    hopper.ball = ball;
    hopper.group.add(ball);
    [-1, 1].forEach((s) => {
      const horn = mesh(new THREE.CapsuleGeometry(0.1, 0.25, 4, 8), orange);
      horn.position.set(s * 0.25, 1.5, 0.15);
      horn.rotation.z = -s * 0.3;
      hopper.group.add(horn);
    });
    hopper.group.add(blob(mat(0x1d1d28), -0.25, 0.95, 0.68, 0.08), blob(mat(0x1d1d28), 0.25, 0.95, 0.68, 0.08));
    const smile = mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20, Math.PI), mat(0x1d1d28), false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, 0.72, 0.72);
    hopper.group.add(smile);
  }
  function bounceHopper() {
    Sound.boing();
    tween(0.9, (k) => {
      hopper.jump = Math.abs(Math.sin(Math.PI * 2 * k)) * (1 - k * 0.5) * 1.6;
      hopper.squash = Math.max(0, Math.cos(Math.PI * 4 * k)) * (1 - k) * 0.25;
    }, () => { hopper.jump = 0; hopper.squash = 0; });
  }

  // ---------------------------------------------------------------- balls
  function dotsTexture(css) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = css;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < 6; i++) {
      [[i * 42.6 + 10, 40], [i * 42.6 + 31, 88]].forEach(([x, y]) => {
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
      });
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function ballMaterial(color) {
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: dotsTexture(color.css), roughness: 0.3, emissive: color.hex, emissiveIntensity: 0 });
  }
  const ballMats = COLORS.map(ballMaterial);
  const BALL_R = 0.48;
  let balls = [];

  function spawnBall(colorIdx, pos, vel, r) {
    const big = (r || BALL_R) > 0.6;
    const material = big ? ballMaterial(COLORS[colorIdx]) : ballMats[colorIdx];
    const m = mesh(sphereGeo, material);
    const b = {
      mesh: m, color: colorIdx, big, r: r || BALL_R, state: 'pit', ownMat: big ? material : null,
      p: pos.clone(), v: vel ? vel.clone() : new V3(), m: Math.pow(r || BALL_R, 3), scale: 1, slot: null,
    };
    b.mass = b.m;
    m.scale.setScalar(b.r);
    m.position.copy(b.p);
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    m.userData.ball = b;
    scene.add(m);
    balls.push(b);
    return b;
  }
  function removeBall(b) {
    scene.remove(b.mesh);
    if (b.ownMat) { b.ownMat.map.dispose(); b.ownMat.dispose(); }
    balls = balls.filter((o) => o !== b);
  }
  function setBallColor(b, idx) {
    b.color = idx;
    if (!b.big) b.mesh.material = ballMats[idx];
  }
  function pitBalls() { return balls.filter((b) => b.state === 'pit'); }

  function fillPit(count) {
    balls.slice().forEach(removeBall);
    for (let i = 0; i < count; i++) {
      const p = new V3(rand(-pit.W + 0.5, pit.W - 0.5), rand(3, 9), rand(-pit.D + 0.5, pit.D - 0.5));
      spawnBall(i % COLORS.length, p, new V3(rand(-1, 1), 0, rand(-1, 1)));
    }
  }

  // Simple sphere physics: gravity, floor, padded walls, ball-ball bounces.
  const tmp = new V3(), axis = new V3(), q = new THREE.Quaternion();
  function physics(dt) {
    const list = pitBalls();
    const W = pit.W, D = pit.D;
    for (const b of list) {
      b.v.y -= 15 * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < b.r) {
        if (b.v.y < -3) Sound.bonk(Math.min(1, -b.v.y / 12));
        b.p.y = b.r;
        b.v.y = b.v.y < -1.2 ? -b.v.y * 0.55 : 0;
        const f = Math.max(0, 1 - 1.1 * dt);
        b.v.x *= f;
        b.v.z *= f;
      }
      // The padded fence only stops balls near the floor, so balls tossed in from the bucket fly over it.
      const wallH = 1.3;
      const lim = (b.p.y < wallH ? 0 : 1.5);
      if (b.p.x < -W + b.r - lim) { b.p.x = -W + b.r - lim; b.v.x = Math.abs(b.v.x) * 0.7; }
      if (b.p.x > W - b.r + lim) { b.p.x = W - b.r + lim; b.v.x = -Math.abs(b.v.x) * 0.7; }
      if (b.p.z < -D + b.r - lim) { b.p.z = -D + b.r - lim; b.v.z = Math.abs(b.v.z) * 0.7; }
      if (b.p.z > D - b.r + lim) { b.p.z = D - b.r + lim; b.v.z = -Math.abs(b.v.z) * 0.7; }
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        tmp.subVectors(b.p, a.p);
        const rr = a.r + b.r;
        const d2 = tmp.lengthSq();
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2);
        tmp.divideScalar(d);
        const overlap = rr - d;
        const total = a.mass + b.mass;
        a.p.addScaledVector(tmp, -overlap * (b.mass / total));
        b.p.addScaledVector(tmp, overlap * (a.mass / total));
        const vn = (b.v.x - a.v.x) * tmp.x + (b.v.y - a.v.y) * tmp.y + (b.v.z - a.v.z) * tmp.z;
        if (vn < 0) {
          if (vn < -3.5) Sound.bonk(Math.min(1, -vn / 12));
          const imp = (-(1 + 0.6) * vn) / (1 / a.mass + 1 / b.mass);
          a.v.addScaledVector(tmp, -imp / a.mass);
          b.v.addScaledVector(tmp, imp / b.mass);
        }
      }
    }
  }
  function syncBalls(dt) {
    for (const b of balls) {
      if (b.state === 'pit') {
        b.mesh.position.copy(b.p);
        const speed = Math.hypot(b.v.x, b.v.z);
        if (speed > 0.01) {
          axis.set(b.v.z, 0, -b.v.x).normalize();
          q.setFromAxisAngle(axis, (speed * dt) / b.r);
          b.mesh.quaternion.premultiply(q);
        }
      }
      b.mesh.scale.setScalar(b.r * b.scale * (b.pulse ? 1 + 0.12 * Math.sin(time * 8) : 1));
    }
  }

  // ---------------------------------------------------------------- characters (original designs)
  function makeMouse() {
    const g = new THREE.Group();
    const fur = mat(0x8d6748), cream = mat(0xffe3c4), pinkM = mat(0xffb3c6), nose = mat(0xff6f91, { roughness: 0.3 });
    const overalls = mat(0x3d7dff), shoes = mat(0x2ecc71, { roughness: 0.4 }), dark = mat(0x1d1d28, { roughness: 0.25 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    g.add(blob(overalls, 0, 1.0, 0, 0.72, 0.8, 0.62));
    g.add(blob(mat(0xffd21f), -0.28, 1.45, 0.52, 0.08), blob(mat(0xffd21f), 0.28, 1.45, 0.52, 0.08));
    [-1, 1].forEach((s) => {
      const leg = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.4, 10), fur);
      leg.position.set(s * 0.3, 0.32, 0);
      g.add(leg, blob(shoes, s * 0.32, 0.12, 0.12, 0.22, 0.14, 0.32));
    });
    const head = new THREE.Group();
    head.position.set(0, 2.05, 0);
    head.add(blob(fur, 0, 0.2, 0, 0.72));
    [-1, 1].forEach((s) => {
      const ear = new THREE.Group();
      ear.position.set(s * 0.62, 0.85, -0.05);
      const outer = mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 32), fur);
      outer.rotation.x = Math.PI / 2;
      const inner = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 32), pinkM, false);
      inner.rotation.x = Math.PI / 2;
      inner.position.z = 0.07;
      ear.add(outer, inner);
      ear.rotation.z = -s * 0.25;
      head.add(ear);
    });
    head.add(blob(cream, 0, 0.0, 0.48, 0.42, 0.32, 0.32));
    head.add(blob(nose, 0, 0.12, 0.8, 0.11));
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.36, 0);
    [-1, 1].forEach((s) => {
      eyes.add(blob(mat(0xffffff, { roughness: 0.3 }), s * 0.22, 0, 0.55, 0.14, 0.19, 0.1));
      eyes.add(blob(dark, s * 0.21, -0.03, 0.64, 0.075));
      const hl = new THREE.Mesh(sphereGeo, white);
      hl.position.set(s * 0.21 + 0.03, 0.02, 0.71);
      hl.scale.setScalar(0.026);
      eyes.add(hl);
    });
    head.add(eyes);
    const smile = mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 20, Math.PI), dark, false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.08, 0.78);
    head.add(smile);
    [-1, 1].forEach((s) => [0.05, -0.04].forEach((y) => {
      const w = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), dark, false);
      w.rotation.z = Math.PI / 2 + s * y * 3;
      w.position.set(s * 0.42, y + 0.06, 0.68);
      head.add(w);
    }));
    g.add(head);
    const tail = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new V3(0, 0.8, -0.55), new V3(0.2, 0.6, -1.0), new V3(0.5, 1.0, -1.2), new V3(0.4, 1.4, -1.0),
    ]), 20, 0.04, 6), pinkM);
    g.add(tail);
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.62, 1.4, 0);
      const arm = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.55, 8), fur);
      arm.position.set(s * 0.05, -0.28, 0);
      pivot.add(arm, blob(cream, s * 0.07, -0.6, 0, 0.16));
      pivot.userData.side = s;
      g.add(pivot);
      return pivot;
    });
    return { group: g, head, eyes, arms, mouth: smile, name: 'Momo' };
  }

  function makeBuddy() {
    const g = new THREE.Group();
    const yellow = mat(0xffd93b, { roughness: 0.45 }), dark = mat(0x1d1d28, { roughness: 0.25 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const body = mesh(new THREE.CapsuleGeometry(0.78, 1.15, 10, 28), yellow);
    body.position.y = 1.5;
    g.add(body);
    const head = new THREE.Group();
    head.position.set(0, 2.1, 0);
    const eyes = new THREE.Group();
    [-1, 1].forEach((s) => {
      eyes.add(blob(mat(0xffffff, { roughness: 0.25 }), s * 0.3, 0.15, 0.6, 0.27));
      eyes.add(blob(mat(0x2f74ff, { roughness: 0.3 }), s * 0.29, 0.13, 0.82, 0.14, 0.14, 0.06));
      eyes.add(blob(dark, s * 0.29, 0.13, 0.87, 0.07, 0.07, 0.03));
      const hl = new THREE.Mesh(sphereGeo, white);
      hl.position.set(s * 0.29 + 0.04, 0.18, 0.9);
      hl.scale.setScalar(0.03);
      eyes.add(hl);
    });
    head.add(eyes);
    [-1, 1].forEach((s) => head.add(blob(mat(0xff9ab0), s * 0.55, -0.22, 0.52, 0.1, 0.07, 0.05)));
    const smile = mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20, Math.PI), dark, false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.25, 0.74);
    head.add(smile);
    const stalk = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), mat(0x666b7a));
    stalk.position.set(0, 1.35, 0);
    const bulb = blob(new THREE.MeshStandardMaterial({ color: 0xff5fa2, emissive: 0xff5fa2, emissiveIntensity: 0.6 }), 0, 1.65, 0, 0.14);
    head.add(stalk, bulb);
    g.add(head);
    const tie = mat(0xff5a36);
    [-1, 1].forEach((s) => {
      const c = mesh(new THREE.ConeGeometry(0.14, 0.26, 12), tie);
      c.rotation.z = s * Math.PI / 2;
      c.position.set(s * 0.13, 1.35, 0.77);
      g.add(c);
    });
    g.add(blob(tie, 0, 1.35, 0.8, 0.07));
    const badge = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24), mat(0x7fd3ff));
    badge.rotation.x = Math.PI / 2;
    badge.position.set(0, 0.95, 0.74);
    g.add(badge, blob(mat(0xffffff), 0, 0.95, 0.77, 0.08, 0.08, 0.03));
    [-1, 1].forEach((s) => g.add(blob(mat(0x2b4a8a), s * 0.32, 0.1, 0.15, 0.24, 0.14, 0.34)));
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.78, 1.55, 0);
      const arm = mesh(new THREE.CapsuleGeometry(0.09, 0.45, 4, 8), yellow);
      arm.position.set(s * 0.05, -0.3, 0);
      pivot.add(arm, blob(yellow, s * 0.07, -0.62, 0, 0.13));
      pivot.userData.side = s;
      g.add(pivot);
      return pivot;
    });
    return { group: g, head, eyes, arms, mouth: smile, bulb, name: 'Bolt' };
  }

  const chars = { 1: makeMouse(), 2: makeBuddy() };
  Object.values(chars).forEach((c) => {
    c.anim = { jump: 0, spin: 0, armsUp: 0, wobble: 0, blinkAt: rand(1, 3), target: new V3(), scale: 1 };
    scene.add(c.group);
  });

  function hop(c, h, spins, dur) {
    tween(dur || 0.8, (k) => {
      c.anim.jump = Math.sin(Math.PI * k) * h;
      c.anim.spin = ease.inOutSine(k) * Math.PI * 2 * (spins || 0);
      c.anim.armsUp = Math.sin(Math.PI * k);
    }, () => { c.anim.jump = 0; c.anim.spin = 0; c.anim.armsUp = 0; });
  }
  function cheer(c) { hop(c, 1.0, 1, 0.9); }
  function dance(c) { hop(c, 0.6, 0, 0.45); later(0.5, () => hop(c, 0.6, 0, 0.45)); later(1.0, () => hop(c, 1.1, 1, 0.9)); }
  function catchPose(c) {
    tween(0.45, (k) => { c.anim.armsUp = Math.max(c.anim.armsUp, Math.sin(Math.PI * k) * 0.8); });
  }
  function giggle(c) {
    Sound.giggle();
    tween(0.8, (k) => { c.anim.wobble = Math.sin(k * Math.PI * 8) * (1 - k) * 0.25; }, () => { c.anim.wobble = 0; });
    hop(c, 0.4, 0, 0.4);
  }

  // ---------------------------------------------------------------- playground actions
  function boomAt(p, strength) {
    for (const b of pitBalls()) {
      const dx = b.p.x - p.x, dz = b.p.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.6) {
        const f = (1 - d / 2.6) * (b.big ? 0.5 : 1) * strength;
        b.v.y += 7 * f;
        b.v.x += (dx / (d || 1)) * 3 * f;
        b.v.z += (dz / (d || 1)) * 3 * f;
      }
    }
  }

  function trampChar() { return game.onTramp === 'active' ? chars[game.level] : chars[game.level === 1 ? 2 : 1]; }
  // Whoever is on the trampoline bounces; big bounces add a spin.
  function bounceTramp(big) {
    const c = trampChar();
    if (c.anim.script || c.anim.bouncing) return false;
    c.anim.bouncing = true;
    const h = big ? 2.2 : 1.1, dur = big ? 0.9 : 0.65;
    Sound.tone(big ? 180 : 240, dur * 0.8, 'triangle', 0.28, 0, big ? 720 : 520);
    tween(0.12, (k) => { tramp.sag = Math.sin(Math.PI * k) * 0.25; });
    tween(dur, (k) => {
      c.anim.jump = Math.sin(Math.PI * k) * h;
      c.anim.spin = big ? ease.inOutSine(k) * Math.PI * 2 : 0;
      c.anim.armsUp = Math.sin(Math.PI * k);
    }, () => {
      c.anim.jump = 0;
      c.anim.spin = 0;
      c.anim.armsUp = 0;
      c.anim.bouncing = false;
      tween(0.15, (k) => { tramp.sag = Math.sin(Math.PI * k) * 0.18; });
    });
    return true;
  }

  // A character climbs the slide, whooshes down and splashes into the ball pit.
  function slideRide(c) {
    const a = c.anim;
    if (a.script || a.bouncing) return;
    a.script = true;
    const start = c.group.position.clone();
    const top = slide.top.clone().add(new V3(0, 0.05, 0)).addScaledVector(slide.dir, -0.2);
    const bottom = slide.bottom.clone();
    const land = bottom.clone().addScaledVector(slide.dir, 1.4);
    land.y = 0.15;
    const facing = Math.atan2(slide.dir.x, slide.dir.z);
    tween(0.8, (k) => {
      c.group.position.lerpVectors(start, top, ease.inOutSine(k));
      c.group.position.y = start.y + (top.y - start.y) * k + Math.sin(Math.PI * k) * 1.4;
      a.armsUp = Math.sin(Math.PI * k) * 0.5;
    }, () => {
      Voice.say('Wheee!', 1.0, 1.7);
      Sound.tone(1300, 0.8, 'sine', 0.2, 0, 380);
      tween(0.75, (k) => {
        c.group.position.lerpVectors(top, bottom, k * k);
        a.armsUp = 1;
        a.face = facing;
      }, () => {
        tween(0.4, (k) => {
          c.group.position.lerpVectors(bottom, land, k);
          c.group.position.y += Math.sin(Math.PI * k) * 0.7;
        }, () => {
          Sound.boom();
          boomAt(land, 1.3);
          burst(land.clone().add(new V3(0, 0.6, 0)), ALL_HEX, 24, { speed: 5 });
          a.face = null;
          later(0.6, () => {
            const from = c.group.position.clone();
            tween(0.85, (k) => {
              c.group.position.lerpVectors(from, a.target, ease.inOutSine(k));
              c.group.position.y = from.y + (a.target.y - from.y) * k + Math.sin(Math.PI * k) * 1.8;
            }, () => { a.script = false; a.armsUp = 0; a.baseY = a.target.y; });
          });
        });
      });
    });
  }

  // Tapping the slide sends a few new balls whooshing down into the pit.
  function ballsDownSlide(n) {
    for (let i = 0; i < n; i++) {
      later(i * 0.28, () => {
        const b = spawnBall(randInt(0, COLORS.length - 1), slide.top.clone().add(new V3(0, 0.5, 0)));
        b.state = 'fly';
        const from = slide.top.clone().add(new V3(0, b.r + 0.05, 0));
        const to = slide.bottom.clone().add(new V3(0, b.r + 0.05, 0));
        tween(0.7, (k) => {
          b.mesh.position.lerpVectors(from, to, k * k);
          b.mesh.rotateX(0.25);
        }, () => {
          b.state = 'pit';
          b.p.copy(to);
          b.v.copy(slide.dir).multiplyScalar(6).add(new V3(0, 1.5, 0));
          trimBalls();
        });
        Sound.tone(900 - i * 80, 0.5, 'sine', 0.12, 0, 300);
      });
    }
  }
  function trimBalls() {
    const live = pitBalls().filter((b) => !b.big);
    if (live.length <= game.maxBalls) return;
    const r = game.round;
    const target = r && r.type === 'color' ? COLORS.indexOf(r.target) : -1;
    const spare = live.filter((b) => b.color !== target);
    const b = pick(spare.length ? spare : live);
    b.state = 'fly';
    tween(0.35, (k) => { b.scale = 1 - k; }, () => removeBall(b));
    burst(b.p, [0xffffff], 5, { speed: 2, geo: sparkGeo, life: 0.5 });
  }

  // ---------------------------------------------------------------- bucket
  const bucket = new THREE.Group();
  {
    const red = mat(0xff4f6d, { side: THREE.DoubleSide, roughness: 0.4 });
    const body = mesh(new THREE.CylinderGeometry(0.85, 0.65, 1.0, 28, 1, true), red);
    body.position.y = 0.5;
    const bottom = mesh(new THREE.CircleGeometry(0.65, 28), red);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.03;
    const rim = mesh(new THREE.TorusGeometry(0.85, 0.08, 10, 32), mat(0xffffff));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.0;
    const band = mesh(new THREE.TorusGeometry(0.76, 0.06, 8, 32), mat(0xffd21f));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.5;
    bucket.add(body, bottom, rim, band);
  }
  scene.add(bucket);
  const bucketTarget = new V3();
  let bucketCount = 0;

  // ---------------------------------------------------------------- tweens, timers, particles
  let tweens = [];
  function tween(dur, update, done, delay) {
    tweens.push({ t: -(delay || 0), dur, update, done });
  }
  function stepTweens(dt) {
    const list = tweens;
    tweens = [];
    for (const tw of list) {
      tw.t += dt;
      if (tw.t < 0) { tweens.push(tw); continue; }
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(k);
      if (k < 1) tweens.push(tw);
      else if (tw.done) tw.done();
    }
  }
  let timers = [];
  function later(sec, fn) { timers.push({ t: sec, fn }); }
  function stepTimers(dt) {
    const due = [];
    timers = timers.filter((tm) => {
      tm.t -= dt;
      if (tm.t <= 0) { due.push(tm); return false; }
      return true;
    });
    due.forEach((tm) => tm.fn());
  }

  const particles = [];
  const confettiGeo = new THREE.PlaneGeometry(0.24, 0.15);
  const sparkGeo = new THREE.OctahedronGeometry(0.13);
  const basicCache = {};
  function basicMat(hex) {
    if (!basicCache[hex]) basicCache[hex] = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
    return basicCache[hex];
  }
  const ALL_HEX = COLORS.map((c) => c.hex);
  function burst(pos, colors, count, opts) {
    const o = Object.assign({ speed: 6, life: 1.6, gravity: 9, geo: confettiGeo, up: 3 }, opts);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(o.geo, basicMat(pick(colors)));
      m.position.copy(pos);
      const dir = new V3(rand(-1, 1), rand(-0.5, 1), rand(-1, 1)).normalize();
      particles.push({ m, v: dir.multiplyScalar(rand(0.4, 1) * o.speed).add(new V3(0, o.up, 0)), spin: new V3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(0.7, 1) * o.life, g: o.gravity, s: 1 });
      scene.add(m);
    }
  }
  function confettiRain(count) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(confettiGeo, basicMat(pick(ALL_HEX)));
      m.position.set(camLook.x + rand(-9, 9), rand(6, 13), camLook.z + rand(-3, 4));
      m.scale.setScalar(1.5);
      particles.push({ m, v: new V3(rand(-0.5, 0.5), rand(-2, 0), 0), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: rand(3, 4.5), g: 1.2, s: 1.5 });
      scene.add(m);
    }
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.v.multiplyScalar(1 - 1.2 * dt);
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      p.m.rotation.z += p.spin.z * dt;
      if (p.life < 0.4) p.m.scale.setScalar(Math.max(0.01, p.life / 0.4) * p.s);
    }
  }

  // ---------------------------------------------------------------- layout & camera
  let aspect = 1;
  const isPortrait = () => aspect < 0.9;

  let lastLayoutKey = '';
  function layout(snap) {
    const p = isPortrait();
    const W = p ? 2.3 : 3.3, D = p ? 2.5 : 2.3;
    const key = W + ',' + D;
    if (key !== lastLayoutKey) {
      lastLayoutKey = key;
      buildPit(W, D);
      if (p) buildSlide(new V3(-2.0, 2.4, -D - 1.9), new V3(-1.35, 0.75, -D + 0.5));
      else buildSlide(new V3(-W - 2.3, 2.6, -0.3), new V3(-W + 0.5, 0.75, -0.3));
      tramp.pos.set(p ? 2.0 : W + 2.3, 0, p ? -D - 1.7 : -0.2);
      tramp.group.position.copy(tramp.pos);
      hopper.group.visible = !p;
      hopper.home = new V3(W + 1.8, 0, D + 0.9);
    }
    const standZ = -D - 2.0;
    const s = p ? 0.8 : 1;
    const active = chars[game.level], other = chars[game.level === 1 ? 2 : 1];
    const jumper = game.onTramp === 'active' ? active : other;
    const stander = jumper === active ? other : active;
    stander.anim.target.set(0, 0, standZ);
    jumper.anim.target.set(tramp.pos.x, tramp.H, tramp.pos.z);
    stander.anim.scale = s;
    jumper.anim.scale = s * 0.8;
    bucketTarget.set(0, 0, standZ + 0.95);

    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = p ? W + 1.0 : W + 3.9;
    const dist = Math.max(halfW / (tanH * aspect), (D + 3.4) / tanH, 8);
    camLookTarget.set(0, 1.0, -1.3);
    camPosTarget.set(0, 1.0 + dist * 0.7, -1.3 + dist * 0.71);
    if (snap) {
      camPos.copy(camPosTarget);
      camLook.copy(camLookTarget);
      [active, other].forEach((c) => { c.group.position.copy(c.anim.target); c.group.scale.setScalar(c.anim.scale); });
      bucket.position.copy(bucketTarget);
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    layout(false);
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- game state & UI
  const game = {
    screen: 'start',
    level: 1,
    roundIdx: 0,
    round: null,
    onTramp: 'other',
    stars: store.get('stars', 0),
    progress: Object.assign({ l1: 0, l2: 0 }, store.get('ballProgress', {})),
    lastTarget: null,
    lastCount: 0,
    maxBalls: 26,
    idle: 0,
    idleCount: 0,
  };
  const ui = {
    start: $('start'), select: $('select'), hud: $('hud'), prompt: $('prompt'), promptIcon: $('promptIcon'),
    promptText: $('promptText'), slots: $('slots'), stars: $('stars'), starCount: $('starCount'), party: $('party'),
    soundBtn: $('soundBtn'),
  };
  ui.starCount.textContent = game.stars;

  function ballSvg(css, size) {
    return '<svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '"><circle cx="20" cy="20" r="18" fill="' + css + '"/>' +
      '<circle cx="13" cy="13" r="4" fill="#fff" opacity=".9"/><circle cx="27" cy="25" r="3" fill="#fff" opacity=".9"/><circle cx="14" cy="28" r="2.5" fill="#fff" opacity=".9"/></svg>';
  }
  function showPrompt(icon, text, need) {
    ui.promptIcon.innerHTML = icon;
    ui.promptText.textContent = text;
    ui.slots.innerHTML = '<i></i>'.repeat(need);
    ui.prompt.classList.remove('show');
    void ui.prompt.offsetWidth;
    ui.prompt.classList.add('show');
  }
  function fillSlot(i, css) {
    const s = ui.slots.children[i];
    if (s) { s.classList.add('on'); s.style.setProperty('--c', css); }
  }
  function screenPos(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  }
  function awardStar(fromWorld) {
    game.stars += 1;
    store.set('stars', game.stars);
    store.set('ballProgress', game.progress);
    const from = screenPos(fromWorld);
    const to = ui.stars.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'fly-star';
    el.textContent = '⭐';
    el.style.left = from.x + 'px';
    el.style.top = from.y + 'px';
    document.body.appendChild(el);
    const done = () => {
      el.remove();
      ui.starCount.textContent = game.stars;
      ui.stars.classList.remove('bump');
      void ui.stars.offsetWidth;
      ui.stars.classList.add('bump');
      Sound.twinkle();
    };
    if (el.animate) {
      el.animate([
        { transform: 'translate(0,0) scale(0.3)' },
        { transform: 'translate(0,-40px) scale(1.6) rotate(90deg)', offset: 0.3 },
        { transform: 'translate(' + (to.left + 28 - from.x) + 'px,' + (to.top + 32 - from.y) + 'px) scale(0.6) rotate(360deg)' },
      ], { duration: 1100, easing: 'ease-in-out' }).onfinish = done;
    } else {
      done();
    }
    return game.stars % 5 === 0;
  }
  function banner(html, cls) {
    ui.party.className = cls || '';
    ui.party.innerHTML = html;
    void ui.party.offsetWidth;
    ui.party.classList.add('show');
    later(2.7, () => ui.party.classList.add('hidden'));
  }
  function party() {
    banner('\u{1F389}<b>' + game.stars + ' ⭐</b>');
    Sound.fanfare();
    confettiRain(160);
    Voice.say('Hooray! You have ' + game.stars + ' stars!');
    dance(chars[1]);
    dance(chars[2]);
  }

  // ---------------------------------------------------------------- rounds
  function planRound() {
    if (game.level === 1) {
      const p = game.progress.l1;
      const pool = p < 4 ? COLORS.slice(0, 4) : COLORS;
      let target = pick(pool);
      if (target.name === game.lastTarget) target = pick(pool.filter((c) => c !== target));
      game.lastTarget = target.name;
      return { type: 'color', target, need: p < 3 ? 3 : p < 8 ? 4 : 5 };
    }
    const p = game.progress.l2;
    if (game.roundIdx === 1) return { type: 'bounce', need: p < 3 ? 3 : randInt(3, 5) };
    if (game.roundIdx === 2) return { type: 'big', need: 1 };
    const [lo, hi] = p < 3 ? [2, 3] : p < 8 ? [2, 5] : [3, 6];
    let need = randInt(lo, hi);
    if (need === game.lastCount) need = need < hi ? need + 1 : lo;
    game.lastCount = need;
    return { type: 'count', need };
  }

  function startRound() {
    const r = Object.assign(planRound(), { got: 0, wrong: 0, locked: false });
    game.round = r;
    game.idle = 0;
    game.idleCount = 0;
    const c = chars[game.level];
    if (r.type === 'color') {
      const idx = COLORS.indexOf(r.target);
      // Make sure there are plenty of the asked-for color, with a magic poof.
      let have = pitBalls().filter((b) => b.color === idx).length;
      const others = pitBalls().filter((b) => b.color !== idx && !b.big).sort(() => Math.random() - 0.5);
      while (have < r.need + 2 && others.length) {
        const b = others.pop();
        setBallColor(b, idx);
        burst(b.p, [0xffffff, 0xffe066], 6, { speed: 2.5, geo: sparkGeo, life: 0.6 });
        have += 1;
      }
      r.say = c.name + ' wants ' + r.target.name + ' balls! Tap the ' + r.target.name + ' balls.';
      showPrompt(ballSvg(r.target.css, 60), cap(r.target.name), r.need);
    } else if (r.type === 'count') {
      r.say = 'Give ' + c.name + ' ' + NUMBER_WORDS[r.need] + ' balls! Tap ' + NUMBER_WORDS[r.need] + ' balls.';
      showPrompt('<span class="num">' + r.need + '</span>', r.need + ' balls', r.need);
    } else if (r.type === 'bounce') {
      game.onTramp = 'active';
      layout(false);
      r.say = 'Make ' + c.name + ' jump ' + NUMBER_WORDS[r.need] + ' times! Tap the trampoline.';
      showPrompt('<span class="num">' + r.need + '</span>', r.need + ' jumps', r.need);
    } else {
      const colorIdx = randInt(0, COLORS.length - 1);
      r.bigBall = spawnBall(colorIdx, new V3(0, 9, 0), new V3(0, -2, 0), 1.0);
      r.bigBall.mass = 6;
      Sound.whoosh();
      later(0.7, () => Sound.boing());
      r.say = 'Whoa! A big ball! Tap the big ball!';
      showPrompt(ballSvg(COLORS[colorIdx].css, 64) + ballSvg('#b8c2d6', 26), 'Big ball!', 1);
    }
    hop(c, 0.5, 0, 0.5);
    Voice.say(r.say);
  }

  function tapBall(b) {
    const r = game.round;
    // Every tap makes the ball jump, so tapping is fun even between rounds.
    const jump = () => {
      b.v.y = b.big ? 7 : 8.5;
      b.v.x += rand(-1, 1);
      b.v.z += rand(-1, 1);
      Sound.boing();
    };
    if (!r || r.locked || game.screen !== 'play') { jump(); return; }

    let correct;
    if (r.type === 'color') correct = b.color === COLORS.indexOf(r.target) && !b.big;
    else if (r.type === 'count') correct = !b.big;
    else correct = b === r.bigBall;

    if (!correct) {
      jump();
      r.wrong += 1;
      if (Voice.quiet(1500)) {
        if (r.type === 'color') Voice.say(b.big ? "That's a big ball! Find " + r.target.name + '.' : "That's " + COLORS[b.color].name + '! Find ' + r.target.name + '.');
        else if (r.type === 'big') Voice.say("That's a little ball. Find the big ball!");
      }
      if (r.wrong >= 2) setHint(true);
      return;
    }

    r.got += 1;
    game.idle = 0;
    fillSlot(r.got - 1, COLORS[b.color].css);
    Sound.plop(r.got);
    if (r.type !== 'big') Voice.say(cap(NUMBER_WORDS[r.got]) + '!', 1.0);
    collect(b);
    if (r.got >= r.need) roundDone();
  }

  function tapTramp() {
    const r = game.round;
    if (game.screen === 'play' && r && r.type === 'bounce' && !r.locked) {
      if (trampChar().anim.target.y === 0 || !bounceTramp(true)) return;
      game.idle = 0;
      tramp.hint = false;
      r.got += 1;
      fillSlot(r.got - 1, '#2f74ff');
      Sound.plop(r.got);
      Voice.say(cap(NUMBER_WORDS[r.got]) + '!', 1.0);
      if (r.got >= r.need) roundDone();
      return;
    }
    bounceTramp(true);
  }

  function collect(b) {
    b.state = 'fly';
    b.pulse = false;
    const c = chars[game.level];
    const from = b.p.clone();
    if (b.big) {
      const to = c.group.position.clone().add(new V3(0, 4.2 * c.anim.scale, 0.3));
      tween(0.9, (k) => {
        b.mesh.position.lerpVectors(from, to, ease.inOutSine(k));
        b.mesh.position.y += Math.sin(Math.PI * k) * 2.5;
        b.mesh.rotation.y += 0.2;
      }, () => {
        catchPose(c);
        later(0.4, () => {
          Sound.boom();
          burst(b.mesh.position, ALL_HEX, 70, { speed: 7 });
          removeBall(b);
        });
      });
      return;
    }
    const slot = bucketCount++;
    b.slot = new V3(rand(-0.3, 0.3), 0.45 + Math.floor(slot / 4) * 0.32, rand(-0.25, 0.25));
    tween(0.75, (k) => {
      const to = bucket.position.clone().add(b.slot);
      b.mesh.position.lerpVectors(from, to, ease.inOutSine(k));
      b.mesh.position.y += Math.sin(Math.PI * k) * 2.8;
      b.scale = 1 - 0.2 * k;
    }, () => {
      b.state = 'bucket';
      catchPose(c);
      burst(bucket.position.clone().add(new V3(0, 1.1, 0)), [0xffe066, 0xffffff], 8, { speed: 3, geo: sparkGeo, life: 0.7 });
    });
  }

  function setHint(on) {
    const r = game.round;
    if (!r) return;
    if (r.type === 'color') {
      ballMats.forEach((m, i) => { m.userData.hint = on && i === COLORS.indexOf(r.target); });
      pitBalls().forEach((b) => { b.pulse = on && b.color === COLORS.indexOf(r.target) && !b.big; });
    } else if (r.type === 'bounce') {
      tramp.hint = on;
    } else if (r.type === 'big' && r.bigBall) {
      r.bigBall.pulse = on;
      r.bigBall.ownMat.userData.hint = on;
    }
  }

  function roundDone() {
    const r = game.round;
    r.locked = true;
    setHint(false);
    game.progress['l' + game.level] += 1;
    const c = chars[game.level], other = chars[game.level === 1 ? 2 : 1];
    later(0.9, () => {
      if (r.type === 'color') Voice.say(cap(NUMBER_WORDS[r.need]) + ' ' + r.target.name + ' balls! ' + pick(PRAISE));
      else if (r.type === 'count') Voice.say(cap(NUMBER_WORDS[r.need]) + ' balls! ' + pick(PRAISE) + ' ' + c.name + ' says thank you!');
      else if (r.type === 'bounce') Voice.say(cap(NUMBER_WORDS[r.need]) + ' jumps! ' + pick(PRAISE));
      else Voice.say('The big ball! ' + pick(PRAISE));
      Sound.ding();
      cheer(c);
      later(0.3, () => hop(other, 0.6, 0, 0.5));
      const at = bucket.position.clone().add(new V3(0, 1.5, 0));
      burst(at, ALL_HEX, 50);
      const big = awardStar(at);
      if (big) later(1.8, party);
      // Reward: a trip down the slide into the balls!
      if (r.type !== 'bounce') later(1.0, () => slideRide(c));
      later(big ? 5.6 : 4.4, nextRound);
    });
  }

  // The character tips the bucket and tosses the balls back into the pit.
  function pourBack() {
    const inBucket = balls.filter((b) => b.state === 'bucket');
    inBucket.forEach((b, i) => {
      later(i * 0.08, () => {
        b.state = 'pit';
        b.scale = 1;
        b.p.copy(bucket.position).add(new V3(rand(-0.2, 0.2), 1.3, 0));
        b.v.set(-b.p.x * rand(0.25, 0.45) + rand(-1, 1), rand(7, 9), -b.p.z * rand(0.35, 0.5) + rand(0, 1));
      });
    });
    bucketCount = 0;
    if (inBucket.length) { Sound.whoosh(); catchPose(chars[game.level]); }
  }

  function nextRound() {
    pourBack();
    game.onTramp = 'other';
    layout(false);
    game.roundIdx += 1;
    if (game.roundIdx >= ROUNDS_PER_LEVEL) {
      later(1.2, levelComplete);
    } else {
      later(1.6, startRound);
    }
  }

  function levelComplete() {
    game.round = null;
    const c = chars[game.level];
    banner('\u{1F3C6}<b>Level ' + game.level + '!</b>', 'level');
    Sound.fanfare();
    confettiRain(140);
    dance(c);
    Voice.say('You finished level ' + game.level + '! Wow!');
    later(3.2, () => startLevel(game.level === 1 ? 2 : 1));
  }

  function startLevel(level) {
    timers = [];
    game.level = level;
    game.roundIdx = 0;
    game.round = null;
    pourBack();
    bucketCount = 0;
    game.onTramp = 'other';
    layout(false);
    const c = chars[level];
    showPrompt('', '', 0);
    ui.promptText.textContent = 'Level ' + level;
    banner((level === 1 ? '\u{1F42D}' : '\u{1F49B}') + '<b>Level ' + level + '</b>', 'level');
    hop(c, 1.0, 1, 0.9);
    Voice.say(level === 1 ? "Hi! I'm Momo the mouse! Let's find colorful balls!" : "Hi! I'm Bolt! Let's count balls together!");
    later(3.4, startRound);
  }

  // ---------------------------------------------------------------- screens
  function show(screen) {
    game.screen = screen;
    ui.start.classList.toggle('hidden', screen !== 'start');
    ui.select.classList.toggle('hidden', screen !== 'select');
    ui.hud.classList.toggle('hidden', screen !== 'play');
    Music.playing = screen === 'play';
  }

  $('playBtn').addEventListener('click', () => {
    Sound.unlock();
    Voice.init();
    show('select');
    Sound.fanfare();
    hop(chars[1], 0.8, 1, 0.8);
    later(0.3, () => hop(chars[2], 0.8, 1, 0.8));
    Voice.say('Welcome to the ball house! Pick Momo or Bolt!');
  });
  document.querySelectorAll('.level-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.unlock();
      Sound.ding();
      show('play');
      startLevel(Number(btn.dataset.level));
    });
  });
  $('homeBtn').addEventListener('click', () => {
    Sound.boop();
    timers = [];
    game.round = null;
    setHint(false);
    pourBack();
    show('select');
    ui.party.classList.add('hidden');
    Voice.say('Pick Momo or Bolt!');
  });
  ui.prompt.addEventListener('click', () => {
    game.idle = 0;
    if (game.round && !game.round.locked) Voice.say(game.round.say);
  });
  function renderSoundBtn() { ui.soundBtn.textContent = Sound.muted ? '\u{1F507}' : '\u{1F50A}'; }
  ui.soundBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.muted = !Sound.muted;
    store.set('muted', Sound.muted);
    if (Sound.muted) Voice.stop(); else Sound.ding();
    renderSoundBtn();
  });
  renderSoundBtn();
  document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.stop(); });

  // ---------------------------------------------------------------- input: tap, boom, stir
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new V3(0, 1, 0), -0.4);
  let drag = null;

  function setRay(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }
  function floorPoint() {
    const p = new V3();
    return raycaster.ray.intersectPlane(floorPlane, p) ? p : null;
  }
  function inPit(p) { return p && Math.abs(p.x) < pit.W + 0.3 && Math.abs(p.z) < pit.D + 0.3; }

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (game.screen === 'start') return;
    game.idle = 0;
    setRay(e);
    const live = pitBalls();
    const roots = [chars[1].group, chars[2].group, slide.group, tramp.group];
    if (hopper.group.visible) roots.push(hopper.group);
    const hits = raycaster.intersectObjects(live.map((b) => b.mesh).concat(roots), true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.ball && !roots.includes(o)) o = o.parent;
      if (o && o.userData.ball) return tapBall(o.userData.ball);
      if (o === tramp.group) return tapTramp();
      if (o === slide.group) return ballsDownSlide(3);
      if (o === hopper.group) return bounceHopper();
      const c = o === chars[1].group ? chars[1] : o === chars[2].group ? chars[2] : null;
      if (c) return c === trampChar() && c.anim.target.y > 0 ? tapTramp() : giggle(c);
    }
    // Forgiving taps: accept the ball closest to the finger if it is near enough.
    let best = null, bestD = Infinity;
    for (const b of live) {
      const d = raycaster.ray.distanceToPoint(b.p) / b.r;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best && bestD < 1.7) return tapBall(best);

    const p = floorPoint();
    if (inPit(p)) {
      // Tapping the floor makes a boom that bounces nearby balls up.
      Sound.boom();
      burst(p, [0xffffff, 0x9be7ff, 0xffe066], 10, { speed: 3, geo: sparkGeo, life: 0.6, up: 1 });
      boomAt(p, 1);
      drag = { last: p, t: performance.now() };
    } else {
      const sp = raycaster.ray.at(14, new V3());
      burst(sp, [0xffe066, 0xffffff, 0x9be7ff], 8, { speed: 3, geo: sparkGeo, life: 0.7, up: 1.5, gravity: 3 });
      Sound.twinkle();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    setRay(e);
    const p = floorPoint();
    if (!p) return;
    const now = performance.now();
    const dt = Math.max(0.016, (now - drag.t) / 1000);
    const vx = (p.x - drag.last.x) / dt, vz = (p.z - drag.last.z) / dt;
    for (const b of pitBalls()) {
      const d = Math.hypot(b.p.x - p.x, b.p.z - p.z);
      if (d < 1.4) {
        const f = (1 - d / 1.4) * (b.big ? 0.15 : 0.35);
        b.v.x += Math.max(-10, Math.min(10, vx)) * f;
        b.v.z += Math.max(-10, Math.min(10, vz)) * f;
        if (b.p.y < b.r + 0.05) b.v.y += 1.2 * f;
      }
    }
    drag.last = p;
    drag.t = now;
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------------------------------------------------------------- main loop
  const clock = new THREE.Clock();
  let time = 0;
  let nextPlayfulHop = 3;
  let nextAutoBounce = 2;

  function updateChar(c, t, dt) {
    const a = c.anim;
    const k = 1 - Math.exp(-dt * 3);
    const s = THREE.MathUtils.lerp(c.group.scale.x, a.scale, k);
    c.group.scale.setScalar(s);
    if (!a.script) {
      c.group.position.x += (a.target.x - c.group.position.x) * k;
      c.group.position.z += (a.target.z - c.group.position.z) * k;
      a.baseY = THREE.MathUtils.lerp(a.baseY || 0, a.target.y, k);
      c.group.position.y = a.baseY + a.jump * s;
    }
    const toCam = Math.atan2(camPos.x - c.group.position.x, camPos.z - c.group.position.z);
    c.group.rotation.y = (a.face != null ? a.face : toCam + Math.sin(t * 0.9 + (c === chars[1] ? 0 : 2)) * 0.18) + a.spin;
    c.group.rotation.z = a.wobble;
    c.head.rotation.z = Math.sin(t * 1.3) * 0.07 + a.wobble;
    const sway = Math.sin(t * 2.4 + (c === chars[1] ? 0 : 1)) * 0.12;
    const wave = a.target.y === 0 && c !== chars[game.level] ? Math.max(0, Math.sin(t * 0.7)) * (0.9 + 0.3 * Math.sin(t * 9)) : 0;
    c.arms.forEach((arm) => {
      const side = arm.userData.side;
      const up = Math.max(a.armsUp * 2.4, side > 0 ? wave * 2.2 : 0);
      arm.rotation.z = side * (0.15 + sway * side + up);
    });
    c.mouth.scale.y = 1 + a.armsUp * 1.5;
    if (c.bulb) c.bulb.position.y = 1.65 + Math.sin(t * 4) * 0.05;
    if (t > a.blinkAt) {
      const b = (t - a.blinkAt) / 0.15;
      c.eyes.scale.y = b < 1 ? Math.max(0.1, Math.abs(1 - 2 * b)) : 1;
      if (b >= 1) a.blinkAt = t + rand(2, 5);
    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    stepTimers(dt);
    stepTweens(dt);
    for (let i = 0; i < 3; i++) physics(dt / 3);
    syncBalls(dt);
    stepParticles(dt);
    updateChar(chars[1], time, dt);
    updateChar(chars[2], time, dt);
    bucket.position.lerp(bucketTarget, 1 - Math.exp(-dt * 3));
    balls.forEach((b) => { if (b.state === 'bucket') b.mesh.position.copy(bucket.position).add(b.slot); });

    // Glow for hints.
    const glow = 0.3 + 0.25 * Math.sin(time * 7);
    ballMats.forEach((m) => { m.emissiveIntensity = m.userData.hint ? glow : 0; });
    balls.forEach((b) => { if (b.ownMat) b.ownMat.emissiveIntensity = b.ownMat.userData.hint ? glow : 0; });

    tramp.bed.position.y = tramp.H - 0.02 - tramp.sag;
    tramp.pad.emissiveIntensity = tramp.hint ? glow : 0;
    if (hopper.home) {
      hopper.group.position.set(hopper.home.x, hopper.jump, hopper.home.z);
      hopper.ball.scale.set(0.75 * (1 + hopper.squash), 0.75 * (1 - hopper.squash), 0.75 * (1 + hopper.squash));
      hopper.group.rotation.y = Math.atan2(camPos.x - hopper.home.x, camPos.z - hopper.home.z) + Math.sin(time * 1.5) * 0.2;
    }
    // The friend on the trampoline keeps bouncing by themselves.
    if (time > nextAutoBounce) {
      nextAutoBounce = time + rand(1.6, 3.2);
      if (!(game.round && game.round.type === 'bounce')) bounceTramp(Math.random() < 0.3);
    }

    // Gentle nudges when the child has stopped playing.
    const r = game.round;
    if (game.screen === 'play' && r && !r.locked) {
      game.idle += dt;
      if (game.idle > 10) {
        game.idle = 0;
        game.idleCount += 1;
        Voice.say(r.say);
        hop(chars[game.level], 0.6, 0, 0.5);
        if (game.idleCount >= 2) setHint(true);
      }
    }
    // Keep the pit lively: now and then a random ball does a little hop.
    if (time > nextPlayfulHop) {
      nextPlayfulHop = time + rand(1.5, 3.5);
      const live = pitBalls().filter((b) => !b.big && b.p.y < b.r + 0.1);
      if (live.length) pick(live).v.y += rand(3, 5);
    }

    Music.tick();

    const k = 1 - Math.exp(-dt * 3);
    camPos.lerp(camPosTarget, k);
    camLook.lerp(camLookTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  layout(true);
  game.maxBalls = isPortrait() ? 20 : 26;
  fillPit(game.maxBalls);
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable */ });
    });
  }

  // Exposed for automated smoke tests only.
  window.__ballParty = { game, balls: () => balls, camera, startLevel, trampPos: () => [tramp.pos.x, tramp.H, tramp.pos.z] };
})();
