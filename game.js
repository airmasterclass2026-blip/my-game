/* Tiny Explorers 3D — a gentle learning game for toddlers.
 * Three activities: Colors (pop balloons), Shapes (find shapes), Count (count apples).
 * No fail states, lots of praise, spoken prompts, works offline. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const V3 = THREE.Vector3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const ease = {
    outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
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

  // ---------------------------------------------------------------- content
  const COLORS = [
    { name: 'red', hex: 0xff3b3b, css: '#ff3b3b' },
    { name: 'blue', hex: 0x2f74ff, css: '#2f74ff' },
    { name: 'yellow', hex: 0xffd21f, css: '#ffd21f' },
    { name: 'green', hex: 0x2ecc40, css: '#2ecc40' },
    { name: 'orange', hex: 0xff8c1a, css: '#ff8c1a' },
    { name: 'purple', hex: 0x9b4dff, css: '#9b4dff' },
    { name: 'pink', hex: 0xff7ac0, css: '#ff7ac0' },
  ];

  function starPoints(outer, inner, n) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = Math.PI / 2 + (i * Math.PI) / n;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  const STAR = starPoints(1.1, 0.48, 5);

  // 2D outlines (y up) extruded into chunky 3D "cookie" shapes.
  const SHAPES = [
    {
      name: 'circle',
      svg: '<circle r="0.95"/>',
      shape() { const s = new THREE.Shape(); s.absarc(0, 0, 0.95, 0, Math.PI * 2, false); return s; },
    },
    {
      name: 'square',
      svg: '<rect x="-0.85" y="-0.85" width="1.7" height="1.7" rx="0.08"/>',
      shape() {
        const s = new THREE.Shape();
        s.moveTo(-0.85, -0.85); s.lineTo(0.85, -0.85); s.lineTo(0.85, 0.85); s.lineTo(-0.85, 0.85); s.closePath();
        return s;
      },
    },
    {
      name: 'triangle',
      svg: '<polygon points="0,-1.05 1.05,0.8 -1.05,0.8"/>',
      shape() {
        const s = new THREE.Shape();
        s.moveTo(0, 1.05); s.lineTo(-1.05, -0.8); s.lineTo(1.05, -0.8); s.closePath();
        return s;
      },
    },
    {
      name: 'star',
      svg: '<polygon points="' + STAR.map((p) => p[0].toFixed(3) + ',' + (-p[1]).toFixed(3)).join(' ') + '"/>',
      shape() {
        const s = new THREE.Shape();
        STAR.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
        s.closePath();
        return s;
      },
    },
    {
      name: 'heart',
      svg: '<path d="M0,0.95 C-0.2,0.7 -1.05,0.25 -1.05,-0.3 C-1.05,-0.9 -0.3,-1.05 0,-0.55 C0.3,-1.05 1.05,-0.9 1.05,-0.3 C1.05,0.25 0.2,0.7 0,0.95Z"/>',
      shape() {
        const s = new THREE.Shape();
        s.moveTo(0, -0.95);
        s.bezierCurveTo(-0.2, -0.7, -1.05, -0.25, -1.05, 0.3);
        s.bezierCurveTo(-1.05, 0.9, -0.3, 1.05, 0, 0.55);
        s.bezierCurveTo(0.3, 1.05, 1.05, 0.9, 1.05, 0.3);
        s.bezierCurveTo(1.05, -0.25, 0.2, -0.7, 0, -0.95);
        return s;
      },
    },
  ];

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const PRAISE = ['Great job!', 'You did it!', 'Wonderful!', 'Yay!', 'Super!', 'Well done!', 'Amazing!', 'Hooray!'];

  // ---------------------------------------------------------------- sound
  const Sound = {
    ctx: null,
    master: null,
    muted: store.get('muted', false),
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
      const t0 = this.ctx.currentTime + (when || 0);
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
    pop() { this.noise(0.15, 0.9, 1500); this.tone(700, 0.12, 'square', 0.12, 0, 150); },
    ding() { this.tone(880, 0.35, 'sine', 0.3); this.tone(1320, 0.5, 'sine', 0.22, 0.09); },
    boop() { this.tone(320, 0.25, 'triangle', 0.3, 0, 220); },
    plop(i) {
      const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
      const f = 392 * Math.pow(2, scale[Math.min(i, scale.length - 1)] / 12);
      this.tone(f, 0.3, 'triangle', 0.35, 0, f * 1.02);
      this.tone(f * 2, 0.15, 'sine', 0.1);
    },
    twinkle() {
      for (let i = 0; i < 3; i++) this.tone(rand(1200, 2200), 0.18, 'sine', 0.08, i * 0.05);
    },
    peep() { this.tone(1300, 0.09, 'sine', 0.22, 0, 1900); this.tone(1400, 0.11, 'sine', 0.22, 0.12, 2100); },
    whoosh() { this.noise(0.35, 0.35, 700); },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.28, i * 0.12));
      this.tone(1047, 0.9, 'triangle', 0.25, 0.5);
      this.tone(1319, 0.9, 'sine', 0.18, 0.5);
      this.tone(1568, 0.9, 'sine', 0.12, 0.5);
    },
  };

  // ---------------------------------------------------------------- voice
  const Voice = {
    voice: null,
    ok: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    init() {
      if (!this.ok) return;
      const choose = () => {
        const voices = speechSynthesis.getVoices();
        const en = voices.filter((v) => /^en/i.test(v.lang));
        this.voice =
          en.find((v) => /samantha|karen|moira|tessa|google us english|aria|jenny|zira|female/i.test(v.name)) ||
          en.find((v) => /en-US/i.test(v.lang) && v.localService) ||
          en.find((v) => v.localService) ||
          en[0] || null;
      };
      choose();
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', choose);
    },
    say(text, rate) {
      if (!this.ok || Sound.muted) return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = this.voice ? this.voice.lang : 'en-US';
        u.rate = rate || 0.88;
        u.pitch = 1.2;
        speechSynthesis.speak(u);
      } catch (e) { /* speech unavailable */ }
    },
    stop() { if (this.ok) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------- three.js setup
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const SKY = 0xa6e1ff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 35, 80);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const camPos = new V3(0, 4, 14);
  const camLook = new V3(0, 2, 0);
  const camPosTarget = camPos.clone();
  const camLookTarget = camLook.clone();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fd16a, 2.4));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.position.set(6, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const matCache = {};
  function mat(hex, opts) {
    const key = hex + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.6, metalness: 0 }, opts));
    return matCache[key];
  }
  function mesh(geo, material, shadow) {
    const m = new THREE.Mesh(geo, material);
    if (shadow !== false) m.castShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- world decor
  const world = new THREE.Group();
  scene.add(world);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64), mat(0x86d65f, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  [[-16, -26, 11, 0x74c74f], [4, -32, 15, 0x67bd45], [24, -24, 10, 0x7acc55], [-34, -20, 12, 0x6ec24c]].forEach(([x, z, r, c]) => {
    const hill = mesh(new THREE.SphereGeometry(r, 32, 16), mat(c, { roughness: 1 }), false);
    hill.position.set(x, -r * 0.55, z);
    world.add(hill);
  });

  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16), new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false }));
  sunBall.position.set(-16, 17, -40);
  world.add(sunBall);

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 1.6, 10);
  const leafGeo = new THREE.SphereGeometry(1, 16, 12);
  function makeTree(scale, leafColor) {
    const t = new THREE.Group();
    const trunk = mesh(trunkGeo, mat(0x9b6a3c));
    trunk.position.y = 0.8;
    t.add(trunk);
    [[0, 2.1, 0, 1.1], [-0.6, 1.7, 0.1, 0.75], [0.6, 1.75, -0.1, 0.8], [0, 2.8, 0, 0.7]].forEach(([x, y, z, s]) => {
      const leaf = mesh(leafGeo, mat(leafColor));
      leaf.position.set(x, y, z);
      leaf.scale.setScalar(s);
      t.add(leaf);
    });
    t.scale.setScalar(scale);
    return t;
  }
  [[-10, -7, 1.3], [-14, -12, 1.6], [9, -8, 1.4], [13, -13, 1.7], [-6, -14, 1.2], [4, -16, 1.5], [17, -6, 1.2], [-18, -5, 1.4], [0, -20, 1.6]].forEach(([x, z, s], i) => {
    const tree = makeTree(s, [0x3fae4a, 0x4cbb55, 0x36a043][i % 3]);
    tree.position.set(x, 0, z);
    tree.rotation.y = rand(0, Math.PI);
    world.add(tree);
  });

  const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
  const petalGeo = new THREE.SphereGeometry(0.16, 10, 8);
  for (let i = 0; i < 46; i++) {
    const x = rand(-16, 16), z = rand(-10, 6);
    if (Math.abs(x) < 4.5 && z > -4) continue; // keep the play area clear
    const f = new THREE.Group();
    const stem = mesh(stemGeo, mat(0x2f9e44), false);
    stem.position.y = 0.25;
    const head = mesh(petalGeo, mat(pick(COLORS).hex, { roughness: 0.5 }), false);
    head.position.y = 0.52;
    head.scale.set(1, 0.6, 1);
    const mid = mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0xfff3a0), false);
    mid.position.y = 0.6;
    f.add(stem, head, mid);
    f.position.set(x, 0, z);
    world.add(f);
  }

  const clouds = [];
  const cloudGeo = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 6; i++) {
    const c = new THREE.Group();
    const n = randInt(3, 5);
    for (let j = 0; j < n; j++) {
      const puff = mesh(cloudGeo, mat(0xffffff, { roughness: 1 }), false);
      puff.position.set(j * 1.1 - n * 0.55, rand(-0.2, 0.4), rand(-0.3, 0.3));
      puff.scale.setScalar(rand(0.9, 1.5));
      c.add(puff);
    }
    c.position.set(rand(-35, 35), rand(10, 15), rand(-34, -22));
    c.scale.y = 0.7;
    c.userData.speed = rand(0.3, 0.7);
    clouds.push(c);
    world.add(c);
  }

  // ---------------------------------------------------------------- counting scenery
  const countScene = new THREE.Group();
  countScene.visible = false;
  scene.add(countScene);

  const TREE_C = new V3(-1.5, 3.7, 0);
  const TREE_R = 1.95;
  {
    const trunk = mesh(new THREE.CylinderGeometry(0.38, 0.55, 2.6, 14), mat(0x9b6a3c));
    trunk.position.set(TREE_C.x, 1.3, -0.2);
    countScene.add(trunk);
    const crown = mesh(new THREE.SphereGeometry(TREE_R, 40, 28), mat(0x3fb34f));
    crown.position.copy(TREE_C);
    countScene.add(crown);
    [[-1.3, 0.9, -0.9, 1.2], [1.3, 0.8, -0.9, 1.2], [0, 1.6, -0.8, 1.1], [-1.6, -0.4, -1, 1], [1.6, -0.4, -1, 1]].forEach(([x, y, z, r]) => {
      const bump = mesh(leafGeo, mat(0x38a948));
      bump.position.set(TREE_C.x + x, TREE_C.y + y, TREE_C.z + z);
      bump.scale.setScalar(r);
      countScene.add(bump);
    });
  }
  const BASKET = new V3(2.4, 0, 1.2);
  {
    const brown = mat(0xc98a45, { side: THREE.DoubleSide, roughness: 0.9 });
    const body = mesh(new THREE.CylinderGeometry(1.05, 0.8, 1.0, 28, 1, true), brown);
    body.position.set(BASKET.x, 0.5, BASKET.z);
    const bottom = mesh(new THREE.CircleGeometry(0.8, 28), brown);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(BASKET.x, 0.03, BASKET.z);
    const rim = mesh(new THREE.TorusGeometry(1.05, 0.1, 10, 32), mat(0xa86c30));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(BASKET.x, 1.0, BASKET.z);
    const band = mesh(new THREE.TorusGeometry(0.93, 0.06, 8, 32), mat(0xa86c30));
    band.rotation.x = Math.PI / 2;
    band.position.set(BASKET.x, 0.5, BASKET.z);
    countScene.add(body, bottom, rim, band);
  }
  // Spots on the front of the tree crown, as offsets from its centre.
  const APPLE_SPOTS = [[-1.0, 0.7], [0, 1.15], [1.0, 0.7], [-1.3, -0.2], [-0.45, 0.15], [0.5, 0.2], [1.3, -0.15], [-0.8, -0.85], [0.2, -0.75], [1.0, -0.95]];

  // ---------------------------------------------------------------- mascot (a little chick)
  const chick = new THREE.Group();
  const chickParts = {};
  {
    const yellow = mat(0xffd84d, { roughness: 0.55 });
    const orange = mat(0xff9a1f);
    const black = mat(0x1d1d28, { roughness: 0.25 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pinkM = mat(0xff8fa8);

    const body = mesh(new THREE.SphereGeometry(0.78, 32, 24), yellow);
    body.position.y = 0.82;
    chick.add(body);

    const head = new THREE.Group();
    head.position.set(0, 1.55, 0.05);
    const headBall = mesh(new THREE.SphereGeometry(0.55, 32, 24), yellow);
    headBall.position.y = 0.22;
    head.add(headBall);
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.3, 0);
    [-1, 1].forEach((sx) => {
      const eye = mesh(new THREE.SphereGeometry(0.1, 16, 12), black, false);
      eye.position.set(sx * 0.2, 0, 0.47);
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), white);
      hl.position.set(sx * 0.2 + 0.03, 0.04, 0.56);
      eyes.add(eye, hl);
      const cheek = mesh(new THREE.SphereGeometry(0.09, 12, 8), pinkM, false);
      cheek.position.set(sx * 0.34, 0.12, 0.38);
      cheek.scale.set(1, 0.6, 0.5);
      head.add(cheek);
    });
    head.add(eyes);
    const beak = mesh(new THREE.ConeGeometry(0.12, 0.3, 16), orange);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.16, 0.6);
    head.add(beak);
    [-0.12, 0, 0.12].forEach((x, i) => {
      const tuft = mesh(new THREE.ConeGeometry(0.07, 0.3, 8), yellow);
      tuft.position.set(x, 0.82, 0);
      tuft.rotation.z = -x * 2.4;
      tuft.scale.y = i === 1 ? 1.2 : 0.9;
      head.add(tuft);
    });
    chick.add(head);

    const wings = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.7, 1.1, 0);
      const wing = mesh(new THREE.SphereGeometry(0.32, 16, 12), yellow);
      wing.scale.set(0.35, 0.85, 0.7);
      wing.position.set(sx * 0.06, -0.24, 0);
      pivot.add(wing);
      pivot.userData.side = sx;
      chick.add(pivot);
      return pivot;
    });
    [-1, 1].forEach((sx) => {
      const foot = mesh(new THREE.SphereGeometry(0.16, 12, 8), orange);
      foot.scale.set(1, 0.4, 1.4);
      foot.position.set(sx * 0.3, 0.06, 0.25);
      chick.add(foot);
    });
    Object.assign(chickParts, { body, head, eyes, wings });
  }
  scene.add(chick);
  const chickState = { jump: 0, spin: 0, flap: 0, tilt: 0, blinkAt: 2, pos: new V3(), scale: 1.4, look: 0 };

  // ---------------------------------------------------------------- tweens, timers, particles
  let tweens = [];
  function tween(dur, update, done, delay) {
    const tw = { t: -(delay || 0), dur, update, done };
    tweens.push(tw);
    return tw;
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
  function burst(pos, colors, count, opts) {
    const o = Object.assign({ speed: 6, life: 1.6, gravity: 9, geo: confettiGeo, up: 3 }, opts);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(o.geo, basicMat(pick(colors)));
      m.position.copy(pos);
      const dir = new V3(rand(-1, 1), rand(-0.5, 1), rand(-0.6, 1)).normalize();
      particles.push({
        m,
        v: dir.multiplyScalar(rand(0.4, 1) * o.speed).add(new V3(0, o.up, 0)),
        spin: new V3(rand(-8, 8), rand(-8, 8), rand(-8, 8)),
        life: rand(0.7, 1) * o.life,
        g: o.gravity,
      });
      scene.add(m);
    }
  }
  function confettiRain(count) {
    const colors = COLORS.map((c) => c.hex);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(confettiGeo, basicMat(pick(colors)));
      m.position.set(camLook.x + rand(-9, 9), camLook.y + rand(5, 11), rand(-2, 3));
      m.scale.setScalar(1.4);
      particles.push({ m, v: new V3(rand(-0.5, 0.5), rand(-2, 0), 0), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: rand(3, 4.5), g: 1.2 });
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
      if (p.life < 0.4) p.m.scale.setScalar(Math.max(0.01, p.life / 0.4) * (p.m.scale.x > 1 ? 1.4 : 1));
    }
  }

  // ---------------------------------------------------------------- items (things the child taps)
  const itemLayer = new THREE.Group();
  scene.add(itemLayer);
  let items = [];

  function addItem(obj, data) {
    const it = Object.assign({ obj, phase: rand(0, 6.28), scaleMul: 0, baseScale: 1, offsetY: 0, spin: 0, wiggle: 0, hint: false, gone: false, home: new V3() }, data);
    obj.userData.item = it;
    items.push(it);
    itemLayer.add(obj);
    return it;
  }
  function clearItems() {
    items.forEach((it) => {
      itemLayer.remove(it.obj);
      if (it.mat) it.mat.dispose();
    });
    items = [];
  }

  const balloonGeo = new THREE.SphereGeometry(0.85, 32, 24);
  const knotGeo = new THREE.ConeGeometry(0.13, 0.2, 12);
  const stringGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.7, 4);
  const shineGeo = new THREE.SphereGeometry(0.16, 12, 8);
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  function makeBalloon(color) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.25, metalness: 0.05, emissive: color.hex, emissiveIntensity: 0 });
    const body = mesh(balloonGeo, m);
    body.scale.set(1, 1.15, 1);
    const knot = mesh(knotGeo, m);
    knot.position.y = -1.02;
    const str = mesh(stringGeo, mat(0xffffff), false);
    str.position.y = -1.9;
    const shine = new THREE.Mesh(shineGeo, shineMat);
    shine.position.set(-0.32, 0.42, 0.62);
    shine.scale.set(0.8, 1.3, 0.5);
    g.add(body, knot, str, shine);
    return { obj: g, mat: m };
  }

  const shapeGeoCache = {};
  function makeShape(shapeDef, color) {
    if (!shapeGeoCache[shapeDef.name]) {
      const geo = new THREE.ExtrudeGeometry(shapeDef.shape(), {
        depth: 0.42, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 4, curveSegments: 32,
      });
      geo.center();
      shapeGeoCache[shapeDef.name] = geo;
    }
    const m = new THREE.MeshStandardMaterial({ color: color.hex, roughness: 0.35, emissive: color.hex, emissiveIntensity: 0 });
    const g = new THREE.Group();
    g.add(mesh(shapeGeoCache[shapeDef.name], m));
    return { obj: g, mat: m };
  }

  const appleGeo = new THREE.SphereGeometry(0.4, 24, 16);
  const appleStemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.22, 6);
  const appleLeafGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const hitGeo = new THREE.SphereGeometry(0.66, 10, 8);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  function makeApple() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xff2d2d, roughness: 0.3, emissive: 0xff2d2d, emissiveIntensity: 0 });
    const body = mesh(appleGeo, m);
    body.scale.set(1.05, 0.95, 1.05);
    const stem = mesh(appleStemGeo, mat(0x6b4423));
    stem.position.y = 0.42;
    const leaf = mesh(appleLeafGeo, mat(0x3fbf3f));
    leaf.position.set(0.12, 0.46, 0);
    leaf.scale.set(1, 0.35, 0.6);
    leaf.rotation.z = -0.5;
    const shine = new THREE.Mesh(shineGeo, shineMat);
    shine.position.set(-0.15, 0.15, 0.32);
    shine.scale.setScalar(0.5);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    g.add(body, stem, leaf, shine, hit);
    return { obj: g, mat: m };
  }

  // ---------------------------------------------------------------- layout & camera framing
  let aspect = 1;
  const isPortrait = () => aspect < 0.85;

  function choiceSlots(n, kind) {
    const baseY = kind === 'balloon' ? 2.7 : 2.3;
    if (!isPortrait()) {
      return Array.from({ length: n }, (_, i) => new V3((i - (n - 1) / 2) * 3.2, baseY + (i % 2 ? 0.3 : 0), 0));
    }
    const rows = Math.ceil(n / 2);
    return Array.from({ length: n }, (_, i) => {
      const r = Math.floor(i / 2);
      const single = r === rows - 1 && n % 2 === 1;
      const x = single ? 0 : (i % 2 ? 1.55 : -1.55);
      return new V3(x, baseY + 0.4 + (rows - 1 - r) * 2.9, 0);
    });
  }

  function relayout() {
    const choice = items.filter((it) => it.kind === 'balloon' || it.kind === 'shape');
    if (!choice.length) return;
    const slots = choiceSlots(choice.length, choice[0].kind);
    choice.forEach((it, i) => it.home.copy(slots[i]));
  }

  // Box in world units that the camera should keep in view, plus where the chick stands.
  function framing() {
    const p = isPortrait();
    if (state.mode === null) {
      return { cx: 0, halfW: 2.4, yMin: p ? -4.2 : -3.2, yMax: p ? 4.4 : 5.2, chick: new V3(0, 0, 0), chickScale: 1.5 };
    }
    if (state.mode === 'count') {
      return p
        ? { cx: 0.2, halfW: 3.9, yMin: -1.6, yMax: 7.2, chick: new V3(-2.2, 0, 2.6), chickScale: 0.6 }
        : { cx: -0.6, halfW: 6.4, yMin: -1.2, yMax: 6.6, chick: new V3(-5.8, 0, 1.2), chickScale: 1 };
    }
    const n = (state.round && state.round.n) || 3;
    if (p) {
      const rows = Math.ceil(n / 2);
      return { cx: 0, halfW: 2.6, yMin: -0.4, yMax: 2.7 + (rows - 1) * 2.9 + 2.4, chick: new V3(0, 0, 2.6), chickScale: 0.75 };
    }
    const half = ((n - 1) * 3.2) / 2 + 1.2;
    return { cx: -0.9, halfW: half + 2.1, yMin: -0.4, yMax: 5.4, chick: new V3(-(half + 1.4), 0, 1.2), chickScale: 1 };
  }

  function updateFraming(snap) {
    const f = framing();
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH = (f.yMax - f.yMin) / 2 + 0.6;
    const d = Math.max(9, f.halfW / (tanH * aspect), halfH / tanH);
    const cy = (f.yMin + f.yMax) / 2;
    camLookTarget.set(f.cx, cy, 0);
    camPosTarget.set(f.cx, cy + 1.2, d);
    chickState.pos.copy(f.chick);
    chickState.scale = f.chickScale;
    if (snap) {
      camPos.copy(camPosTarget);
      camLook.copy(camLookTarget);
      chick.position.copy(f.chick);
      chick.scale.setScalar(f.chickScale);
    }
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    relayout();
    updateFraming(false);
  }
  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------- game state
  const state = {
    mode: null,
    round: null,
    stars: store.get('stars', 0),
    progress: Object.assign({ colors: 0, shapes: 0, count: 0 }, store.get('progress', {})),
    last: {},
    idle: 0,
    idleCount: 0,
  };

  const ui = {
    start: $('start'), menu: $('menu'), hud: $('hud'), prompt: $('prompt'), promptIcon: $('promptIcon'),
    promptText: $('promptText'), counter: $('counter'), stars: $('stars'), starCount: $('starCount'),
    party: $('party'), soundBtn: $('soundBtn'),
  };
  ui.starCount.textContent = state.stars;

  function balloonSvg(css) {
    return '<svg viewBox="0 0 60 84"><path d="M30 64 Q36 72 28 82" stroke="#8a94a6" stroke-width="2.5" fill="none"/>' +
      '<ellipse cx="30" cy="31" rx="23" ry="28" fill="' + css + '"/><polygon points="25,63 35,63 30,56" fill="' + css + '"/>' +
      '<ellipse cx="21" cy="21" rx="5" ry="9" fill="#fff" opacity=".5"/></svg>';
  }
  function shapeSvg(def) {
    return '<svg viewBox="-1.25 -1.25 2.5 2.5"><g fill="#5b6478">' + def.svg + '</g></svg>';
  }

  function showPrompt(iconHtml, text) {
    ui.promptIcon.innerHTML = iconHtml;
    ui.promptText.textContent = text;
    ui.prompt.classList.remove('show');
    void ui.prompt.offsetWidth;
    ui.prompt.classList.add('show');
  }

  function sayPrompt() {
    const r = state.round;
    if (!r) return;
    Voice.say(r.say);
  }

  function setCounter(n, total, done) {
    ui.counter.classList.remove('hidden', 'pop', 'done');
    ui.counter.innerHTML = '<span class="num">' + n + '</span><span class="dots">' + '\u{1F34E}'.repeat(n) + '</span>';
    void ui.counter.offsetWidth;
    ui.counter.classList.add(done ? 'done' : 'pop');
  }

  function screenPos(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  }

  function awardStar(fromWorld) {
    state.stars += 1;
    store.set('stars', state.stars);
    store.set('progress', state.progress);

    const from = screenPos(fromWorld);
    const to = ui.stars.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'fly-star';
    el.textContent = '⭐';
    el.style.left = from.x + 'px';
    el.style.top = from.y + 'px';
    document.body.appendChild(el);
    const dx = to.left + 28 - from.x, dy = to.top + 32 - from.y;
    const done = () => {
      el.remove();
      ui.starCount.textContent = state.stars;
      ui.stars.classList.remove('bump');
      void ui.stars.offsetWidth;
      ui.stars.classList.add('bump');
      Sound.twinkle();
    };
    if (el.animate) {
      el.animate([
        { transform: 'translate(0,0) scale(0.3) rotate(0deg)' },
        { transform: 'translate(0,-40px) scale(1.6) rotate(90deg)', offset: 0.3 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.6) rotate(360deg)' },
      ], { duration: 1100, easing: 'ease-in-out' }).onfinish = done;
    } else {
      done();
    }
    return state.stars % 5 === 0;
  }

  function party() {
    ui.party.innerHTML = '\u{1F389}<b>' + state.stars + ' ⭐</b>';
    ui.party.classList.remove('hidden', 'show');
    void ui.party.offsetWidth;
    ui.party.classList.add('show');
    Sound.fanfare();
    confettiRain(160);
    Voice.say('Hooray! You have ' + state.stars + ' stars!');
    chickDance();
    later(2.7, () => ui.party.classList.add('hidden'));
  }

  // ---------------------------------------------------------------- chick behaviour
  function chickHop(height, spins, dur) {
    tween(dur || 0.8, (k) => {
      chickState.jump = Math.sin(Math.PI * k) * (height || 1);
      chickState.spin = ease.inOutSine(k) * Math.PI * 2 * (spins || 0);
      chickState.flap = Math.sin(Math.PI * k);
    }, () => { chickState.jump = 0; chickState.spin = 0; chickState.flap = 0; });
  }
  function chickHappy() { chickHop(1.1, 1, 0.9); }
  function chickDance() { chickHop(0.7, 0, 0.45); later(0.5, () => chickHop(0.7, 0, 0.45)); later(1.0, () => chickHop(1.2, 1, 0.9)); }
  function chickCurious() {
    tween(0.9, (k) => { chickState.tilt = Math.sin(Math.PI * k) * 0.35; }, () => { chickState.tilt = 0; });
  }
  function tapChick() {
    Sound.peep();
    chickHop(0.8, 0, 0.55);
  }

  // ---------------------------------------------------------------- rounds: colors & shapes
  function choiceCount(level) { return level < 3 ? 2 : level < 8 ? 3 : 4; }

  function startChoiceRound() {
    const mode = state.mode;
    const level = state.progress[mode];
    const all = mode === 'colors' ? COLORS : SHAPES;
    const pool = level < 5 ? all.slice(0, mode === 'colors' ? 4 : 3) : all;
    const n = Math.min(choiceCount(level), pool.length);
    const options = shuffle(pool).slice(0, n);
    let target = pick(options);
    if (target.name === state.last[mode]) target = options.find((o) => o !== target);
    state.last[mode] = target.name;

    clearItems();
    const kind = mode === 'colors' ? 'balloon' : 'shape';
    const slots = choiceSlots(n, kind);
    const tints = shuffle(COLORS);
    options.forEach((opt, i) => {
      const built = kind === 'balloon' ? makeBalloon(opt) : makeShape(opt, tints[i]);
      const it = addItem(built.obj, { kind, value: opt.name, mat: built.mat });
      it.home.copy(slots[i]);
      if (kind === 'balloon') it.home.y -= 4; // float up from below
      const startY = it.home.y;
      tween(0.7, (k) => {
        it.scaleMul = ease.outBack(k);
        if (kind === 'balloon') it.home.y = startY + 4 * ease.outCubic(k);
      }, null, i * 0.15);
    });
    if (kind === 'balloon') Sound.whoosh();

    if (mode === 'colors') {
      state.round = { n, target, wrong: 0, locked: false, say: 'Pop the ' + target.name + ' balloon!' };
      showPrompt(balloonSvg(target.css), cap(target.name) + '!');
    } else {
      state.round = { n, target, wrong: 0, locked: false, say: 'Find the ' + target.name + '!' };
      showPrompt(shapeSvg(target), cap(target.name) + '!');
    }
    updateFraming(false);
    sayPrompt();
  }

  function tapChoice(it) {
    const r = state.round;
    if (!r || r.locked || it.gone) return;
    if (it.value === r.target.name) {
      r.locked = true;
      state.progress[state.mode] += 1;
      Sound.ding();
      chickHappy();
      Voice.say(cap(r.target.name) + '! ' + pick(PRAISE));
      const pos = it.obj.position.clone();
      if (it.kind === 'balloon') {
        tween(0.14, (k) => { it.scaleMul = 1 + 0.35 * k; }, () => {
          it.gone = true;
          it.obj.visible = false;
          Sound.pop();
          burst(pos, [COLORS.find((c) => c.name === it.value).hex, 0xffffff, 0xffe066], 60);
        });
      } else {
        it.hint = false;
        tween(1.0, (k) => {
          it.offsetY = Math.sin(Math.PI * k) * 1.4;
          it.spin = ease.inOutSine(k) * Math.PI * 2;
        }, () => burst(pos, COLORS.map((c) => c.hex), 50, { speed: 5 }));
      }
      items.forEach((o) => {
        if (o === it) return;
        o.gone = true;
        tween(0.45, (k) => { o.scaleMul = 1 - ease.inCubic(k); }, () => { o.obj.visible = false; }, 0.25);
      });
      const big = awardStar(pos);
      if (big) later(1.6, party);
      later(big ? 5.2 : 2.6, startChoiceRound);
    } else {
      r.wrong += 1;
      Sound.boop();
      chickCurious();
      tween(0.6, (k) => { it.wiggle = Math.sin(k * Math.PI * 6) * (1 - k) * 0.35; }, () => { it.wiggle = 0; });
      const name = it.value;
      if (state.mode === 'colors') Voice.say("That's " + name + '. Can you find ' + r.target.name + '?');
      else Voice.say("That's a " + name + '. Can you find the ' + r.target.name + '?');
      if (r.wrong >= 2) showHint();
    }
  }

  function showHint() {
    const r = state.round;
    if (!r) return;
    if (state.mode === 'count') {
      const left = items.filter((it) => !it.picked);
      if (left.length) {
        const it = pick(left);
        it.hint = true;
        later(2.5, () => { it.hint = false; });
      }
    } else {
      items.forEach((it) => { if (it.value === r.target.name) it.hint = true; });
    }
  }

  // ---------------------------------------------------------------- rounds: counting
  function startCountRound() {
    const level = state.progress.count;
    const [lo, hi] = level < 3 ? [1, 3] : level < 8 ? [2, 5] : [3, 6];
    let n = randInt(lo, hi);
    if (n === state.last.count) n = n < hi ? n + 1 : lo;
    state.last.count = n;

    clearItems();
    const spots = shuffle(APPLE_SPOTS).slice(0, n);
    spots.forEach(([dx, dy], i) => {
      const built = makeApple();
      const it = addItem(built.obj, { kind: 'apple', mat: built.mat, picked: false });
      const z = Math.sqrt(Math.max(0, TREE_R * TREE_R - dx * dx - dy * dy)) + 0.15;
      it.home.set(TREE_C.x + dx, TREE_C.y + dy, TREE_C.z + z);
      it.obj.position.copy(it.home);
      tween(0.55, (k) => { it.scaleMul = ease.outBack(k); }, null, 0.2 + i * 0.12);
    });

    const word = n === 1 ? 'apple' : 'apples';
    state.round = {
      n, counted: 0, locked: false,
      say: n === 1 ? 'Tap the apple!' : "Let's count the apples! Tap each one.",
    };
    showPrompt('\u{1F34E}', n === 1 ? 'Tap the ' + word + '!' : 'Count the ' + word + '!');
    ui.counter.classList.add('hidden');
    sayPrompt();
  }

  function tapApple(it) {
    const r = state.round;
    if (!r || r.locked || it.picked) return;
    it.picked = true;
    it.hint = false;
    r.counted += 1;
    const count = r.counted;
    Sound.plop(count);
    Voice.say(cap(NUMBER_WORDS[count]) + '!', 0.95);
    setCounter(count, r.n, false);

    const from = it.obj.position.clone();
    const to = new V3(BASKET.x + rand(-0.4, 0.4), 0.75 + Math.min(count, 6) * 0.06, BASKET.z + rand(-0.3, 0.3));
    it.flying = true;
    tween(0.75, (k) => {
      it.obj.position.lerpVectors(from, to, ease.inOutSine(k));
      it.obj.position.y += Math.sin(Math.PI * k) * 1.6;
      it.obj.rotation.z = k * Math.PI * 2;
      it.scaleMul = 1 - 0.15 * k;
    }, () => {
      it.flying = false;
      burst(to.clone().add(new V3(0, 0.4, 0)), [0xffe066, 0xffffff], 10, { speed: 3, geo: sparkGeo, life: 0.8 });
    });

    if (count === r.n) {
      r.locked = true;
      state.progress.count += 1;
      later(1.1, () => {
        const word = r.n === 1 ? 'apple' : 'apples';
        Voice.say(cap(NUMBER_WORDS[r.n]) + ' ' + word + '! ' + pick(PRAISE));
        setCounter(r.n, r.n, true);
        Sound.ding();
        chickHappy();
        burst(BASKET.clone().add(new V3(0, 1.4, 0)), COLORS.map((c) => c.hex), 50);
        const big = awardStar(BASKET.clone().add(new V3(0, 1.4, 0)));
        if (big) later(1.8, party);
        later(big ? 5.4 : 3.0, startCountRound);
      });
    }
  }

  // ---------------------------------------------------------------- navigation
  function startRound() {
    state.idle = 0;
    state.idleCount = 0;
    if (state.mode === 'count') startCountRound();
    else startChoiceRound();
  }

  function enterMode(mode) {
    timers = [];
    clearItems();
    state.mode = mode;
    state.round = null;
    ui.menu.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    ui.counter.classList.add('hidden');
    ui.party.classList.add('hidden');
    ui.promptText.textContent = '';
    ui.promptIcon.innerHTML = '';
    countScene.visible = mode === 'count';
    updateFraming(false);
    later(0.5, startRound);
  }

  function goHome() {
    timers = [];
    tweens = [];
    clearItems();
    state.mode = null;
    state.round = null;
    countScene.visible = false;
    ui.hud.classList.add('hidden');
    ui.party.classList.add('hidden');
    ui.menu.classList.remove('hidden');
    chickState.jump = chickState.spin = chickState.flap = chickState.tilt = 0;
    updateFraming(false);
    Voice.say('Pick a game!');
    chickHop(0.6, 0, 0.5);
  }

  // ---------------------------------------------------------------- input
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tapPlane = new THREE.Plane(new V3(0, 0, 1), 0);

  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (!ui.start.classList.contains('hidden')) return;
    state.idle = 0;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = items.filter((it) => !it.gone && !it.picked).map((it) => it.obj);
    targets.push(chick);
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.item && o !== chick) o = o.parent;
      if (o === chick) return tapChick();
      if (o) {
        const it = o.userData.item;
        if (it.kind === 'apple') tapApple(it);
        else tapChoice(it);
        return;
      }
    }
    // Tapping empty space still does something fun.
    const p = new V3();
    if (raycaster.ray.intersectPlane(tapPlane, p) && p.y > 0) {
      burst(p, [0xffe066, 0xffffff, 0x9be7ff], 8, { speed: 3, geo: sparkGeo, life: 0.7, up: 1.5, gravity: 3 });
      Sound.twinkle();
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  $('playBtn').addEventListener('click', () => {
    Sound.unlock();
    Voice.init();
    ui.start.classList.add('hidden');
    ui.menu.classList.remove('hidden');
    Sound.fanfare();
    chickHappy();
    Voice.say("Hi friend! Let's play! Pick a game.");
  });

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.unlock();
      Sound.ding();
      enterMode(btn.dataset.mode);
    });
  });

  $('homeBtn').addEventListener('click', () => { Sound.boop(); goHome(); });
  ui.prompt.addEventListener('click', () => { state.idle = 0; sayPrompt(); });

  function renderSoundBtn() { ui.soundBtn.textContent = Sound.muted ? '\u{1F507}' : '\u{1F50A}'; }
  ui.soundBtn.addEventListener('click', () => {
    Sound.unlock();
    Sound.muted = !Sound.muted;
    store.set('muted', Sound.muted);
    if (Sound.muted) Voice.stop();
    else Sound.ding();
    renderSoundBtn();
  });
  renderSoundBtn();

  document.addEventListener('visibilitychange', () => { if (document.hidden) Voice.stop(); });

  // ---------------------------------------------------------------- main loop
  const clock = new THREE.Clock();
  let time = 0;

  function updateItems(t) {
    for (const it of items) {
      const o = it.obj;
      if (it.kind === 'balloon') {
        o.position.set(it.home.x, it.home.y + Math.sin(t * 1.6 + it.phase) * 0.18 + it.offsetY, it.home.z);
        o.rotation.z = Math.sin(t * 1.1 + it.phase) * 0.08 + it.wiggle;
      } else if (it.kind === 'shape') {
        o.position.set(it.home.x, it.home.y + Math.sin(t * 1.3 + it.phase) * 0.12 + it.offsetY, it.home.z);
        o.rotation.set(-0.12, Math.sin(t * 0.7 + it.phase) * 0.45 + it.spin, it.wiggle);
      } else if (it.kind === 'apple' && !it.picked && !it.flying) {
        o.position.copy(it.home);
        o.rotation.z = Math.sin(t * 2 + it.phase) * 0.12;
      }
      let s = it.baseScale * it.scaleMul;
      if (it.hint) s *= 1 + 0.14 * Math.sin(t * 7);
      o.scale.setScalar(Math.max(0.0001, s));
      if (it.mat) it.mat.emissiveIntensity = it.hint ? 0.3 + 0.25 * Math.sin(t * 7) : 0;
    }
  }

  function updateChick(t, dt) {
    const s = chickState;
    chick.position.lerp(s.pos, 1 - Math.exp(-dt * 4));
    const sc = THREE.MathUtils.lerp(chick.scale.x, s.scale, 1 - Math.exp(-dt * 4));
    chick.scale.setScalar(sc);
    chick.position.y = s.pos.y + s.jump * sc;
    // Face the camera, with a gentle sway and any spin from hops.
    const toCam = Math.atan2(camPos.x - chick.position.x, camPos.z - chick.position.z);
    chick.rotation.y = toCam + Math.sin(t * 0.8) * 0.15 + s.spin;
    chickParts.body.scale.set(1 + Math.sin(t * 3) * 0.02, 0.95 - Math.sin(t * 3) * 0.02, 1);
    chickParts.head.rotation.z = Math.sin(t * 1.2) * 0.08 + s.tilt;
    chickParts.head.rotation.x = Math.sin(t * 0.9) * 0.05;
    const flap = state.mode === null && !s.flap ? Math.max(0, Math.sin(t * 2.2)) * 0.5 : s.flap * (0.6 + 0.6 * Math.sin(t * 30));
    chickParts.wings.forEach((w) => { w.rotation.z = w.userData.side * (0.1 + flap); });
    // Blink.
    if (t > s.blinkAt) {
      const k = (t - s.blinkAt) / 0.15;
      chickParts.eyes.scale.y = k < 1 ? Math.max(0.1, Math.abs(1 - 2 * k)) : 1;
      if (k >= 1) s.blinkAt = t + rand(2, 5);
    }
  }

  function updateIdle(dt) {
    const r = state.round;
    if (!r || r.locked) return;
    state.idle += dt;
    if (state.idle > 9) {
      state.idle = 0;
      state.idleCount += 1;
      sayPrompt();
      if (state.idleCount >= 2) showHint();
    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    stepTimers(dt);
    stepTweens(dt);
    stepParticles(dt);
    updateItems(time);
    updateChick(time, dt);
    updateIdle(dt);

    clouds.forEach((c) => {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 40) c.position.x = -40;
    });

    const k = 1 - Math.exp(-dt * 3);
    camPos.lerp(camPosTarget, k);
    camLook.lerp(camLookTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  updateFraming(true);
  requestAnimationFrame(frame);

  // ---------------------------------------------------------------- offline support
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable */ });
    });
  }

  // Exposed for automated smoke tests only.
  window.__tinyExplorers = { state, items: () => items, enterMode, goHome, camera };
})();
