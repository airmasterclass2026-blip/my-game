/* Pip's Good Habits — a gentle 3D good-habits game for toddlers.
 * Level 1 "Good Morning": wake up, make the bed, wash face, brush teeth, get dressed.
 * Level 2 "Healthy & Tidy": choose healthy food, put toys away, pack the school bag.
 * Level 3 "Helping Hands": carry a bag, share food, feed the chickens, give back a dropped hat.
 * Every step is spoken, shown with a pointing finger, and praised. There is no way to fail. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const $ = (id) => document.getElementById(id);
  const V3 = THREE.Vector3;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
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
  const NUMBER_WORDS = ['zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
  const PRAISE = ['Great job!', 'Well done!', 'Wonderful!', 'Yay!', 'Super!', 'Amazing!'];
  const CONFETTI = [0xff3b3b, 0x2f74ff, 0xffd21f, 0x2ecc40, 0xff8c1a, 0x9b4dff];

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
    noise(dur, vol, freq, type) {
      if (!this.ctx || this.muted) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
    },
    ring() { for (let i = 0; i < 4; i++) this.tone(i % 2 ? 1500 : 1700, 0.06, 'square', 0.06, i * 0.07); },
    ding() { this.tone(880, 0.35, 'sine', 0.3); this.tone(1320, 0.5, 'sine', 0.22, 0.09); },
    pop() { this.tone(500, 0.12, 'sine', 0.3, 0, 900); },
    whoosh() { this.noise(0.35, 0.35, 900); },
    splash() { this.noise(0.4, 0.5, 2500, 'highpass'); this.tone(600, 0.15, 'sine', 0.12, 0, 300); },
    brush() { this.noise(0.25, 0.35, 3500); },
    yum() { this.tone(520, 0.15, 'triangle', 0.3); this.tone(780, 0.25, 'triangle', 0.3, 0.14); },
    boop() { this.tone(320, 0.25, 'triangle', 0.3, 0, 220); },
    cluck() { this.tone(700, 0.08, 'square', 0.12, 0, 500); this.tone(800, 0.1, 'square', 0.12, 0.12, 550); },
    sparkle() { for (let i = 0; i < 5; i++) this.tone(1400 + i * 220, 0.18, 'sine', 0.08, i * 0.06); },
    plop(i) {
      const scale = [0, 2, 4, 5, 7, 9, 11, 12];
      const f = 392 * Math.pow(2, scale[Math.min(i, scale.length - 1)] / 12);
      this.tone(f, 0.3, 'triangle', 0.35, 0, f * 1.02);
    },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.28, i * 0.12));
      this.tone(1047, 0.9, 'triangle', 0.25, 0.5);
      this.tone(1319, 0.9, 'sine', 0.18, 0.5);
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
    // How long a line takes to say, so the game can wait for it.
    time(text, rate) { return 0.6 + text.split(/\s+/).length * 0.36 / (rate || 0.9); },
    say(text, opts) {
      const o = opts || {};
      this.lastAt = performance.now();
      if (!this.ok || Sound.muted) return;
      try {
        if (!o.queue) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.lang = this.voice ? this.voice.lang : 'en-US';
        u.rate = o.rate || 0.9;
        u.pitch = o.pitch || 1.2;
        speechSynthesis.speak(u);
      } catch (e) { /* speech unavailable */ }
    },
    quiet(ms) { return performance.now() - this.lastAt > ms; },
    stop() { if (this.ok) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } },
  };
  // Voices for the cast, so a child can hear who is talking.
  const VOICES = {
    narrator: { pitch: 1.2, rate: 0.9 },
    pip: { pitch: 1.7, rate: 1.0 },
    tia: { pitch: 1.9, rate: 1.0 },
    grandma: { pitch: 1.0, rate: 0.85 },
    grandpa: { pitch: 0.7, rate: 0.85 },
  };
  // Say several lines one after another, then call done.
  function talk(lines, done) {
    let t = 0;
    lines.forEach(([who, text], i) => {
      const v = VOICES[who];
      later(t, () => Voice.say(text, { pitch: v.pitch, rate: v.rate, queue: i > 0 }));
      t += Voice.time(text, v.rate);
    });
    if (done) later(t, done);
    return t;
  }

  // ---------------------------------------------------------------- renderer
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe3b3);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  const camPos = new V3(0, 4, 9), camLook = new V3(0, 1.2, 0);
  const camPosTarget = camPos.clone(), camLookTarget = camLook.clone();

  scene.add(new THREE.HemisphereLight(0xffffff, 0xffe2c4, 2.2));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.3);
  sun.position.set(4, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const matCache = {};
  function mat(hex, opts) {
    const key = hex + JSON.stringify(opts || {});
    if (!matCache[key]) matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.55, metalness: 0 }, opts));
    return matCache[key];
  }
  function mesh(geo, material, shadow) {
    const m = new THREE.Mesh(geo, material);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function blob(material, x, y, z, sx, sy, sz) {
    const m = mesh(sphereGeo, material);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    return m;
  }
  // Soft rounded boxes give everything a cosy toy-like look.
  const boxCache = {};
  function roundBox(w, h, d, r) {
    r = Math.min(r === undefined ? 0.08 : r, w / 2.2, h / 2.2, d / 2.2);
    const key = [w, h, d, r].join(',');
    if (!boxCache[key]) {
      const s = new THREE.Shape();
      const hw = w / 2 - r, hh = h / 2 - r;
      s.absarc(hw, hh, r, 0, Math.PI / 2);
      s.absarc(-hw, hh, r, Math.PI / 2, Math.PI);
      s.absarc(-hw, -hh, r, Math.PI, 1.5 * Math.PI);
      s.absarc(hw, -hh, r, 1.5 * Math.PI, 2 * Math.PI);
      const bev = Math.min(r, d / 2.5);
      const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelSegments: 3, curveSegments: 8 });
      geo.center();
      boxCache[key] = geo;
    }
    return boxCache[key];
  }
  function box(w, h, d, material, x, y, z, r) {
    const m = mesh(roundBox(w, h, d, r), material);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function cyl(rt, rb, h, material, x, y, z, seg) {
    const m = mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 24), material);
    m.position.set(x || 0, y || 0, z || 0);
    return m;
  }
  function canvasTexture(w, h, draw, rx, ry) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (rx) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
    }
    return tex;
  }
  function starPath(g, cx, cy, r) {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.fill();
  }
  function plane(w, h, material, x, y, z, rx, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.set(rx || 0, ry || 0, 0);
    m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- tweens, timers, particles
  let tweens = [];
  function tween(dur, update, done, delay) { tweens.push({ t: -(delay || 0), dur, update, done }); }
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
  const confettiGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const sparkGeo = new THREE.OctahedronGeometry(0.07);
  const dropGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const basicCache = {};
  function basicMat(hex, opacity) {
    const key = hex + ':' + (opacity || 1);
    if (!basicCache[key]) basicCache[key] = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: !!opacity, opacity: opacity || 1 });
    return basicCache[key];
  }
  function burst(pos, colors, count, opts) {
    const o = Object.assign({ speed: 4, life: 1.3, gravity: 7, geo: confettiGeo, up: 2, spread: 1, floor: -10, opacity: 0 }, opts);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(o.geo, basicMat(pick(colors), o.opacity));
      m.position.copy(pos);
      const dir = o.dir ? o.dir.clone().add(new V3(rand(-o.spread, o.spread), rand(-o.spread, o.spread), rand(-o.spread, o.spread)) .multiplyScalar(0.4)).normalize()
        : new V3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize();
      particles.push({ m, v: dir.multiplyScalar(rand(0.5, 1) * o.speed).add(new V3(0, o.dir ? 0 : o.up, 0)), spin: new V3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: rand(0.7, 1) * o.life, g: o.gravity, s: 1, floor: o.floor });
      scene.add(m);
    }
  }
  function confettiRain(count) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(confettiGeo, basicMat(pick(CONFETTI)));
      m.position.set(camLook.x + rand(-6, 6), camLook.y + rand(3, 7), camLook.z + rand(-1, 2));
      m.scale.setScalar(1.6);
      particles.push({ m, v: new V3(rand(-0.4, 0.4), rand(-1.5, 0), 0), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: rand(3, 4.5), g: 1, s: 1.6, floor: -10 });
      scene.add(m);
    }
  }
  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.v.multiplyScalar(1 - 1.0 * dt);
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < p.floor) { p.m.position.y = p.floor; p.v.set(0, 0, 0); p.spin.set(0, 0, 0); }
      p.m.rotation.x += p.spin.x * dt;
      p.m.rotation.y += p.spin.y * dt;
      p.m.rotation.z += p.spin.z * dt;
      if (p.life < 0.4) p.m.scale.setScalar(Math.max(0.01, p.life / 0.4) * p.s);
    }
  }

  // Floating "Z" letters while Pip sleeps.
  const zTex = canvasTexture(64, 64, (g) => {
    g.font = 'bold 54px sans-serif';
    g.fillStyle = '#6a7bff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('Z', 32, 34);
  });
  const zMat = new THREE.SpriteMaterial({ map: zTex, transparent: true });
  function floatZ(pos) {
    const s = new THREE.Sprite(zMat);
    s.position.copy(pos);
    s.scale.setScalar(0.35);
    scene.add(s);
    tween(2.2, (k) => {
      s.position.set(pos.x + Math.sin(k * 6) * 0.25, pos.y + k * 1.4, pos.z);
      s.scale.setScalar(0.3 + k * 0.4);
      s.material.opacity = 1 - k;
    }, () => scene.remove(s));
  }

  // ---------------------------------------------------------------- people (all original characters)
  function makePerson(o) {
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const skin = mat(o.skin || 0xffd2b0, { roughness: 0.7 });
    const shirtM = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.6 });
    const pantsM = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.6 });
    const hairM = mat(o.hair, { roughness: 0.8 });
    const dark = mat(0x26222e, { roughness: 0.3 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const legs = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.17, 0.52, 0);
      const leg = mesh(new THREE.CapsuleGeometry(0.12, 0.26, 4, 10), pantsM);
      leg.position.y = -0.24;
      pivot.add(leg, blob(mat(o.shoes || 0xff5a5a, { roughness: 0.4 }), 0, -0.47, 0.07, 0.15, 0.09, 0.22));
      inner.add(pivot);
      return pivot;
    });
    const body = mesh(new THREE.CapsuleGeometry(0.36, 0.34, 6, 18), shirtM);
    body.position.y = 0.93;
    inner.add(body);
    if (o.dress) {
      const skirt = mesh(new THREE.CylinderGeometry(0.34, 0.56, 0.55, 24), shirtM);
      skirt.position.y = 0.62;
      inner.add(skirt);
    }
    const hands = [];
    const arms = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.42, 1.14, 0);
      const arm = mesh(new THREE.CapsuleGeometry(0.1, 0.34, 4, 10), shirtM);
      arm.position.set(s * 0.04, -0.24, 0);
      const hand = blob(skin, s * 0.06, -0.5, 0, 0.11);
      const anchor = new THREE.Object3D();
      anchor.position.set(s * 0.06, -0.56, 0.1);
      pivot.add(arm, hand, anchor);
      pivot.userData.side = s;
      hands.push(anchor);
      inner.add(pivot);
      return pivot;
    });

    const head = new THREE.Group();
    head.position.set(0, 1.62, 0);
    head.add(blob(skin, 0, 0, 0, 0.44));
    head.add(blob(skin, -0.43, 0, 0, 0.09), blob(skin, 0.43, 0, 0, 0.09));
    const eyes = new THREE.Group();
    [-1, 1].forEach((s) => {
      eyes.add(blob(dark, s * 0.15, 0.04, 0.39, 0.065, 0.085, 0.04));
      const hl = new THREE.Mesh(sphereGeo, white);
      hl.position.set(s * 0.15 + 0.022, 0.07, 0.425);
      hl.scale.setScalar(0.02);
      eyes.add(hl);
      head.add(blob(mat(0xff9fb0), s * 0.27, -0.09, 0.33, 0.075, 0.05, 0.03));
    });
    head.add(eyes);
    const mouth = mesh(new THREE.TorusGeometry(0.085, 0.022, 8, 20, Math.PI), mat(0xb83a4b), false);
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.13, 0.41);
    head.add(mouth);
    const mouthOpen = blob(mat(0x8a2234), 0, -0.16, 0.4, 0.1, 0.075, 0.04);
    mouthOpen.visible = false;
    head.add(mouthOpen);
    const teeth = box(0.13, 0.04, 0.03, mat(0xffffff, { roughness: 0.2 }), 0, -0.13, 0.425, 0.01);
    teeth.visible = false;
    head.add(teeth);

    // Hair
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.465, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM);
    cap.rotation.x = -0.35;
    cap.castShadow = true;
    head.add(cap);
    if (o.style === 'pip') {
      const tuft = mesh(new THREE.ConeGeometry(0.08, 0.28, 10), hairM);
      tuft.position.set(0.05, 0.5, 0.05);
      tuft.rotation.z = -0.5;
      head.add(tuft);
      head.add(blob(hairM, 0, 0.22, 0.3, 0.3, 0.12, 0.12));
    }
    if (o.style === 'pigtails') {
      [-1, 1].forEach((s) => {
        head.add(blob(hairM, s * 0.46, 0.06, -0.12, 0.17));
        head.add(blob(mat(0xff6fb5), s * 0.4, 0.2, -0.05, 0.08));
      });
      head.add(blob(hairM, 0, 0.24, 0.28, 0.32, 0.12, 0.12));
    }
    if (o.style === 'bun') head.add(blob(hairM, 0, 0.4, -0.28, 0.19));
    if (o.glasses) {
      [-1, 1].forEach((s) => {
        const ring = mesh(new THREE.TorusGeometry(0.1, 0.016, 8, 20), dark, false);
        ring.position.set(s * 0.15, 0.04, 0.43);
        head.add(ring);
      });
      head.add(box(0.1, 0.02, 0.02, dark, 0, 0.06, 0.45, 0.005));
    }
    if (o.mustache) head.add(blob(hairM, 0, -0.05, 0.42, 0.15, 0.045, 0.05));
    head.add(new THREE.Object3D());
    inner.add(head);

    // Dirt spots (only Pip uses these) and a cap/hat.
    const dirt = [];
    if (o.dirt) {
      [[-0.2, 0.18], [0.21, -0.02], [0.02, 0.24]].forEach(([x, y]) => {
        const z = Math.sqrt(0.44 * 0.44 - x * x - y * y) + 0.005;
        const d = blob(mat(0x8a6a45, { roughness: 1 }), x, y, z, 0.06, 0.05, 0.02);
        head.add(d);
        dirt.push(d);
      });
    }
    let hat = null;
    if (o.hat) {
      hat = new THREE.Group();
      const hatM = mat(o.hat, { roughness: 0.5 });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatM);
      crown.castShadow = true;
      const brim = cyl(0.3, 0.3, 0.04, hatM, 0, 0.02, 0.38);
      brim.scale.set(1, 1, 0.8);
      hat.add(crown, brim);
      hat.position.set(0, 0.06, 0);
      hat.rotation.x = -0.15;
      head.add(hat);
    }
    g.scale.setScalar(o.scale || 1);
    return {
      group: g, inner, head, eyes, arms, legs, hands, mouth, mouthOpen, teeth, shirtM, pantsM, dirt, hat, name: o.name,
      anim: { baseY: 0, jump: 0, armsUp: 0, armsFwd: 0, holdR: 0, wave: 0, walking: false, face: null, tilt: 0, sleep: false, sit: 0, lie: 0, hunch: 0, sad: false, blinkAt: rand(1, 3) },
    };
  }

  function animPerson(p, t, dt) {
    const a = p.anim;
    p.group.position.y = a.baseY + a.jump;
    const sw = a.walking ? Math.sin(t * 11) : 0;
    p.legs.forEach((leg, i) => { leg.rotation.x = a.sit ? -1.45 * a.sit : (i ? -sw : sw) * 0.6; });
    p.arms.forEach((arm, i) => {
      const s = arm.userData.side;
      arm.rotation.x = -a.armsFwd * 1.2 - (i ? a.holdR : 0) * 1.0 + (a.walking ? s * sw * 0.5 : 0);
      const wave = s > 0 ? a.wave * (2.3 + 0.35 * Math.sin(t * 12)) : 0;
      arm.rotation.z = s * (0.12 + a.armsUp * 2.4 + wave);
    });
    p.inner.rotation.x = a.hunch;
    p.inner.position.y = Math.sin(t * 2.2 + p.group.id) * 0.015;
    p.head.rotation.z = a.tilt + Math.sin(t * 1.3 + p.group.id) * 0.05;
    if (a.lie) {
      p.group.rotation.set(-a.lie * Math.PI / 2, 0, 0);
    } else {
      p.group.rotation.x = 0;
      const want = a.face != null ? a.face : Math.atan2(camPos.x - p.group.position.x, camPos.z - p.group.position.z);
      let diff = want - p.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.group.rotation.y += diff * Math.min(1, dt * 8);
    }
    p.mouth.rotation.z = a.sad ? 0 : Math.PI;
    p.mouth.position.y = a.sad ? -0.2 : -0.13;
    if (a.sleep) p.eyes.scale.y = 0.12;
    else if (t > a.blinkAt) {
      const b = (t - a.blinkAt) / 0.15;
      p.eyes.scale.y = b < 1 ? Math.max(0.1, Math.abs(1 - 2 * b)) : 1;
      if (b >= 1) a.blinkAt = t + rand(2, 5);
    } else p.eyes.scale.y = 1;
  }

  function hop(p, h, dur) {
    tween(dur || 0.5, (k) => { p.anim.jump = Math.sin(Math.PI * k) * (h || 0.5); }, () => { p.anim.jump = 0; });
  }
  function cheer(p) {
    tween(0.9, (k) => { p.anim.jump = Math.abs(Math.sin(Math.PI * 2 * k)) * 0.45; p.anim.armsUp = Math.sin(Math.PI * k); }, () => { p.anim.jump = 0; p.anim.armsUp = 0; });
  }
  function walkTo(p, to, done, speed) {
    const from = p.group.position.clone();
    from.y = 0;
    const d = from.distanceTo(new V3(to.x, 0, to.z));
    if (d < 0.05) { if (done) done(); return; }
    p.anim.walking = true;
    p.anim.face = Math.atan2(to.x - from.x, to.z - from.z);
    tween(d / (speed || 2.2), (k) => {
      p.group.position.x = from.x + (to.x - from.x) * k;
      p.group.position.z = from.z + (to.z - from.z) * k;
    }, () => {
      p.anim.walking = false;
      p.anim.face = null;
      if (done) done();
    });
  }
  // Fly an object (in world space) to a target, with an arc.
  function flyTo(obj, to, dur, arc, done, endScale) {
    const from = new V3();
    obj.getWorldPosition(from);
    const s0 = obj.scale.x;
    scene.attach(obj);
    tween(dur, (k) => {
      const e = ease.inOutSine(k);
      obj.position.lerpVectors(from, typeof to === 'function' ? to() : to, e);
      obj.position.y += Math.sin(Math.PI * k) * arc;
      if (endScale !== undefined) obj.scale.setScalar(s0 + (endScale - s0) * e);
    }, done);
  }

  // ---------------------------------------------------------------- rooms
  const rooms = { bed: new THREE.Group(), kitchen: new THREE.Group(), park: new THREE.Group() };
  Object.values(rooms).forEach((r) => { r.visible = false; scene.add(r); });

  const woodTex = canvasTexture(256, 256, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#e9b77c' : '#e2ab6e';
      g.fillRect(0, i * 32, w, 32);
      g.fillStyle = 'rgba(120,70,30,0.25)';
      g.fillRect(0, i * 32, w, 2);
      g.fillRect(((i * 97) % 200) + 20, i * 32, 2, 32);
    }
  }, 6, 6);
  function wallTexture(base, dots) {
    return canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
      g.fillStyle = dots;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        if ((x + y) % 2) starPath(g, x * 64 + 32, y * 64 + 32, 9);
        else { g.beginPath(); g.arc(x * 64 + 32, y * 64 + 32, 5, 0, Math.PI * 2); g.fill(); }
      }
    }, 6, 2);
  }
  function addWindow(room, x, y, z, w, h) {
    const frame = mat(0xffffff, { roughness: 0.4 });
    const sky = canvasTexture(128, 128, (g) => {
      const grd = g.createLinearGradient(0, 0, 0, 128);
      grd.addColorStop(0, '#7cc8ff');
      grd.addColorStop(1, '#d4f0ff');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffe066';
      g.beginPath(); g.arc(92, 36, 18, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      [[30, 70, 14], [46, 66, 18], [62, 72, 12]].forEach(([cx, cy, r]) => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = '#7fd36a';
      g.fillRect(0, 108, 128, 20);
    });
    room.add(plane(w, h, new THREE.MeshBasicMaterial({ map: sky }), x, y, z + 0.01));
    room.add(box(w + 0.2, 0.14, 0.12, frame, x, y + h / 2, z + 0.05, 0.04), box(w + 0.2, 0.14, 0.12, frame, x, y - h / 2, z + 0.05, 0.04));
    room.add(box(0.14, h + 0.2, 0.12, frame, x - w / 2, y, z + 0.05, 0.04), box(0.14, h + 0.2, 0.12, frame, x + w / 2, y, z + 0.05, 0.04));
    room.add(box(0.08, h, 0.08, frame, x, y, z + 0.05, 0.03), box(w, 0.08, 0.08, frame, x, y, z + 0.05, 0.03));
    [-1, 1].forEach((s) => room.add(box(0.5, h + 0.5, 0.06, mat(0xff9fb5, { roughness: 0.9 }), x + s * (w / 2 + 0.3), y, z + 0.12, 0.05)));
  }

  // ---- Bedroom + bathroom corner (Level 1)
  const bed = {};
  {
    const R = rooms.bed;
    R.add(plane(20, 12, new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 }), 0, 0, 1, -Math.PI / 2));
    R.add(plane(20, 7, new THREE.MeshStandardMaterial({ map: wallTexture('#cfe6ff', '#ffffff'), roughness: 1 }), 0, 3.5, -2.6));
    R.add(box(20, 0.3, 0.12, mat(0x8fb8ff), 0, 0.15, -2.55, 0.04));
    addWindow(R, -1.0, 2.9, -2.58, 1.6, 1.3);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), mat(0xffb3c6, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-0.6, 0.01, 0.8);
    rug.receiveShadow = true;
    R.add(rug);

    // Bed
    R.add(box(2.1, 0.45, 3.0, mat(0xffffff), -3.6, 0.32, -0.9, 0.12));
    R.add(box(2.1, 1.4, 0.2, mat(0x7aa8ff), -3.6, 0.85, -2.35, 0.1));
    R.add(box(1.95, 0.28, 2.85, mat(0xf4f7ff, { roughness: 0.9 }), -3.6, 0.66, -0.9, 0.12));
    const pillow = box(1.0, 0.22, 0.55, mat(0xffffff, { roughness: 0.9 }), -3.6, 0.92, -1.95, 0.1);
    R.add(pillow);
    const blanketTex = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#6f9cff';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#ffffff';
      [[30, 30], [90, 50], [50, 95], [105, 105]].forEach(([x, y]) => starPath(g, x, y, 10));
    });
    const blanket = mesh(roundBox(1.95, 0.14, 2.0, 0.06), new THREE.MeshStandardMaterial({ map: blanketTex, roughness: 0.9 }));
    R.add(blanket);
    bed.pillow = pillow;
    bed.blanket = blanket;
    bed.blanketNeat = { pos: new V3(-3.6, 0.86, -0.35), rot: new THREE.Euler(0, 0, 0), scale: new V3(1, 1, 1) };
    bed.blanketCover = { pos: new V3(-3.6, 1.36, -0.25), rot: new THREE.Euler(0, 0, 0), scale: new V3(1, 1, 1.05) };
    bed.blanketMessy = { pos: new V3(-3.2, 0.95, -0.1), rot: new THREE.Euler(0.05, 0.6, -0.12), scale: new V3(0.8, 1.8, 0.75) };
    bed.pillowNeat = { pos: new V3(-3.6, 0.92, -1.95), rot: new THREE.Euler(0, 0, 0) };
    bed.pillowMessy = { pos: new V3(-2.75, 0.85, -1.2), rot: new THREE.Euler(0.3, 0.7, 0.5) };

    // Bedside table + alarm clock
    R.add(box(0.8, 0.8, 0.7, mat(0xffd27a), -2.0, 0.4, -1.9, 0.08));
    const clock = new THREE.Group();
    const blue = mat(0x3d7dff, { roughness: 0.3 });
    const body = cyl(0.3, 0.3, 0.18, blue, 0, 0, 0, 32);
    body.rotation.x = Math.PI / 2;
    const face = cyl(0.25, 0.25, 0.02, mat(0xffffff), 0, 0, 0.1, 32);
    face.rotation.x = Math.PI / 2;
    const hand1 = box(0.03, 0.17, 0.02, mat(0x222222), 0, 0.07, 0.12, 0.005);
    const hand2 = box(0.12, 0.03, 0.02, mat(0x222222), -0.05, 0, 0.12, 0.005);
    const gold = mat(0xffc400, { roughness: 0.3, metalness: 0.3 });
    clock.add(body, face, hand1, hand2, blob(gold, -0.18, 0.3, 0, 0.11, 0.08, 0.11), blob(gold, 0.18, 0.3, 0, 0.11, 0.08, 0.11));
    clock.add(blob(blue, -0.16, -0.3, 0, 0.06), blob(blue, 0.16, -0.3, 0, 0.06));
    clock.position.set(-2.0, 1.16, -1.85);
    clock.userData.tapId = 'clock';
    R.add(clock);
    bed.clock = clock;

    // Bathroom corner: tiles, sink, mirror, toothbrush cup
    const tiles = canvasTexture(128, 128, (g) => {
      g.fillStyle = '#bff0ec';
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 4;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 128); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); }
    }, 2, 2);
    R.add(plane(2.6, 2.8, new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.3 }), 1.9, 1.5, -2.57));
    const porcelain = mat(0xffffff, { roughness: 0.15 });
    R.add(cyl(0.18, 0.28, 0.95, porcelain, 1.9, 0.48, -2.1));
    const basin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), porcelain);
    basin.scale.set(1, 0.5, 0.8);
    basin.position.set(1.9, 1.15, -2.05);
    basin.castShadow = true;
    R.add(basin, cyl(0.55, 0.55, 0.06, porcelain, 1.9, 1.15, -2.05, 32));
    R.children[R.children.length - 1].scale.set(1, 1, 0.8);
    const tap = new THREE.Group();
    const chrome = mat(0xc9d3e0, { roughness: 0.15, metalness: 0.6 });
    tap.add(cyl(0.05, 0.05, 0.4, chrome, 0, 0.2, 0), box(0.08, 0.08, 0.32, chrome, 0, 0.4, 0.13, 0.03), blob(mat(0x3d7dff), 0, 0.48, 0, 0.07));
    tap.position.set(1.9, 1.15, -2.45);
    tap.userData.tapId = 'tap';
    R.add(tap);
    bed.tap = tap;
    bed.spout = new V3(1.9, 1.5, -2.2);
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), new THREE.MeshStandardMaterial({ color: 0xd8f3ff, roughness: 0.05, metalness: 0.5 }));
    mirror.position.set(1.9, 2.2, -2.55);
    R.add(mirror);
    const mf = mesh(new THREE.TorusGeometry(0.56, 0.06, 10, 40), mat(0xffc400));
    mf.position.copy(mirror.position);
    R.add(mf);
    // Toothbrush cup on a little shelf
    R.add(box(0.7, 0.08, 0.3, mat(0xffffff), 2.75, 1.4, -2.4, 0.03));
    R.add(cyl(0.1, 0.08, 0.22, mat(0xffb020), 2.75, 1.55, -2.4));
    const brush = new THREE.Group();
    brush.add(cyl(0.025, 0.025, 0.5, mat(0x2ecc71, { roughness: 0.3 }), 0, 0, 0, 8), box(0.06, 0.12, 0.06, mat(0xffffff), 0, 0.27, 0.03, 0.02));
    brush.position.set(2.75, 1.75, -2.4);
    brush.rotation.z = -0.2;
    brush.userData.tapId = 'brush';
    R.add(brush);
    bed.brush = brush;
    bed.brushHome = { pos: brush.position.clone(), rot: brush.rotation.clone() };

    // Wardrobe with clothes inside
    const wardrobe = new THREE.Group();
    wardrobe.add(box(1.7, 2.6, 0.9, mat(0xffc98b), 0, 1.3, 0, 0.1));
    wardrobe.add(box(1.5, 2.3, 0.05, mat(0xb98352), 0, 1.35, 0.44, 0.02));
    wardrobe.add(box(1.5, 0.05, 0.6, mat(0xd99b5e), 0, 1.6, 0.15, 0.02));
    const doors = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.8, 1.35, 0.47);
      const door = box(0.78, 2.3, 0.08, mat(0xffb066), -s * 0.39, 0, 0, 0.05);
      pivot.add(door, blob(mat(0xffffff), -s * 0.68, 0, 0.07, 0.06));
      wardrobe.add(pivot);
      return pivot;
    });
    wardrobe.position.set(4.6, 0, -1.8);
    R.add(wardrobe);
    bed.doors = doors;

    const shirt = new THREE.Group();
    const red = mat(0xff5a5a, { roughness: 0.6 });
    shirt.add(box(0.55, 0.6, 0.12, red, 0, 0, 0, 0.06));
    [-1, 1].forEach((s) => {
      const sl = box(0.25, 0.18, 0.12, red, s * 0.35, 0.17, 0, 0.05);
      sl.rotation.z = s * -0.5;
      shirt.add(sl);
    });
    shirt.add(blob(mat(0xffffff), 0, 0.05, 0.07, 0.07, 0.07, 0.02));
    shirt.position.set(4.25, 1.95, -1.45);
    shirt.userData.tapId = 'shirt';
    R.add(shirt);
    const hat = new THREE.Group();
    const hatM = mat(0x2f74ff, { roughness: 0.5 });
    hat.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), hatM));
    hat.add(cyl(0.18, 0.18, 0.03, hatM, 0, 0.01, 0.23));
    hat.position.set(4.95, 1.68, -1.45);
    hat.userData.tapId = 'hat';
    R.add(hat);
    bed.shirt = shirt;
    bed.hat = hat;
    bed.shirtHome = shirt.position.clone();
    bed.hatHome = hat.position.clone();

    // Toys for decoration
    R.add(box(0.4, 0.4, 0.4, mat(0xff8c1a), 0.6, 0.2, 1.3, 0.06), box(0.35, 0.35, 0.35, mat(0x2ecc71), 0.9, 0.18, 1.0, 0.06));
    R.add(blob(mat(0xff3b3b, { roughness: 0.3 }), -0.5, 0.25, 1.6, 0.25));
    R.add(box(1.0, 1.6, 0.5, mat(0xa98bff), -5.8, 0.8, -2.2, 0.08));
  }

  // ---- Kitchen + play corner (Level 2)
  const kit = {};
  {
    const R = rooms.kitchen;
    const floorTex = canvasTexture(128, 128, (g) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#fff6e0' : '#ffd9a0';
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }, 10, 6);
    R.add(plane(22, 12, new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }), 0, 0, 1, -Math.PI / 2));
    R.add(plane(22, 7, new THREE.MeshStandardMaterial({ map: wallTexture('#fff2b8', '#ffd76a'), roughness: 1 }), 0, 3.5, -2.6));
    R.add(box(22, 0.3, 0.12, mat(0xffb020), 0, 0.15, -2.55, 0.04));
    addWindow(R, 0, 3.0, -2.58, 1.8, 1.2);
    // Counter and fridge at the back
    R.add(box(2.4, 1.1, 0.7, mat(0x8fd3c6), -1.9, 0.55, -2.15, 0.06), box(2.5, 0.08, 0.8, mat(0xffffff), -1.9, 1.14, -2.12, 0.03));
    R.add(box(1.0, 2.2, 0.8, mat(0xffffff, { roughness: 0.3 }), 2.0, 1.1, -2.1, 0.12));
    R.add(box(0.06, 0.5, 0.06, mat(0xb0b8c8), 1.65, 1.5, -1.68, 0.02));
    // Dining table + plate
    R.add(box(3.8, 0.14, 1.7, mat(0xffffff, { roughness: 0.5 }), 0, 1.0, -0.2, 0.06));
    [[-1.7, -0.9], [1.7, -0.9], [-1.7, 0.5], [1.7, 0.5]].forEach(([x, z]) => R.add(cyl(0.07, 0.07, 1.0, mat(0xe2ab6e), x, 0.5, z, 10)));
    R.add(box(3.6, 0.02, 0.5, mat(0xff9fb5, { roughness: 1 }), 0, 1.08, -0.6, 0.01));
    const plate = cyl(0.42, 0.34, 0.06, mat(0xffffff, { roughness: 0.2 }), 0, 1.12, -0.6, 32);
    R.add(plate);
    kit.plate = new V3(0, 1.2, -0.6);
    kit.pipSpot = new V3(0, 0, -1.55);

    // Play corner (right): toy box
    const toyBox = new THREE.Group();
    toyBox.add(box(1.4, 0.8, 0.9, mat(0x3d8bff), 0, 0.4, 0, 0.08), box(1.25, 0.05, 0.75, mat(0x2563c9), 0, 0.79, 0, 0.02));
    const star = box(0.3, 0.3, 0.04, mat(0xffd21f), 0, 0.42, 0.47, 0.1);
    toyBox.add(star);
    toyBox.position.set(5.6, 0, -1.4);
    R.add(toyBox);
    kit.toyBox = new V3(5.6, 0.75, -1.4);

    // Study corner (left): school bag on a little chair, items on a desk
    R.add(box(1.8, 0.1, 0.9, mat(0xffd27a), -5.2, 0.85, -1.6, 0.04));
    [[-5.95, -1.95], [-4.45, -1.95], [-5.95, -1.25], [-4.45, -1.25]].forEach(([x, z]) => R.add(cyl(0.05, 0.05, 0.85, mat(0xe2ab6e), x, 0.42, z, 8)));
    const bag = new THREE.Group();
    bag.add(box(0.7, 0.85, 0.35, mat(0x2f74ff), 0, 0.45, 0, 0.15), box(0.5, 0.35, 0.12, mat(0x5aa9ff), 0, 0.3, 0.2, 0.08));
    [-1, 1].forEach((s) => bag.add(box(0.08, 0.6, 0.06, mat(0x1d4fbf), s * 0.2, 0.5, -0.2, 0.03)));
    bag.add(blob(mat(0xffffff), 0, 0.62, 0.19, 0.08));
    bag.position.set(-3.4, 0, -1.2);
    R.add(bag);
    kit.bag = bag;
    kit.bagHome = bag.position.clone();
  }

  // ---- Park (Level 3)
  const park = {};
  {
    const R = rooms.park;
    const grass = new THREE.Mesh(new THREE.CircleGeometry(40, 64), mat(0x8fdc6a, { roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    R.add(grass);
    R.add(plane(30, 1.4, mat(0xf3d9a4, { roughness: 1 }), 0, 0.01, 0.9, -Math.PI / 2));
    const trunk = mat(0x9b6a3c), leaves = [mat(0x45b553), mat(0x56c460), mat(0x3aa449)];
    [[-7.5, -4], [-3.4, -5], [0.5, -4.6], [4.5, -5.2], [8.5, -4.2], [-10, -2.5], [11, -2.8]].forEach(([x, z], i) => {
      R.add(cyl(0.2, 0.28, 1.6, trunk, x, 0.8, z, 10));
      const l = leaves[i % 3];
      R.add(blob(l, x, 2.2, z, 1.1), blob(l, x - 0.6, 1.8, z + 0.1, 0.75), blob(l, x + 0.6, 1.85, z - 0.1, 0.8), blob(l, x, 2.9, z, 0.7));
    });
    for (let i = 0; i < 40; i++) {
      const x = rand(-12, 12), z = rand(-3.5, 3.5);
      if (Math.abs(z - 0.9) < 1) continue;
      R.add(cyl(0.02, 0.02, 0.3, mat(0x2f9e44), x, 0.15, z, 5), blob(mat(pick([0xff6b6b, 0xffd21f, 0xff9fd0, 0x9b8bff, 0xffffff])), x, 0.32, z, 0.1, 0.06, 0.1));
    }
    // Bench
    const bench = new THREE.Group();
    bench.add(box(1.8, 0.1, 0.5, mat(0xd9894a), 0, 0.55, 0, 0.03), box(1.8, 0.4, 0.08, mat(0xd9894a), 0, 0.85, -0.24, 0.03));
    [-0.75, 0.75].forEach((x) => bench.add(box(0.08, 0.55, 0.45, mat(0x555a66), x, 0.27, 0, 0.02)));
    bench.position.set(-1.2, 0, -1.2);
    R.add(bench);
    // Grandma's front door
    R.add(box(1.6, 2.4, 0.3, mat(0xfff1d6), -6.2, 1.2, -2.4, 0.06), box(0.8, 1.6, 0.06, mat(0xd9894a), -6.2, 0.8, -2.22, 0.05));
    R.add(blob(mat(0xffc400), -5.95, 0.85, -2.17, 0.05));
    const roof = mesh(new THREE.ConeGeometry(1.3, 0.8, 4), mat(0xff6f6f));
    roof.position.set(-6.2, 2.8, -2.4);
    roof.rotation.y = Math.PI / 4;
    R.add(roof);
    // Chicken pen
    for (let x = 1.4; x <= 4.6; x += 0.4) R.add(box(0.08, 0.6, 0.08, mat(0xffffff), x, 0.3, -2.0, 0.03));
    R.add(box(3.3, 0.06, 0.06, mat(0xffffff), 3.0, 0.5, -2.0, 0.02), box(3.3, 0.06, 0.06, mat(0xffffff), 3.0, 0.25, -2.0, 0.02));
    park.door = new V3(-6.2, 0, -1.9);
  }

  // ---- Cast
  const pip = makePerson({ name: 'Pip', shirt: 0x9fc4ff, pants: 0x9fc4ff, hair: 0x6b3e1f, shoes: 0xffffff, style: 'pip', dirt: true, hat: 0x2f74ff });
  pip.hat.visible = false;
  scene.add(pip.group);
  const tia = makePerson({ name: 'Tia', shirt: 0xff8fc0, pants: 0x7a5cff, hair: 0x2b1a12, skin: 0xd9a27a, shoes: 0xff5a9a, style: 'pigtails', scale: 0.95 });
  const grandma = makePerson({ name: 'Grandma', shirt: 0x9b6bd6, pants: 0x9b6bd6, hair: 0xdcdcdc, shoes: 0x5a4a6a, style: 'bun', glasses: true, dress: true, scale: 1.12 });
  const grandpa = makePerson({ name: 'Grandpa', shirt: 0x4caf7a, pants: 0x6b5a4a, hair: 0xe6e6e6, skin: 0xe8b48f, shoes: 0x3a2f2a, style: 'short', glasses: true, mustache: true, hat: 0xc98a4a, scale: 1.15 });
  [tia, grandma, grandpa].forEach((p) => rooms.park.add(p.group));
  const cast = [pip, tia, grandma, grandpa];

  function makeChicken() {
    const g = new THREE.Group();
    const white = mat(0xffffff, { roughness: 0.7 });
    g.add(blob(white, 0, 0.4, 0, 0.32, 0.28, 0.38));
    const head = new THREE.Group();
    head.position.set(0, 0.68, 0.25);
    head.add(blob(white, 0, 0, 0, 0.17));
    const beak = mesh(new THREE.ConeGeometry(0.05, 0.12, 8), mat(0xffb020));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, -0.02, 0.18);
    head.add(beak, blob(mat(0xff3b3b), 0, 0.17, 0, 0.05, 0.07, 0.09), blob(mat(0xff3b3b), 0, -0.1, 0.12, 0.03, 0.05, 0.03));
    [-1, 1].forEach((s) => head.add(blob(mat(0x222222), s * 0.08, 0.04, 0.13, 0.025)));
    g.add(head);
    g.add(blob(white, 0, 0.55, -0.35, 0.12, 0.16, 0.08));
    [-1, 1].forEach((s) => g.add(cyl(0.02, 0.02, 0.2, mat(0xffb020), s * 0.1, 0.1, 0, 6)));
    g.userData.head = head;
    return g;
  }

  // ---------------------------------------------------------------- foods & things to tap
  function makeFood(kind) {
    const g = new THREE.Group();
    if (kind === 'apple') {
      g.add(blob(mat(0xff2d2d, { roughness: 0.3 }), 0, 0.22, 0, 0.22, 0.2, 0.22), cyl(0.015, 0.015, 0.1, mat(0x6b4423), 0, 0.45, 0, 6), blob(mat(0x3fbf3f), 0.06, 0.46, 0, 0.06, 0.02, 0.035));
    } else if (kind === 'banana') {
      const b = mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 24, Math.PI * 0.9), mat(0xffd84d, { roughness: 0.4 }));
      b.rotation.z = Math.PI * 1.05;
      b.position.y = 0.32;
      g.add(b);
    } else if (kind === 'carrot') {
      const c = mesh(new THREE.ConeGeometry(0.1, 0.5, 14), mat(0xff8c1a));
      c.rotation.z = Math.PI;
      c.position.y = 0.25;
      g.add(c);
      [-0.05, 0, 0.05].forEach((x) => { const l = cyl(0.015, 0.015, 0.16, mat(0x2ecc40), x, 0.55, 0, 5); l.rotation.z = x * 6; g.add(l); });
    } else if (kind === 'milk') {
      g.add(cyl(0.13, 0.11, 0.38, mat(0xffffff, { roughness: 0.2 }), 0, 0.19, 0));
      g.add(cyl(0.14, 0.14, 0.03, mat(0x9fc4ff), 0, 0.39, 0));
    } else if (kind === 'broccoli') {
      g.add(cyl(0.05, 0.07, 0.22, mat(0x8fd35a), 0, 0.11, 0, 8));
      [[0, 0.32, 0, 0.13], [-0.1, 0.27, 0.03, 0.1], [0.1, 0.27, 0.03, 0.1], [0, 0.28, -0.08, 0.1]].forEach(([x, y, z, r]) => g.add(blob(mat(0x2e9e3e, { roughness: 0.9 }), x, y, z, r)));
    } else if (kind === 'chips') {
      g.add(box(0.36, 0.48, 0.14, mat(0xff3b3b, { roughness: 0.3 }), 0, 0.26, 0, 0.05), box(0.28, 0.14, 0.02, mat(0xffd21f), 0, 0.28, 0.08, 0.02));
    } else if (kind === 'soda') {
      g.add(cyl(0.12, 0.12, 0.4, mat(0x9b4dff, { roughness: 0.25, metalness: 0.3 }), 0, 0.2, 0), cyl(0.125, 0.125, 0.08, mat(0xffffff), 0, 0.22, 0));
    } else if (kind === 'candy') {
      const disc = cyl(0.17, 0.17, 0.06, mat(0xff6fb5, { roughness: 0.2 }), 0, 0.45, 0, 24);
      disc.rotation.x = Math.PI / 2;
      g.add(disc, cyl(0.02, 0.02, 0.32, mat(0xffffff), 0, 0.17, 0, 6));
    } else if (kind === 'donut') {
      const d = mesh(new THREE.TorusGeometry(0.15, 0.08, 12, 24), mat(0xff9fd0, { roughness: 0.4 }));
      d.position.y = 0.2;
      g.add(d);
    }
    g.userData.kind = kind;
    return g;
  }
  const HEALTHY = { apple: 'an apple', banana: 'a banana', carrot: 'a carrot', milk: 'milk', broccoli: 'broccoli' };
  const SNACKS = { chips: 'Chips', soda: 'Soda', candy: 'Candy', donut: 'A donut' };

  function makeToy(kind) {
    const g = new THREE.Group();
    if (kind === 'ball') g.add(blob(mat(0xff3b3b, { roughness: 0.3 }), 0, 0.22, 0, 0.22));
    if (kind === 'block') g.add(box(0.36, 0.36, 0.36, mat(0xffd21f), 0, 0.18, 0, 0.05));
    if (kind === 'teddy') {
      const b = mat(0xc98a4a, { roughness: 0.9 });
      g.add(blob(b, 0, 0.2, 0, 0.2, 0.22, 0.18), blob(b, 0, 0.5, 0, 0.16), blob(b, -0.12, 0.62, 0, 0.06), blob(b, 0.12, 0.62, 0, 0.06), blob(mat(0x222222), 0, 0.48, 0.15, 0.025));
    }
    if (kind === 'car') {
      g.add(box(0.5, 0.18, 0.28, mat(0x2ecc71), 0, 0.16, 0, 0.06), box(0.28, 0.14, 0.24, mat(0x9fe0ff), -0.03, 0.31, 0, 0.05));
      [[-0.16, 0.14], [0.16, 0.14], [-0.16, -0.14], [0.16, -0.14]].forEach(([x, z]) => { const w = cyl(0.07, 0.07, 0.05, mat(0x222222), x, 0.07, z, 12); w.rotation.x = Math.PI / 2; g.add(w); });
    }
    if (kind === 'book') g.add(box(0.4, 0.08, 0.3, mat(0xff8c1a), 0, 0.04, 0, 0.02), box(0.36, 0.06, 0.28, mat(0xffffff), 0.01, 0.05, 0, 0.01));
    if (kind === 'pencils') g.add(box(0.42, 0.1, 0.16, mat(0x9b4dff), 0, 0.05, 0, 0.05));
    if (kind === 'bottle') g.add(cyl(0.09, 0.09, 0.36, mat(0x5ad1ff, { roughness: 0.2 }), 0, 0.18, 0, 16), cyl(0.06, 0.06, 0.06, mat(0x2f74ff), 0, 0.39, 0, 12));
    g.userData.kind = kind;
    return g;
  }

  // ---------------------------------------------------------------- UI
  const ui = {
    start: $('start'), select: $('select'), hud: $('hud'), prompt: $('prompt'), promptIcon: $('promptIcon'), promptText: $('promptText'),
    tracker: $('tracker'), finger: $('finger'), party: $('party'), levelDone: $('levelDone'), stars: $('stars'), starCount: $('starCount'),
    soundBtn: $('soundBtn'), doneText: $('doneText'), doneSteps: $('doneSteps'), nextBtn: $('nextBtn'),
  };
  const game = {
    screen: 'start', level: 0, stepIdx: 0, step: null,
    stars: store.get('stars', 0), done: store.get('habitsDone', [false, false, false]), idle: 0, idleCount: 0,
  };
  ui.starCount.textContent = game.stars;

  function showPrompt(icon, text) {
    ui.promptIcon.textContent = icon;
    ui.promptText.textContent = text;
    ui.prompt.classList.remove('show');
    void ui.prompt.offsetWidth;
    ui.prompt.classList.add('show');
  }
  function buildTracker() {
    ui.tracker.innerHTML = LEVELS[game.level].steps.map((s) => '<span>' + s.icon + '</span>').join('');
  }
  function markTracker() {
    [...ui.tracker.children].forEach((el, i) => {
      el.classList.toggle('done', i < game.stepIdx || (i === game.stepIdx && game.step && game.step.complete));
      el.classList.toggle('now', i === game.stepIdx && !(game.step && game.step.complete));
    });
  }
  function screenPos(v) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight, behind: p.z > 1 };
  }
  function awardStar(fromWorld) {
    game.stars += 1;
    store.set('stars', game.stars);
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
      Sound.sparkle();
    };
    if (el.animate) {
      el.animate([
        { transform: 'translate(0,0) scale(0.3)' },
        { transform: 'translate(0,-40px) scale(1.6) rotate(90deg)', offset: 0.3 },
        { transform: 'translate(' + (to.left + 28 - from.x) + 'px,' + (to.top + 32 - from.y) + 'px) scale(0.6) rotate(360deg)' },
      ], { duration: 1100, easing: 'ease-in-out' }).onfinish = done;
    } else done();
  }
  function banner(html) {
    ui.party.innerHTML = html;
    ui.party.classList.remove('hidden', 'show');
    void ui.party.offsetWidth;
    ui.party.classList.add('show');
    later(2.7, () => ui.party.classList.add('hidden'));
  }
  function sparkleAt(pos, n) { burst(pos, [0xffe066, 0xffffff, 0x9be7ff], n || 14, { speed: 2.5, geo: sparkGeo, life: 0.9, up: 1.2, gravity: 2 }); }
  function worldOf(obj, dy) { const v = new V3(); obj.getWorldPosition(v); v.y += dy || 0; return v; }
  function setPose(obj, pose) {
    obj.position.copy(pose.pos);
    obj.rotation.copy(pose.rot);
    if (pose.scale) obj.scale.copy(pose.scale);
  }
  function tweenPose(obj, pose, dur) {
    const p0 = obj.position.clone(), r0 = obj.rotation.clone(), s0 = obj.scale.clone();
    tween(dur, (k) => {
      const e = ease.outBack(k);
      obj.position.lerpVectors(p0, pose.pos, e);
      obj.rotation.set(r0.x + (pose.rot.x - r0.x) * e, r0.y + (pose.rot.y - r0.y) * e, r0.z + (pose.rot.z - r0.z) * e);
      if (pose.scale) obj.scale.lerpVectors(s0, pose.scale, Math.min(1, e));
    });
  }

  // ---------------------------------------------------------------- levels & steps
  // Each step: icon, prompt, say (spoken instruction), cam (where to look), start(), targets(),
  // tap(target) -> true when it counts, need (taps to finish), finish() -> spoken praise.
  const S = {}; // per-level scratch state
  const LEVELS = [
    {
      name: 'Good Morning', icon: '☀️', room: 'bed',
      intro: "Good morning! Let's help Pip get ready for the day.",
      summary: 'Wake up, make your bed, wash your face, brush your teeth, and get dressed. Great morning habits!',
      reset() {
        rooms.bed.visible = true;
        setPose(bed.blanket, bed.blanketCover);
        setPose(bed.pillow, bed.pillowNeat);
        bed.clock.rotation.set(0, 0, 0);
        bed.clock.userData.ringing = false;
        rooms.bed.attach(bed.brush);
        bed.brush.position.copy(bed.brushHome.pos);
        bed.brush.rotation.copy(bed.brushHome.rot);
        bed.doors.forEach((d) => { d.rotation.y = 0; });
        [bed.shirt, bed.hat].forEach((o) => { rooms.bed.attach(o); o.visible = true; o.scale.setScalar(1); });
        bed.shirt.position.copy(bed.shirtHome);
        bed.hat.position.copy(bed.hatHome);
        bed.shirt.rotation.set(0, 0, 0);
        bed.hat.rotation.set(0, 0, 0);
        pip.shirtM.color.set(0x9fc4ff);
        pip.pantsM.color.set(0x9fc4ff);
        pip.hat.visible = false;
        pip.dirt.forEach((d) => { d.visible = true; });
        pip.group.position.set(-3.6, 0, 0.2);
        Object.assign(pip.anim, { baseY: 1.05, lie: 1, sleep: true, face: null });
      },
      steps: [
        {
          icon: '⏰', prompt: 'Tap the clock!', cam: [-2.6, 1.0, -0.8, 2.6],
          say: 'Ring ring! Pip is still sleeping. Tap the clock to wake Pip up!',
          start() { bed.clock.userData.ringing = true; },
          targets: () => [bed.clock],
          need: 1,
          tap() {
            bed.clock.userData.ringing = false;
            bed.clock.rotation.z = 0;
            Sound.ding();
            pip.anim.sleep = false;
            tweenPose(bed.blanket, bed.blanketMessy, 0.6);
            tweenPose(bed.pillow, bed.pillowMessy, 0.6);
            const from = pip.group.position.clone();
            tween(0.9, (k) => {
              pip.anim.lie = 1 - k;
              pip.anim.baseY = 1.05 * (1 - k) + Math.sin(Math.PI * k) * 0.8;
              pip.group.position.x = from.x + (-1.9 - from.x) * k;
              pip.group.position.z = from.z + (0.3 - from.z) * k;
            }, () => { pip.anim.baseY = 0; cheer(pip); });
            return true;
          },
          finish: () => talk([['pip', 'Good morning!'], ['narrator', 'Waking up on time is a good habit!']]),
        },
        {
          icon: '\u{1F6CF}️', prompt: 'Make the bed!', cam: [-3.0, 0.9, -0.8, 2.7],
          say: 'Oh no, the bed is messy! Tap the blanket and the pillow to make the bed neat.',
          start() { S.bedDone = {}; },
          targets: () => [bed.blanket, bed.pillow].filter((o) => !S.bedDone[o.id]),
          need: 2,
          tap(o) {
            S.bedDone[o.id] = true;
            tweenPose(o, o === bed.blanket ? bed.blanketNeat : bed.pillowNeat, 0.6);
            Sound.whoosh();
            later(0.4, () => sparkleAt(worldOf(o, 0.3)));
            Voice.say(o === bed.blanket ? 'Smooth blanket!' : 'Fluffy pillow!', { pitch: 1.7 });
            return true;
          },
          finish: () => talk([['narrator', 'A neat bed! Making your bed every morning is a good habit.']]),
        },
        {
          icon: '\u{1F4A7}', prompt: 'Wash your face!', cam: [1.6, 1.3, -1.4, 2.0],
          say: 'Pip has a dirty face. Tap the tap to wash Pip\'s face. Splash, splash, splash!',
          start() { walkTo(pip, new V3(1.15, 0, -1.3)); },
          targets: () => [bed.tap, pip.group],
          need: 3,
          tap() {
            const n = game.step.count;
            Sound.splash();
            const face = worldOf(pip.head, 0);
            const dir = face.clone().sub(bed.spout).normalize();
            burst(bed.spout, [0x5ad1ff, 0x9be7ff, 0xffffff], 22, { geo: dropGeo, dir, speed: 5, life: 0.6, gravity: 4, spread: 0.6 });
            later(0.25, () => {
              const d = pip.dirt[n];
              if (d) { d.visible = false; burst(face, [0xffffff, 0x9be7ff], 10, { geo: dropGeo, speed: 2, life: 0.6 }); }
            });
            Voice.say(NUMBER_WORDS[n + 1] + '!', { pitch: 1.4, rate: 1 });
            return true;
          },
          finish() { sparkleAt(worldOf(pip.head), 20); return talk([['pip', 'Clean face!'], ['narrator', 'Washing your face keeps you fresh and clean!']]); },
        },
        {
          icon: '\u{1FAA5}', prompt: 'Brush your teeth!', cam: [1.8, 1.4, -1.6, 2.0],
          say: 'Now brush your teeth! Tap the toothbrush. Brush, brush, brush!',
          start() {},
          targets: () => [bed.brush, pip.group],
          need: 4,
          tap() {
            const n = game.step.count;
            if (n === 0) {
              pip.mouthOpen.visible = true;
              pip.teeth.visible = true;
              pip.mouth.visible = false;
              flyTo(bed.brush, () => worldOf(pip.head, -0.12).add(new V3(0.12, 0, 0.42)), 0.5, 0.4, () => { bed.brush.rotation.set(0, 0, Math.PI / 2); });
            }
            Sound.brush();
            later(n === 0 ? 0.5 : 0, () => {
              tween(0.45, (k) => { bed.brush.position.x = worldOf(pip.head).x + 0.12 + Math.sin(k * Math.PI * 4) * 0.12; });
              burst(worldOf(pip.head, -0.15).add(new V3(0, 0, 0.45)), [0xffffff, 0xe8f6ff], 8, { geo: dropGeo, speed: 1.2, life: 0.8, gravity: 0.5, up: 0.5 });
            });
            Voice.say(['Brush!', 'Brush!', 'Brush!', 'Brush!'][n], { pitch: 1.5, rate: 1 });
            return true;
          },
          finish() {
            later(0.5, () => {
              pip.mouthOpen.visible = false;
              pip.mouth.visible = true;
              Sound.sparkle();
              sparkleAt(worldOf(pip.head, -0.12).add(new V3(0, 0, 0.45)), 18);
              flyTo(bed.brush, bed.brushHome.pos, 0.6, 0.4, () => { rooms.bed.attach(bed.brush); bed.brush.position.copy(bed.brushHome.pos); bed.brush.rotation.copy(bed.brushHome.rot); });
            });
            later(1.6, () => { pip.teeth.visible = false; });
            return talk([['pip', 'Shiny teeth!'], ['narrator', 'Brush your teeth every morning and every night!']]);
          },
        },
        {
          icon: '\u{1F455}', prompt: 'Get dressed!', cam: [3.9, 1.3, -1.3, 2.2],
          say: 'Time to get dressed! Tap the shirt and the hat.',
          start() {
            walkTo(pip, new V3(3.4, 0, -0.6));
            tween(0.8, (k) => { bed.doors[0].rotation.y = -k * 1.9; bed.doors[1].rotation.y = k * 1.9; });
            S.dressed = {};
          },
          targets: () => [bed.shirt, bed.hat].filter((o) => !S.dressed[o.id]),
          need: 2,
          tap(o) {
            S.dressed[o.id] = true;
            Sound.whoosh();
            const isShirt = o === bed.shirt;
            flyTo(o, () => worldOf(pip.head, isShirt ? -0.7 : 0.3), 0.6, 0.6, () => {
              o.visible = false;
              Sound.pop();
              burst(worldOf(pip.head, isShirt ? -0.6 : 0.3), CONFETTI, 18, { speed: 3 });
              if (isShirt) { pip.shirtM.color.set(0xff5a5a); pip.pantsM.color.set(0x2f74ff); } else pip.hat.visible = true;
              hop(pip, 0.4);
            }, 0.6);
            Voice.say(isShirt ? 'A red shirt!' : 'A blue hat!', { pitch: 1.6 });
            return true;
          },
          finish: () => talk([['pip', 'I am ready!'], ['narrator', 'You look great! Getting dressed by yourself is a good habit.']]),
        },
      ],
    },
    {
      name: 'Healthy & Tidy', icon: '\u{1F34E}', room: 'kitchen',
      intro: "Let's eat a healthy breakfast and keep things tidy!",
      summary: 'Eat healthy food, put your toys away, and pack your bag. Good habits keep us healthy and neat!',
      reset() {
        rooms.kitchen.visible = true;
        pip.group.position.copy(kit.pipSpot);
        Object.assign(pip.anim, { baseY: 0, lie: 0, sleep: false, face: null });
        pip.shirtM.color.set(0xff5a5a);
        pip.pantsM.color.set(0x2f74ff);
        pip.hat.visible = false;
        pip.dirt.forEach((d) => { d.visible = false; });
      },
      steps: [
        {
          icon: '\u{1F966}', prompt: 'Pick healthy food!', cam: [0, 1.4, -0.4, 2.6],
          say: 'Pip is hungry! Tap the healthy food to put it on Pip\'s plate. Fruit and vegetables make us strong!',
          start() {
            const good = shuffle(Object.keys(HEALTHY)).slice(0, 3);
            const bad = shuffle(Object.keys(SNACKS)).slice(0, 2);
            S.foods = shuffle(good.concat(bad)).map((kind, i) => {
              const f = makeFood(kind);
              f.position.set(-1.4 + i * 0.7, 1.08, 0.3);
              f.scale.setScalar(0.01);
              f.userData.tapId = kind;
              rooms.kitchen.add(f);
              S.kitchenObjs.push(f);
              tween(0.5, (k) => f.scale.setScalar(Math.max(0.01, ease.outBack(k) * 1.3)), null, i * 0.12);
              return f;
            });
            S.onPlate = 0;
          },
          targets: () => S.foods.filter((f) => !f.userData.used),
          need: 3,
          tap(f) {
            const kind = f.userData.kind;
            if (!HEALTHY[kind]) {
              Sound.boop();
              tween(0.6, (k) => { f.rotation.z = Math.sin(k * Math.PI * 6) * (1 - k) * 0.5; });
              if (Voice.quiet(1500)) Voice.say(SNACKS[kind] + ' is a sometimes treat. Pick a healthy food!');
              return false;
            }
            f.userData.used = true;
            const slot = S.onPlate++;
            const to = kit.plate.clone().add(new V3((slot - 1) * 0.22, 0, (slot % 2) * 0.08));
            flyTo(f, to, 0.6, 0.8, () => { Sound.yum(); sparkleAt(to.clone().add(new V3(0, 0.3, 0)), 8); }, 0.9);
            hop(pip, 0.3);
            Voice.say('Yummy, ' + HEALTHY[kind] + '!', { pitch: 1.6 });
            return true;
          },
          finish() {
            later(0.8, () => {
              S.foods.filter((f) => f.userData.used).forEach((f, i) => tween(0.4, (k) => f.scale.setScalar(0.9 * (1 - k) + 0.001), null, i * 0.35));
              [0, 0.35, 0.7].forEach((d) => later(d, () => Sound.yum()));
            });
            return talk([['pip', 'Yum yum!'], ['narrator', 'Healthy food makes us strong and happy!']]);
          },
        },
        {
          icon: '\u{1F9F8}', prompt: 'Put toys away!', cam: [4.5, 0.8, -0.5, 2.6],
          say: 'Toys are all over the floor! Tap each toy to put it in the toy box.',
          start() {
            walkTo(pip, new V3(3.8, 0, -1.3));
            S.toys = ['ball', 'block', 'teddy', 'car'].map((kind, i) => {
              const t = makeToy(kind);
              t.position.set([3.4, 4.6, 5.5, 6.5][i], 0, [0.7, 1.2, 0.4, 0.9][i]);
              t.rotation.y = rand(-0.6, 0.6);
              t.scale.setScalar(1.3);
              t.userData.tapId = kind;
              rooms.kitchen.add(t);
              S.kitchenObjs.push(t);
              return t;
            });
          },
          targets: () => S.toys.filter((t) => !t.userData.used),
          need: 4,
          tap(t) {
            t.userData.used = true;
            const n = game.step.count + 1;
            const to = kit.toyBox.clone().add(new V3(rand(-0.35, 0.35), 0, rand(-0.2, 0.2)));
            flyTo(t, to, 0.7, 1.4, () => { Sound.plop(n); sparkleAt(to.clone().add(new V3(0, 0.4, 0)), 8); }, 1.0);
            Voice.say(NUMBER_WORDS[n] + '!', { pitch: 1.4, rate: 1 });
            return true;
          },
          finish: () => talk([['pip', 'All tidy!'], ['narrator', 'Putting toys away keeps our room neat. Then we can find them again!']]),
        },
        {
          icon: '\u{1F392}', prompt: 'Pack your bag!', cam: [-4.4, 1.0, -1.0, 2.4],
          say: 'Let\'s get ready for school. Tap the book, the pencils, and the water bottle to pack the bag.',
          start() {
            walkTo(pip, new V3(0, 0, 1.3), () => walkTo(pip, new V3(-2.5, 0, -0.5)));
            S.school = ['book', 'pencils', 'bottle'].map((kind, i) => {
              const t = makeToy(kind);
              t.position.set(-5.8 + i * 0.6, 0.9, -1.55);
              t.scale.setScalar(1.3);
              t.userData.tapId = kind;
              rooms.kitchen.add(t);
              S.kitchenObjs.push(t);
              return t;
            });
          },
          targets: () => S.school.filter((t) => !t.userData.used),
          need: 3,
          tap(t) {
            t.userData.used = true;
            const n = game.step.count + 1;
            const to = kit.bag.position.clone().add(new V3(0, 0.9, 0));
            flyTo(t, to, 0.7, 1.0, () => { t.visible = false; Sound.plop(n); sparkleAt(to, 8); }, 0.5);
            Voice.say({ book: 'The book!', pencils: 'The pencils!', bottle: 'The water bottle!' }[t.userData.kind], { pitch: 1.6 });
            return true;
          },
          finish() {
            later(0.9, () => {
              flyTo(kit.bag, () => worldOf(pip.inner, 1.0).add(new V3(0, 0, -0.38)), 0.7, 0.6, () => {
                pip.inner.attach(kit.bag);
                kit.bag.position.set(0, 0.55, -0.4);
                kit.bag.rotation.set(0, 0, 0);
                cheer(pip);
              });
            });
            return talk([['pip', 'Ready for school!'], ['narrator', 'Packing your bag keeps you organized!']]);
          },
        },
      ],
    },
    {
      name: 'Helping Hands', icon: '\u{1F91D}', room: 'park',
      intro: "Let's go to the park and help our friends!",
      summary: 'Help carry, share your food, care for animals, and give things back. Being kind makes everyone happy!',
      reset() {
        rooms.park.visible = true;
        pip.group.position.set(-3.6, 0, 0.9);
        Object.assign(pip.anim, { baseY: 0, lie: 0, sleep: false, face: null, holdR: 0, armsFwd: 0 });
        pip.shirtM.color.set(0xff5a5a);
        pip.pantsM.color.set(0x2f74ff);
        pip.hat.visible = true;
        pip.dirt.forEach((d) => { d.visible = false; });
        grandma.group.position.set(-5.4, 0, 0.3);
        Object.assign(grandma.anim, { hunch: 0.25, sad: true, armsFwd: 0.6 });
        tia.group.position.set(-1.2, 0, -1.05);
        Object.assign(tia.anim, { sit: 1, baseY: 0.12, sad: true });
        grandpa.group.position.set(8.5, 0, 0.6);
        grandpa.hat.visible = true;
        grandpa.anim.sad = false;
        // Grandma's two heavy shopping bags
        S.bags = [-1, 1].map((s) => {
          const b = new THREE.Group();
          b.add(box(0.42, 0.45, 0.26, mat(s < 0 ? 0xffb020 : 0x2ecc71), 0, 0.23, 0, 0.05));
          const h = mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16, Math.PI), mat(0x555555));
          h.position.y = 0.45;
          b.add(h, blob(mat(0xff3b3b), -0.08, 0.5, 0, 0.08), blob(mat(0x3fbf3f), 0.08, 0.52, 0.02, 0.07));
          b.position.set(-5.4 + s * 0.65, 0, 0.95);
          b.userData.tapId = 'bag';
          rooms.park.add(b);
          S.parkObjs.push(b);
          return b;
        });
        S.chickens = [0, 1, 2].map((i) => {
          const c = makeChicken();
          c.position.set(1.9 + i * 1.1, 0, -1.3 + (i % 2) * 0.35);
          c.rotation.y = rand(-0.5, 0.5);
          c.userData.tapId = 'chicken';
          rooms.park.add(c);
          S.parkObjs.push(c);
          return c;
        });
        S.apple = makeFood('apple');
        S.apple.visible = false;
        S.apple.userData.tapId = 'apple';
        rooms.park.add(S.apple);
        S.parkObjs.push(S.apple);
      },
      steps: [
        {
          icon: '\u{1F6CD}️', prompt: 'Help Grandma!', cam: [-4.6, 1.2, 0.2, 2.6],
          say: 'Grandma\'s bags are very heavy. Tap the bags to help Grandma carry them home.',
          start() {},
          targets: () => S.bags.filter((b) => !b.userData.used),
          need: 2,
          tap(b) {
            b.userData.used = true;
            const n = game.step.count;
            Sound.whoosh();
            flyTo(b, () => worldOf(pip.hands[n ? 0 : 1], -0.4), 0.6, 0.6, () => { pip.hands[n ? 0 : 1].attach(b); b.position.set(0, -0.4, 0); b.rotation.set(0, 0, 0); });
            if (n === 1) { grandma.anim.hunch = 0; grandma.anim.armsFwd = 0; grandma.anim.sad = false; hop(grandma, 0.25); }
            Voice.say(n ? 'And this one!' : 'I can help!', { pitch: 1.7 });
            return true;
          },
          finish() {
            later(2.2, () => walkTo(pip, new V3(-5.9, 0, -1.4), () => {
              S.bags.forEach((b, i) => { rooms.park.attach(b); b.position.set(-6.6 + i * 0.4, 0, -1.9); b.rotation.set(0, 0, 0); });
              walkTo(pip, new V3(-3.0, 0, 0.6));
            }));
            return talk([['grandma', 'Thank you, Pip!'], ['pip', "You're welcome, Grandma!"], ['narrator', 'Helping others is kind!']]) + 2.5;
          },
        },
        {
          icon: '\u{1F34E}', prompt: 'Share with Tia!', cam: [-1.4, 1.0, -0.4, 2.4],
          say: 'Tia is sad. She has no snack. Pip has an apple. Tap the apple to share it with Tia!',
          start() {
            walkTo(pip, new V3(-0.1, 0, -0.4), () => {
              S.apple.visible = true;
              pip.hands[1].add(S.apple);
              S.apple.position.set(0, -0.1, 0.05);
              S.apple.scale.setScalar(1);
              pip.anim.holdR = 0.9;
            });
          },
          targets: () => [S.apple, tia.group],
          need: 1,
          tap() {
            pip.anim.holdR = 0;
            Sound.whoosh();
            flyTo(S.apple, () => worldOf(tia.hands[1], -0.15), 0.7, 0.6, () => {
              tia.hands[1].attach(S.apple);
              S.apple.position.set(0, -0.1, 0.05);
              tia.anim.sad = false;
              tia.anim.holdR = 0.9;
              Sound.yum();
              hop(tia, 0.3);
              sparkleAt(worldOf(tia.head), 16);
            });
            return true;
          },
          finish: () => talk([['tia', 'Thank you, Pip!'], ['pip', "You're welcome!"], ['narrator', 'Sharing is caring!']]),
        },
        {
          icon: '\u{1F414}', prompt: 'Feed the chickens!', cam: [2.6, 0.8, -0.8, 3.0],
          say: 'The chickens are hungry. Tap each chicken to give it some corn.',
          start() { walkTo(pip, new V3(0.9, 0, 0.3)); },
          targets: () => S.chickens.filter((c) => !c.userData.used),
          need: 3,
          tap(c) {
            c.userData.used = true;
            const n = game.step.count + 1;
            const at = c.position.clone().add(new V3(0, 0, 0.45));
            burst(worldOf(pip.hands[1]), [0xffd21f, 0xffb020], 16, { geo: dropGeo, dir: at.clone().sub(worldOf(pip.hands[1])).normalize(), speed: 3.5, life: 1.6, gravity: 6, spread: 0.5, floor: 0.04 });
            later(0.5, () => {
              Sound.cluck();
              const h = c.userData.head;
              tween(1.2, (k) => { h.rotation.x = Math.abs(Math.sin(k * Math.PI * 4)) * 0.9; c.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.08; });
            });
            Voice.say(NUMBER_WORDS[n] + '!', { pitch: 1.4, rate: 1 });
            return true;
          },
          finish: () => talk([['narrator', 'Cluck cluck! The chickens are happy. Taking care of animals is kind!']]),
        },
        {
          icon: '\u{1F452}', prompt: 'Give the hat back!', cam: [5.6, 1.2, 0.2, 2.7],
          say: 'Oops! Grandpa dropped his hat. Tap the hat to give it back to Grandpa.',
          start() {
            walkTo(pip, new V3(4.4, 0, 1.0));
            walkTo(grandpa, new V3(6.4, 0, 0.6), null, 1.2);
            later(0.9, () => {
              grandpa.hat.visible = false;
              S.hat = new THREE.Group();
              const hm = mat(0xc98a4a, { roughness: 0.5 });
              S.hat.add(new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hm), cyl(0.3, 0.3, 0.04, hm, 0, 0.02, 0.38));
              S.hat.scale.setScalar(1.15);
              S.hat.userData.tapId = 'hat';
              S.hat.position.copy(worldOf(grandpa.head, 0.3));
              rooms.park.add(S.hat);
              S.parkObjs.push(S.hat);
              const from = S.hat.position.clone();
              const to = new V3(7.4, 0.1, 1.3);
              Sound.boop();
              tween(0.8, (k) => { S.hat.position.lerpVectors(from, to, k); S.hat.position.y += Math.sin(Math.PI * k) * 0.4; S.hat.rotation.z = k * 2.5; }, () => { S.hat.rotation.set(0.4, 0, 0.2); });
            });
          },
          targets: () => (S.hat ? [S.hat] : []),
          need: 1,
          tap() {
            Sound.whoosh();
            flyTo(S.hat, () => worldOf(grandpa.head, 0.12), 0.8, 1.2, () => {
              S.hat.visible = false;
              grandpa.hat.visible = true;
              grandpa.anim.face = null;
              hop(grandpa, 0.25);
              sparkleAt(worldOf(grandpa.head, 0.4), 14);
            });
            return true;
          },
          finish: () => talk([['grandpa', 'My hat! Thank you, Pip!'], ['pip', "You're welcome, Grandpa!"], ['narrator', 'Giving things back is kind!']]),
        },
      ],
    },
  ];

  // ---------------------------------------------------------------- flow
  function camTo(c) {
    const [x, y, z, halfW] = c;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(4.8, halfW / (tanH * aspect), 2.2 / tanH);
    camLookTarget.set(x, y, z);
    camPosTarget.set(x, y + dist * 0.36, z + dist * 0.93);
  }
  let currentCam = [0, 1.2, 0, 3];

  function startLevel(i) {
    timers = [];
    tweens = [];
    game.level = i;
    game.stepIdx = 0;
    game.step = null;
    cleanup();
    Object.values(rooms).forEach((r) => { r.visible = false; });
    LEVELS[i].reset();
    const first = LEVELS[i].steps[0];
    currentCam = first.cam;
    camTo(first.cam);
    camPos.copy(camPosTarget);
    camLook.copy(camLookTarget);
    buildTracker();
    markTracker();
    show('play');
    showPrompt(LEVELS[i].icon, LEVELS[i].name);
    banner(LEVELS[i].icon + '<b>' + LEVELS[i].name + '</b>');
    Sound.fanfare();
    Voice.say(LEVELS[i].intro);
    later(Voice.time(LEVELS[i].intro) + 0.3, () => runStep(0));
  }

  // Put everything back where it belongs so levels never leak into each other.
  function cleanup() {
    (S.kitchenObjs || []).concat(S.parkObjs || []).forEach((o) => { if (o.parent) o.parent.remove(o); });
    S.kitchenObjs = [];
    S.parkObjs = [];
    S.hat = null;
    [bed.shirt, bed.hat, bed.brush].forEach((o) => rooms.bed.attach(o));
    rooms.kitchen.attach(kit.bag);
    kit.bag.position.copy(kit.bagHome);
    kit.bag.rotation.set(0, 0, 0);
    kit.bag.visible = true;
    Object.assign(pip.anim, { holdR: 0, armsFwd: 0, armsUp: 0, jump: 0, wave: 0, walking: false, face: null, sad: false });
    pip.mouth.visible = true;
    pip.mouthOpen.visible = false;
    pip.teeth.visible = false;
    tia.anim.holdR = 0;
  }

  function runStep(j) {
    const def = LEVELS[game.level].steps[j];
    game.stepIdx = j;
    game.step = { def, count: 0, locked: true, complete: false };
    game.idle = 0;
    game.idleCount = 0;
    currentCam = def.cam;
    camTo(def.cam);
    markTracker();
    showPrompt(def.icon, def.prompt);
    def.start();
    Voice.say(def.say);
    // Let the child tap as soon as the instruction has been heard (or sooner, after a short pause).
    later(Math.min(Voice.time(def.say), 3.5), () => { if (game.step && game.step.def === def) game.step.locked = false; });
  }

  function onTarget(target) {
    const st = game.step;
    if (!st || st.locked || st.complete) return;
    game.idle = 0;
    if (!st.def.tap(target)) return;
    st.count += 1;
    if (st.count >= st.def.need) completeStep();
  }

  function completeStep() {
    const st = game.step;
    st.complete = true;
    markTracker();
    Sound.ding();
    const sayFor = st.def.finish() || 2;
    later(0.6, () => { burst(worldOf(pip.head, 0.6), CONFETTI, 30, { speed: 3.5 }); awardStar(worldOf(pip.head, 0.6)); });
    const steps = LEVELS[game.level].steps;
    later(sayFor + 0.8, () => {
      if (game.stepIdx + 1 < steps.length) runStep(game.stepIdx + 1);
      else levelComplete();
    });
  }

  function levelComplete() {
    const L = LEVELS[game.level];
    game.step = null;
    game.done[game.level] = true;
    store.set('habitsDone', game.done);
    Sound.fanfare();
    confettiRain(150);
    cheer(pip);
    later(1, () => cheer(pip));
    camTo(currentCam);
    ui.doneText.textContent = L.name + '!';
    ui.doneSteps.textContent = L.steps.map((s) => s.icon).join(' ');
    ui.nextBtn.classList.toggle('hidden', false);
    later(1.2, () => {
      ui.levelDone.classList.remove('hidden');
      Voice.say(L.summary);
    });
    renderCards();
  }

  function show(screen) {
    game.screen = screen;
    ui.start.classList.toggle('hidden', screen !== 'start');
    ui.select.classList.toggle('hidden', screen !== 'select');
    ui.hud.classList.toggle('hidden', screen !== 'play');
    ui.levelDone.classList.add('hidden');
    if (screen !== 'play') ui.finger.classList.add('hidden');
  }
  function renderCards() {
    document.querySelectorAll('.level-card').forEach((btn) => {
      const i = Number(btn.dataset.level);
      let check = btn.querySelector('.check');
      if (game.done[i] && !check) {
        check = document.createElement('i');
        check.className = 'check';
        check.textContent = '⭐';
        btn.appendChild(check);
      }
    });
  }
  renderCards();

  // Title-screen backdrop: Pip waving in the bedroom.
  function showBackdrop() {
    Object.values(rooms).forEach((r) => { r.visible = false; });
    rooms.bed.visible = true;
    LEVELS[0].reset();
    Object.assign(pip.anim, { baseY: 0, lie: 0, sleep: false, wave: 1 });
    pip.group.position.set(-0.6, 0, 0.6);
    pip.dirt.forEach((d) => { d.visible = false; });
    bed.clock.userData.ringing = false;
    setPose(bed.blanket, bed.blanketNeat);
    currentCam = [-0.8, 1.5, -0.4, 3.2];
    camTo(currentCam);
    camPos.copy(camPosTarget);
    camLook.copy(camLookTarget);
  }

  $('playBtn').addEventListener('click', () => {
    Sound.unlock();
    Voice.init();
    show('select');
    Sound.fanfare();
    cheer(pip);
    Voice.say("Hi! I'm Pip! Let's learn good habits together. Pick a game!", { pitch: 1.5 });
  });
  document.querySelectorAll('.level-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.unlock();
      Sound.ding();
      pip.anim.wave = 0;
      startLevel(Number(btn.dataset.level));
    });
  });
  $('homeBtn').addEventListener('click', () => {
    Sound.boop();
    Voice.stop();
    timers = [];
    tweens = [];
    game.step = null;
    cleanup();
    showBackdrop();
    show('select');
  });
  $('replayBtn').addEventListener('click', () => { Sound.ding(); startLevel(game.level); });
  ui.nextBtn.addEventListener('click', () => { Sound.ding(); startLevel((game.level + 1) % LEVELS.length); });
  ui.prompt.addEventListener('click', () => {
    game.idle = 0;
    if (game.step && !game.step.complete) Voice.say(game.step.def.say);
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

  // ---------------------------------------------------------------- input
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function rootIn(obj, roots) {
    let o = obj;
    while (o && !roots.includes(o)) o = o.parent;
    return o;
  }
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (game.screen !== 'play') return;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const st = game.step;
    const targets = st && !st.locked && !st.complete ? st.def.targets() : [];
    let hit = null;
    if (targets.length) {
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length) hit = rootIn(hits[0].object, targets);
      if (!hit) {
        // Forgiving taps: anything close to the finger counts.
        let best = Infinity;
        const reach = Math.max(70, Math.min(window.innerWidth, window.innerHeight) * 0.12);
        targets.forEach((t) => {
          const p = screenPos(worldOf(t, t === pip.group ? 1.6 : 0.2));
          const d = Math.hypot(p.x - e.clientX, p.y - e.clientY);
          if (d < reach && d < best) { best = d; hit = t; }
        });
      }
    }
    if (hit) return onTarget(hit);
    const ph = raycaster.intersectObject(pip.group, true);
    if (ph.length) {
      Sound.tone(900, 0.1, 'sine', 0.2, 0, 1300);
      hop(pip, 0.35, 0.4);
      return;
    }
    sparkleAt(raycaster.ray.at(6, new V3()), 8);
    Sound.tone(rand(1200, 1800), 0.15, 'sine', 0.08);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---------------------------------------------------------------- resize & loop
  let aspect = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camTo(currentCam);
  }
  window.addEventListener('resize', resize);

  const clock = new THREE.Clock();
  let time = 0, nextZ = 0, nextRing = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    stepTimers(dt);
    stepTweens(dt);
    stepParticles(dt);
    cast.forEach((p) => { if (p.group.parent && (p === pip || rooms.park.visible)) animPerson(p, time, dt); });

    if (pip.anim.sleep && time > nextZ) {
      nextZ = time + 0.9;
      floatZ(worldOf(pip.head, 0.5));
    }
    if (bed.clock.userData.ringing) {
      bed.clock.rotation.z = Math.sin(time * 45) * 0.12;
      bed.clock.position.y = 1.16 + Math.abs(Math.sin(time * 30)) * 0.03;
      if (time > nextRing) { nextRing = time + 0.5; Sound.ring(); }
    }

    // The pointing finger shows where to tap.
    const st = game.step;
    if (game.screen === 'play' && st && !st.locked && !st.complete) {
      const ts = st.def.targets().filter((t) => t !== pip.group);
      if (ts.length) {
        const p = screenPos(worldOf(ts[0], 0.1));
        ui.finger.style.left = p.x + 'px';
        ui.finger.style.top = (p.y + 10) + 'px';
        ui.finger.classList.remove('hidden');
        ui.finger.classList.toggle('eager', game.idleCount > 0);
      } else ui.finger.classList.add('hidden');
      game.idle += dt;
      if (game.idle > 9) {
        game.idle = 0;
        game.idleCount += 1;
        Voice.say(st.def.say);
        hop(pip, 0.3);
      }
    } else {
      ui.finger.classList.add('hidden');
    }

    const k = 1 - Math.exp(-dt * 2.5);
    camPos.lerp(camPosTarget, k);
    camLook.lerp(camLookTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(camLook.x + 4, 10, camLook.z + 8);
    sun.target.position.copy(camLook);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  showBackdrop();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline cache unavailable */ });
    });
  }

  // Exposed for automated smoke tests only.
  window.__habits = { game, LEVELS, onTarget, startLevel };
})();
