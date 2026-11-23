/* aurentis */
(function () {
  'use strict';
class Sky {
  constructor(props) { this.props = props; }

  renderVals() {
    if (!this._setCanvas) {
      this._setCanvas = (el) => { if (el) this._canvas = el; };
    }
    return { setCanvas: this._setCanvas };
  }

  componentDidMount() {
    this._alive = true;
    this._boot(0);
  }

  componentDidUpdate() {
    if (!this._ptr) return;
    const p = this.props || {};
    if (p.farbe !== this._pFarbe) {
      this._pFarbe = p.farbe;
      this._rgb = this._hex(p.farbe) || [223, 230, 255];
    }
    if (p.dichte !== this._pDichte || p.licht !== this._pLicht) this._applyProps(true);
  }

  componentWillUnmount() {
    this._alive = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    if (this._onWinResize) window.removeEventListener('resize', this._onWinResize);
    if (this._fontTimer) clearTimeout(this._fontTimer);
    const c = this._canvas;
    if (c && this._handlers) {
      for (let i = 0; i < this._handlers.length; i++) c.removeEventListener(this._handlers[i][0], this._handlers[i][1]);
    }
  }

  _boot(tries) {
    if (!this._alive) return;
    let c = this._canvas;
    if (!c) c = document.querySelector('canvas[data-aurentis]');
    if (!c || !c.getContext) {
      if (tries < 120) requestAnimationFrame(() => this._boot(tries + 1));
      return;
    }
    this._canvas = c;
    this._ctx = c.getContext('2d');
    if (!this._ctx) return;
    this._reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this._ptr = { x: 0, y: 0, lx: 0, ly: 0, vx: 0, vy: 0, t: 0, has: false, inside: false, down: false, light: 0 };
    this._mcache = new Map();
    this._wordG = 0;
    this._applyProps(false);
    if (!this._passive) this._attach(c);
    this._resize();
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(c);
    } else {
      this._onWinResize = () => this._resize();
      window.addEventListener('resize', this._onWinResize);
    }
    this._loadFont();
    this._last = performance.now();
    const loop = (now) => {
      if (!this._alive) return;
      this._raf = requestAnimationFrame(loop);
      this._frame(now);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _applyProps(rebuild) {
    const p = this.props || {};
    this._pFarbe = p.farbe;
    this._pDichte = p.dichte;
    this._pLicht = p.licht;
    this._rgb = this._hex(p.farbe) || [223, 230, 255];
    this._density = this._num(p.dichte, 1, 0.3, 3);
    this._lightK = this._num(p.licht, 1, 0.4, 3);
    if (rebuild && this._W) this._build();
  }

  _num(v, d, lo, hi) {
    let n = d;
    if (typeof v === 'number' && isFinite(v)) n = v;
    else if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) n = +v;
    return Math.min(hi, Math.max(lo, n));
  }

  _hex(h) {
    if (typeof h !== 'string') return null;
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    let s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  _attach(c) {
    const P = this._ptr;
    const at = (e) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const enter = (x, y, now) => {
      P.x = x; P.y = y; P.lx = x; P.ly = y;
      P.vx = 0; P.vy = 0; P.t = now;
      P.has = true; P.inside = true;
    };
    const move = (e) => {
      const isMouse = !e.pointerType || e.pointerType === 'mouse';
      if (!isMouse && !P.down) return;
      const q = at(e);
      const now = performance.now();
      if (!P.inside) { enter(q[0], q[1], now); return; }
      const dts = Math.max(0.008, (now - P.t) / 1000);
      let ivx = (q[0] - P.x) / dts;
      let ivy = (q[1] - P.y) / dts;
      const sp = Math.hypot(ivx, ivy);
      if (sp > 3200) { ivx *= 3200 / sp; ivy *= 3200 / sp; }
      P.vx = P.vx * 0.5 + ivx * 0.5;
      P.vy = P.vy * 0.5 + ivy * 0.5;
      P.x = q[0]; P.y = q[1]; P.t = now;
    };
    const down = (e) => {
      const q = at(e);
      P.down = true;
      if (!P.inside) enter(q[0], q[1], performance.now());
      else { P.x = q[0]; P.y = q[1]; }
    };
    const up = (e) => {
      P.down = false;
      if (e.pointerType && e.pointerType !== 'mouse') P.inside = false;
    };
    const leave = () => { P.down = false; P.inside = false; };
    this._handlers = [['pointermove', move], ['pointerdown', down], ['pointerup', up], ['pointerleave', leave], ['pointercancel', leave]];
    for (let i = 0; i < this._handlers.length; i++) window.addEventListener(this._handlers[i][0], this._handlers[i][1], { passive: true });
    document.documentElement.addEventListener('pointerleave', leave, { passive: true });
    window.addEventListener('blur', leave);
  }

  _resize() {
    const c = this._canvas;
    if (!c || !this._ctx) return;
    const r = c.getBoundingClientRect();
    const W = Math.max(1, Math.round(r.width));
    const H = Math.max(1, Math.round(r.height));
    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const maxPx = 5200000;
    if (W * H * dpr * dpr > maxPx) dpr = Math.max(1, Math.sqrt(maxPx / (W * H)));
    if (W === this._W && H === this._H && dpr === this._dpr) return;
    this._W = W; this._H = H; this._dpr = dpr;
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._build();
  }

  _build() {
    const W = this._W, H = this._H, mn = Math.min(W, H);
    const rnd = Math.random;
    this._R = Math.max(70, Math.min(165, mn * 0.135)) * this._lightK;
    this._cx = W / 2;
    this._cy = H / 2;
    const rad = Math.hypot(W, H) / 2 + 20;
    const nStars = Math.min(9000, Math.round(Math.PI * rad * rad / 420));
    const S = new Float32Array(nStars * 6);
    for (let i = 0; i < nStars; i++) {
      const a = rnd() * Math.PI * 2, r = rad * Math.sqrt(rnd()), o = i * 6;
      const spark = rnd() < 0.15;
      S[o] = Math.cos(a) * r;
      S[o + 1] = Math.sin(a) * r;
      S[o + 2] = rnd() < 0.9 ? 0.7 : 1.25;
      S[o + 3] = 0.035 + rnd() * rnd() * 0.45;
      S[o + 4] = spark ? 2.5 + rnd() * 4 : 0.3 + rnd() * 1.6;
      S[o + 5] = rnd() * 6.2832;
    }
    this._stars = S;
    this._nStars = nStars;
    const nNets = Math.max(14, Math.min(700, Math.round(W * H / 8000 * this._density)));
    const nets = [];
    for (let i = 0; i < nNets; i++) nets.push(this._net(W, H));
    this._nets = nets;
    this._signs = this._placeSigns(W, H);
    const wfs = Math.max(18, Math.min(26, mn * 0.026));
    this._wordFont = '400 ' + wfs.toFixed(1) + 'px "Iowan Old Style", ui-serif, Baskerville, "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif';
    this._wordTrack = wfs * 0.02;
    this._wordSize = wfs;
    this._wordG = 0;
  }

  _net(W, H) {
    const rnd = Math.random;
    const d = rnd();
    const big = rnd() < 0.1;
    const rad = (big ? 18 + rnd() * 12 : 6 + rnd() * 13) * (0.6 + 0.6 * d);
    const k = big ? 6 + Math.floor(rnd() * 4) : 3 + Math.floor(rnd() * 5);
    const nodes = [];
    for (let i = 0; i < k; i++) {
      const a = rnd() * Math.PI * 2, r = rad * (0.25 + 0.75 * Math.sqrt(rnd()));
      nodes.push({ ox: Math.cos(a) * r, oy: Math.sin(a) * r, ph: rnd() * 6.2832, tw: 0.5 + rnd() * 2.2 });
    }
    const edges = [];
    const seen = {};
    const link = (i, j) => {
      if (i === j) return;
      const key = i < j ? i + '_' + j : j + '_' + i;
      if (seen[key]) return;
      seen[key] = 1;
      edges.push(i, j);
    };
    for (let i = 0; i < k; i++) {
      const ds = [];
      for (let j = 0; j < k; j++) {
        if (j === i) continue;
        const dx = nodes[i].ox - nodes[j].ox, dy = nodes[i].oy - nodes[j].oy;
        ds.push([dx * dx + dy * dy, j]);
      }
      ds.sort((p, q) => p[0] - q[0]);
      if (ds.length) link(i, ds[0][1]);
      if (ds.length > 1 && rnd() < 0.7) link(i, ds[1][1]);
      if (ds.length > 2 && rnd() < 0.2) link(i, ds[2][1]);
    }
    const ang = rnd() * Math.PI * 2;
    const spd = (2 + rnd() * 6) * (0.45 + 0.9 * d);
    return {
      x: rnd() * W, y: rnd() * H, d: d, rad: rad,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ex: 0, ey: 0,
      rot: rnd() * 6.2832, vr: (rnd() - 0.5) * 0.25, er: 0,
      wf: 0.06 + rnd() * 0.2, wp: rnd() * 6.2832, wa: 3 + rnd() * 10 * (0.5 + d),
      wf2: 0.05 + rnd() * 0.18, wp2: rnd() * 6.2832, wa2: 2 + rnd() * 9 * (0.5 + d),
      bf: 0.25 + rnd() * 0.8, tw: 0.15 + rnd() * 0.7,
      alpha: 0.09 + 0.2 * d + rnd() * 0.05,
      lw: 0.45 + 0.4 * d, ns: 0.9 + 0.9 * d,
      nodes: nodes, edges: edges,
      X: new Float32Array(k), Y: new Float32Array(k)
    };
  }

  _lib() {
    if (this._libCache) return this._libCache;
    this._libCache = [
      { n: 'Prometheus', s: 'das Feuer', p: [[0,-1],[-0.32,-0.42],[-0.55,0.15],[-0.42,0.62],[0,0.88],[0.42,0.62],[0.55,0.15],[0.3,-0.3],[0.05,-0.15],[0.02,0.5]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0,8,9] },
      { n: 'Platon', s: 'das Höhlengleichnis', p: [[-1,0.8],[-0.88,0.05],[-0.5,-0.5],[0.05,-0.68],[0.58,-0.45],[0.9,0.08],[1,0.8],[0.42,0.62],[0.52,0.4],[0.62,0.62],[-0.35,0.25],[-0.35,0.75]], e: [0,1,1,2,2,3,3,4,4,5,5,6,7,8,8,9,9,7,10,11] },
      { n: 'Heraklit', s: 'panta rhei', p: [[-1,-0.2],[-0.6,-0.55],[-0.2,-0.2],[0.2,0.15],[0.6,-0.2],[1,-0.55],[-1,0.45],[-0.6,0.1],[-0.2,0.45],[0.2,0.8],[0.6,0.45],[1,0.1]], e: [0,1,1,2,2,3,3,4,4,5,6,7,7,8,8,9,9,10,10,11] },
      { n: 'Sokrates', s: 'ich weiß, dass ich nichts weiß', p: [[-0.45,-0.5],[-0.3,-0.85],[0.1,-0.98],[0.45,-0.7],[0.4,-0.3],[0.05,0],[0,0.4],[0,0.88]], e: [0,1,1,2,2,3,3,4,4,5,5,6] },
      { n: 'Descartes', s: 'cogito, ergo sum', p: [[-0.85,-1],[-0.85,0.75],[1,0.75],[0.35,-0.25],[-0.85,-0.25],[0.35,0.75]], e: [0,1,1,2,3,4,3,5] },
      { n: 'Kant', s: 'sapere aude', p: [[-1,0],[-0.5,-0.42],[0,-0.55],[0.5,-0.42],[1,0],[0.5,0.42],[0,0.55],[-0.5,0.42],[0,0]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0] },
      { n: 'Ockham', s: 'das Rasiermesser', p: [[-1,0.18],[-0.35,0.06],[0.3,-0.06],[1,-0.18]], e: [0,1,1,2,2,3] },
      { n: 'Archimedes', s: 'gebt mir einen festen Punkt', p: [[-1,-0.3],[-0.35,-0.12],[0.25,0.04],[0.95,0.22],[0.05,0.55],[0.45,0.55]], e: [0,1,1,2,2,3,2,4,4,5,5,2] },
      { n: 'Leibniz', s: 'das Binärsystem · 1703', p: [[-0.45,-0.72],[-0.16,-0.36],[-0.16,0.36],[-0.45,0.72],[-0.74,0.36],[-0.74,-0.36],[0.5,-0.72],[0.5,0],[0.5,0.72],[0.28,-0.48]], e: [0,1,1,2,2,3,3,4,4,5,5,0,6,7,7,8,6,9] },
      { n: 'Ada Lovelace', s: 'der erste Algorithmus · 1843', p: [[0.575,0.482],[0,0.75],[-0.575,0.482],[-0.739,-0.13],[-0.375,-0.65],[0.257,-0.705],[0.705,-0.257],[0.757,-0.553],[0.475,-0.45]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,6,8] },
      { n: 'Boole', s: 'wahr · falsch · 1854', p: [[-0.55,-0.6],[0.1,-0.6],[0.48,-0.38],[0.62,0],[0.48,0.38],[0.1,0.6],[-0.55,0.6],[-1,-0.3],[-0.55,-0.3],[-1,0.3],[-0.55,0.3],[1,0]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,0,7,8,9,10,3,11] },
      { n: 'Turing', s: 'die Maschine · 1936', p: [[-1,-0.25],[-0.5,-0.25],[0,-0.25],[0.5,-0.25],[1,-0.25],[-1,0.25],[-0.5,0.25],[0,0.25],[0.5,0.25],[1,0.25],[0,0.48],[-0.18,0.78],[0.18,0.78]], e: [0,1,1,2,2,3,3,4,5,6,6,7,7,8,8,9,0,5,1,6,2,7,3,8,4,9,10,11,11,12,12,10] },
      { n: 'Shannon', s: 'das Bit · 1948', p: [[-1,0.4],[-0.6,0.4],[-0.6,-0.4],[-0.2,-0.4],[-0.2,0.4],[0.2,0.4],[0.2,-0.4],[0.6,-0.4],[0.6,0.4],[1,0.4]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9] },
      { n: 'Transformer', s: 'Attention · 2017', p: [[-0.75,-0.55],[-0.25,-0.55],[0.25,-0.55],[0.75,-0.55],[-0.75,0.55],[-0.25,0.55],[0.25,0.55],[0.75,0.55]], e: [0,4,0,5,0,6,1,4,1,5,1,7,2,5,2,6,2,7,3,4,3,6,3,7] },
      { n: 'Perzeptron', s: 'Rosenblatt · 1958', p: [[-1,-0.65],[-1,0],[-1,0.65],[-0.1,0],[0.55,0],[1,-0.3],[1,0.3]], e: [0,3,1,3,2,3,3,4,4,5,4,6] },
      { n: 'Gutenberg', s: 'der Buchdruck · um 1450', p: [[0,-0.42],[0,0.62],[-0.95,-0.6],[-0.95,0.45],[-0.48,-0.62],[-0.48,0.5],[0.95,-0.6],[0.95,0.45],[0.48,-0.62],[0.48,0.5]], e: [0,1,0,4,4,2,2,3,3,5,5,1,0,8,8,6,6,7,7,9,9,1] },
      { n: 'Galilei', s: 'das Fernrohr · 1609', p: [[-0.95,0.05],[0.75,-0.65],[-0.85,0.3],[0.85,-0.4],[0,-0.05],[-0.45,0.95],[0.42,0.95]], e: [0,1,2,3,0,2,1,3,4,5,4,6] },
      { n: 'Newton', s: 'die Schwerkraft · 1687', p: [[0.893,-0.325],[0.741,0.069],[0.154,0.423],[-0.523,0.529],[-0.893,0.325],[-0.741,-0.069],[-0.154,-0.423],[0.523,-0.529],[0.28,-0.1]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0] },
      { n: 'Einstein', s: 'E = mc² · 1905', p: [[-0.7,-0.75],[0,-0.92],[0.7,-0.75],[0,-0.58],[-0.7,0.75],[0,0.58],[0.7,0.75],[0,0.92],[0,0]], e: [0,1,1,2,2,3,3,0,4,5,5,6,6,7,7,4,0,8,2,8,4,8,6,8] },
      { n: 'Doppelhelix', s: 'die DNA · 1953', p: [[-1,0],[-0.667,-0.433],[-0.333,-0.433],[0,0],[0.333,0.433],[0.667,0.433],[1,0],[-0.667,0.433],[-0.333,0.433],[0.333,-0.433],[0.667,-0.433]], e: [0,1,1,2,2,3,3,4,4,5,5,6,0,7,7,8,8,3,3,9,9,10,10,6,1,7,2,8,4,9,5,10] },
      { n: 'Apollo 11', s: 'der Mond · 1969', p: [[0.375,0.65],[-0.257,0.705],[-0.705,0.257],[-0.65,-0.375],[-0.13,-0.739],[0.375,-0.65],[0,-0.45],[-0.2,0],[0,0.45],[0.98,0.88],[0.66,0.28]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,0,9,10] },
      { n: 'das Rad', s: 'um 3500 v. Chr.', p: [[0.85,0],[0.601,0.601],[0,0.85],[-0.601,0.601],[-0.85,0],[-0.601,-0.601],[0,-0.85],[0.601,-0.601],[0,0]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0,8,0,8,2,8,4,8,6] },
      { n: 'die Null', s: 'Brahmagupta · 628', p: [[0,-0.9],[0.42,-0.64],[0.6,0],[0.42,0.64],[0,0.9],[-0.42,0.64],[-0.6,0],[-0.42,-0.64]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0] },
      { n: 'Pythagoras', s: 'a² + b² = c²', p: [[-0.8,0.65],[0.85,0.65],[-0.8,-0.7],[-0.55,0.65],[-0.55,0.4],[-0.8,0.4]], e: [0,1,1,2,2,0,3,4,4,5] },
      { n: 'Edison', s: 'die Glühbirne · 1879', p: [[-0.389,0.089],[-0.55,-0.3],[-0.389,-0.689],[0,-0.85],[0.389,-0.689],[0.55,-0.3],[0.389,0.089],[-0.22,0.45],[0.22,0.45],[-0.22,0.75],[0.22,0.75],[-0.18,-0.15],[0,-0.38],[0.18,-0.15]], e: [0,1,1,2,2,3,3,4,4,5,5,6,0,7,6,8,7,8,7,9,8,10,9,10,11,12,12,13] },
      { n: 'Ikarus', s: 'der Traum vom Fliegen', p: [[-0.9,0.35],[0.95,-0.7],[0.75,-0.1],[0.45,0.28],[0.1,0.55],[-0.3,0.68]], e: [0,1,1,2,2,3,3,4,4,5,5,0,0,2,0,3,0,4] },
      { n: 'ARPANET', s: 'das Netz · 1969', p: [[0,-0.85],[0.74,-0.42],[0.74,0.42],[0,0.85],[-0.74,0.42],[-0.74,-0.42],[0,0]], e: [0,1,1,2,2,3,3,4,4,5,5,0,6,0,6,2,6,4,1,4] },
      { n: 'Transistor', s: 'Bell Labs · 1947', p: [[-1,0],[-0.35,0],[-0.35,-0.5],[-0.35,0.5],[-0.35,-0.22],[0.45,-0.72],[-0.35,0.22],[0.45,0.72],[0.45,-1],[0.45,1]], e: [0,1,2,3,4,5,6,7,5,8,7,9] },
      { n: 'Laozi', s: 'das Tao', p: [[0.85,0],[0.601,0.601],[0,0.85],[-0.601,0.601],[-0.85,0],[-0.601,-0.601],[0,-0.85],[0.601,-0.601],[0.425,-0.425],[0,0],[-0.425,0.425],[0,-0.425],[0,0.425]], e: [0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,0,6,8,8,9,9,10,10,2] },
      { n: 'Sisyphos', s: 'Camus · 1942', p: [[-1,0.85],[-0.2,0.25],[0.45,-0.3],[1,0.2],[0.12,-0.52],[0.32,-0.32],[0.12,-0.12],[-0.08,-0.32]], e: [0,1,1,2,2,3,4,5,5,6,6,7,7,4] },
      { n: 'Euklid', s: 'die Elemente', p: [[-0.3,0.1],[0.3,0.1],[0,-0.42],[0,0.62],[-0.6,0.62],[-0.9,0.1],[-0.6,-0.42],[0.9,0.1],[0.6,0.62],[0.6,-0.42]], e: [1,3,3,4,4,5,5,6,6,2,2,1,7,8,8,3,3,0,0,2,2,9,9,7,0,1] }
    ];
    return this._libCache;
  }

  _placeSigns(W, H) {
    const rnd = Math.random;
    const mn = Math.min(W, H);
    const SR = Math.max(17, Math.min(34, mn * 0.032));
    const lib = this._lib();
    const order = [];
    for (let i = 0; i < lib.length; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const max = Math.max(5, Math.min(lib.length, Math.round(W * H / 38000)));
    const minD = SR * 4.6, cx = W / 2, cy = H / 2, keep = SR * 3 + 70;
    const out = [];
    for (let oi = 0; oi < order.length && out.length < max; oi++) {
      const def = lib[order[oi]];
      for (let tr = 0; tr < 40; tr++) {
        const x = SR * 1.6 + rnd() * Math.max(1, W - SR * 3.2);
        const y = SR * 1.6 + rnd() * Math.max(1, H - SR * 3.2 - 24);
        if (Math.hypot(x - cx, y - cy) < keep) continue;
        let ok = true;
        for (let k = 0; k < out.length; k++) {
          if (Math.hypot(out[k].x - x, out[k].y - y) < minD) { ok = false; break; }
        }
        if (!ok) continue;
        out.push(this._sign(def, x, y, SR));
        break;
      }
    }
    return out;
  }

  _sign(def, x, y, SR) {
    const rnd = Math.random;
    const sc = SR * (0.88 + rnd() * 0.24);
    const pts = def.p, k = pts.length;
    const nodes = [];
    for (let i = 0; i < k; i++) {
      nodes.push({ ox: pts[i][0] * sc, oy: pts[i][1] * sc, ph: rnd() * 6.2832, tw: 0.4 + rnd() * 1.6, sz: 1 + rnd() * 1.1 });
    }
    const ang = rnd() * Math.PI * 2, spd = 1 + rnd() * 2.2;
    return {
      nameU: def.n.toUpperCase(), sub: def.s,
      x: x, y: y, px: x, py: y, d: 0.55 + rnd() * 0.45, sc: sc,
      vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, ex: 0, ey: 0,
      rot: (rnd() - 0.5) * 0.4, sw: 0.03 + rnd() * 0.05, swf: 0.08 + rnd() * 0.12, swp: rnd() * 6.2832,
      wf: 0.05 + rnd() * 0.12, wp: rnd() * 6.2832, wa: 2 + rnd() * 5,
      wf2: 0.05 + rnd() * 0.1, wp2: rnd() * 6.2832, wa2: 2 + rnd() * 4,
      alpha: 0.2 + rnd() * 0.08, lg: 0,
      nodes: nodes, edges: def.e,
      X: new Float32Array(k), Y: new Float32Array(k)
    };
  }

  _loadFont() {
    let tries = 0;
    const attempt = () => {
      if (!this._alive) return;
      tries++;
      let pr = null;
      try {
        if (document.fonts && document.fonts.load) {
          pr = null;
        }
      } catch (err) {
        pr = null;
      }
      if (!pr) return;
      pr.then((res) => {
        if (!this._alive) return;
        const ok = res && ((res[0] && res[0].length) || (res[1] && res[1].length));
        if (ok) {
          this._mcache = new Map();
          this._fontTimer = setTimeout(() => { this._mcache = new Map(); }, 1500);
        } else if (tries < 20) {
          this._fontTimer = setTimeout(attempt, 300);
        }
      }, () => {
        if (this._alive && tries < 20) this._fontTimer = setTimeout(attempt, 300);
      });
    };
    attempt();
  }

  _text(ctx, str, x, y, font, track) {
    const key = font + '|' + track + '|' + str;
    ctx.font = font;
    let m = this._mcache.get(key);
    if (!m) {
      const ws = [];
      let tot = 0;
      for (let i = 0; i < str.length; i++) {
        const w = ctx.measureText(str[i]).width;
        ws.push(w);
        tot += w;
      }
      tot += track * (str.length - 1);
      m = { ws: ws, tot: tot };
      this._mcache.set(key, m);
    }
    let cx = x - m.tot / 2;
    for (let i = 0; i < str.length; i++) {
      ctx.fillText(str[i], cx, y);
      cx += m.ws[i] + track;
    }
  }

  _frame(now) {
    const ctx = this._ctx, W = this._W, H = this._H;
    if (!ctx || !W || !this._nets || !this._stars) return;
    let dt = (now - (this._last || now)) / 1000;
    this._last = now;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    const t = now / 1000;
    const sp = this._reduced ? 0.3 : 1;
    const P = this._ptr;

    const idle = now - P.t > 60;
    const kv = Math.exp(-dt * (idle ? 12 : 3));
    P.vx *= kv;
    P.vy *= kv;
    const goal = P.inside ? 1 : 0;
    P.light += (goal - P.light) * (1 - Math.exp(-dt * (goal ? 6 : 2.2)));
    const kf = 1 - Math.exp(-dt * 30);
    P.lx += (P.x - P.lx) * kf;
    P.ly += (P.y - P.ly) * kf;
    const L = P.light, lx = P.lx, ly = P.ly, R = this._R;
    const rgb = this._rgb;
    const rgbStr = rgb[0] + ',' + rgb[1] + ',' + rgb[2];
    const solid = 'rgb(' + rgbStr + ')';
    const rise = Math.min(1, dt * 7);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    if (L > 0.004) {
      const rr = R * 1.8;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, rr);
      g.addColorStop(0, 'rgba(' + rgbStr + ',' + (0.07 * L).toFixed(4) + ')');
      g.addColorStop(0.4, 'rgba(' + rgbStr + ',' + (0.025 * L).toFixed(4) + ')');
      g.addColorStop(1, 'rgba(' + rgbStr + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - rr, ly - rr, rr * 2, rr * 2);
    }

    ctx.fillStyle = solid;
    ctx.strokeStyle = solid;

    const cx = this._cx, cy = this._cy;
    const th = t * 0.0035 * sp, cs = Math.cos(th), sn = Math.sin(th);
    const S = this._stars, nS = this._nStars, RS = R * 1.4, RS2 = RS * RS;
    const NB = 12;
    const SB = [];
    for (let b = 0; b < NB; b++) SB.push(new Path2D());
    let sbUsed = 0;
    for (let i = 0; i < nS; i++) {
      const o = i * 6;
      const x = cx + S[o] * cs - S[o + 1] * sn;
      const y = cy + S[o] * sn + S[o + 1] * cs;
      if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue;
      let a = S[o + 3] * (0.5 + 0.5 * Math.sin(t * S[o + 4] + S[o + 5]));
      if (L > 0.004) {
        const dx = x - lx, dy = y - ly, d2 = dx * dx + dy * dy;
        if (d2 < RS2) {
          const u = 1 - Math.sqrt(d2) / RS;
          a += u * u * L * 0.6;
        }
      }
      if (a < 0.012) continue;
      let b = (Math.sqrt(a > 1 ? 1 : a) * NB) | 0;
      if (b >= NB) b = NB - 1;
      const s = S[o + 2];
      SB[b].rect(x - s / 2, y - s / 2, s, s);
      sbUsed |= 1 << b;
    }
    for (let b = 0; b < NB; b++) {
      if (!(sbUsed & (1 << b))) continue;
      const v = (b + 0.5) / NB;
      ctx.globalAlpha = v * v;
      ctx.fill(SB[b]);
    }

    const vel = Math.hypot(P.vx, P.vy);
    const wiping = P.inside && vel > 40;
    const RN = R * 1.25;
    const om = 0.0045 * sp;
    const px = P.has ? (lx / W - 0.5) * L : 0;
    const py = P.has ? (ly / H - 0.5) * L : 0;
    const de = Math.exp(-dt * 1.5), dr = Math.exp(-dt * 1.1);
    const nets = this._nets;
    for (let k = 0; k < nets.length; k++) {
      const n = nets[k];
      const swx = -(n.y - cy) * om * (0.4 + n.d);
      const swy = (n.x - cx) * om * (0.4 + n.d);
      n.x += (n.vx * sp + swx + n.ex) * dt;
      n.y += (n.vy * sp + swy + n.ey) * dt;
      n.rot += (n.vr * sp + n.er) * dt;
      n.ex *= de;
      n.ey *= de;
      n.er *= dr;
      const m = n.rad + 30;
      if (n.x < -m) n.x += W + 2 * m; else if (n.x > W + m) n.x -= W + 2 * m;
      if (n.y < -m) n.y += H + 2 * m; else if (n.y > H + m) n.y -= H + 2 * m;
      const sx = n.x + Math.sin(t * n.wf * sp + n.wp) * n.wa - px * n.d * 26;
      const sy = n.y + Math.cos(t * n.wf2 * sp + n.wp2) * n.wa2 - py * n.d * 26;
      let f = 0;
      if (L > 0.004) {
        const dx = sx - lx, dy = sy - ly, d = Math.sqrt(dx * dx + dy * dy);
        if (d < RN) {
          const u = 1 - d / RN;
          f = u * u * (3 - 2 * u) * L;
          if (wiping) {
            const k2 = u * u * 1.3 * dt;
            n.ex += P.vx * k2;
            n.ey += P.vy * k2;
            n.er += ((dx * P.vy - dy * P.vx) / (d + 24)) * 0.005 * u * dt;
            if (d > 0.5) {
              const push = u * 170 * dt * Math.min(1, vel / 600);
              n.ex += (dx / d) * push;
              n.ey += (dy / d) * push;
            }
            const em = Math.hypot(n.ex, n.ey);
            if (em > 420) { n.ex *= 420 / em; n.ey *= 420 / em; }
            if (n.er > 2.5) n.er = 2.5; else if (n.er < -2.5) n.er = -2.5;
          }
        }
      }
      const a = n.alpha * (0.8 + 0.2 * Math.sin(t * n.tw + n.wp)) * (1 + 2.8 * f);
      const cr = Math.cos(n.rot), sr = Math.sin(n.rot);
      const nd = n.nodes, X = n.X, Y = n.Y;
      for (let i = 0; i < nd.length; i++) {
        const q = nd[i];
        const b = 1 + 0.08 * Math.sin(t * n.bf * sp + q.ph);
        const ox = q.ox * b, oy = q.oy * b;
        X[i] = sx + ox * cr - oy * sr;
        Y[i] = sy + ox * sr + oy * cr;
      }
      const la = a * 0.6;
      ctx.globalAlpha = la > 1 ? 1 : la;
      ctx.lineWidth = n.lw * (1 + 0.4 * f);
      ctx.beginPath();
      const e = n.edges;
      for (let j = 0; j < e.length; j += 2) {
        ctx.moveTo(X[e[j]], Y[e[j]]);
        ctx.lineTo(X[e[j + 1]], Y[e[j + 1]]);
      }
      ctx.stroke();
      const s = n.ns * (1 + 0.35 * f), hs = s / 2;
      for (let i = 0; i < nd.length; i++) {
        const q = nd[i];
        const ta = a * (0.65 + 0.35 * Math.sin(t * q.tw + q.ph)) * 1.35;
        ctx.globalAlpha = ta > 1 ? 1 : ta;
        ctx.fillRect(X[i] - hs, Y[i] - hs, s, s);
      }
    }

    const signs = this._signs || [];
    const RL = R * 1.1;
    const lgDecay = Math.exp(-dt / 1.2);
    for (let k = 0; k < signs.length; k++) {
      const n = signs[k];
      const swx = -(n.y - cy) * om * 0.6;
      const swy = (n.x - cx) * om * 0.6;
      n.x += (n.vx * sp + swx + n.ex) * dt;
      n.y += (n.vy * sp + swy + n.ey) * dt;
      n.ex *= de;
      n.ey *= de;
      const m = n.sc * 1.3 + 70;
      if (n.x < -m) n.x += W + 2 * m; else if (n.x > W + m) n.x -= W + 2 * m;
      if (n.y < -m) n.y += H + 2 * m; else if (n.y > H + m) n.y -= H + 2 * m;
      const sx = n.x + Math.sin(t * n.wf * sp + n.wp) * n.wa - px * n.d * 26;
      const sy = n.y + Math.cos(t * n.wf2 * sp + n.wp2) * n.wa2 - py * n.d * 26;
      let f = 0;
      if (L > 0.004) {
        const dx = sx - lx, dy = sy - ly, d = Math.sqrt(dx * dx + dy * dy);
        if (d < RL) {
          const u = 1 - d / RL;
          let v = u * 1.5;
          if (v > 1) v = 1;
          f = v * v * (3 - 2 * v) * L;
          if (wiping) {
            const k2 = u * u * 0.6 * dt;
            n.ex += P.vx * k2;
            n.ey += P.vy * k2;
            if (d > 0.5) {
              const push = u * 90 * dt * Math.min(1, vel / 600);
              n.ex += (dx / d) * push;
              n.ey += (dy / d) * push;
            }
            const em = Math.hypot(n.ex, n.ey);
            if (em > 260) { n.ex *= 260 / em; n.ey *= 260 / em; }
          }
        }
      }
      let lg = n.lg * lgDecay;
      if (f > lg) lg += (f - lg) * rise;
      n.lg = lg < 0.003 ? 0 : lg;
      const glow = f > n.lg ? f : n.lg;
      const a = n.alpha * (0.85 + 0.15 * Math.sin(t * 0.45 + n.wp)) * (1 + 3.2 * glow);
      const rot = n.rot + Math.sin(t * n.swf * sp + n.swp) * n.sw;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const nd = n.nodes, X = n.X, Y = n.Y;
      for (let i = 0; i < nd.length; i++) {
        const q = nd[i];
        X[i] = sx + q.ox * cr - q.oy * sr;
        Y[i] = sy + q.ox * sr + q.oy * cr;
      }
      const la = a * 0.55;
      ctx.globalAlpha = la > 1 ? 1 : la;
      ctx.lineWidth = 0.6 + 0.35 * glow;
      ctx.beginPath();
      const e = n.edges;
      for (let j = 0; j < e.length; j += 2) {
        ctx.moveTo(X[e[j]], Y[e[j]]);
        ctx.lineTo(X[e[j + 1]], Y[e[j + 1]]);
      }
      ctx.stroke();
      for (let i = 0; i < nd.length; i++) {
        const q = nd[i];
        const s = q.sz * (1 + 0.3 * glow), hs = s / 2;
        const ta = a * (0.7 + 0.3 * Math.sin(t * q.tw + q.ph)) * 1.4;
        ctx.globalAlpha = ta > 1 ? 1 : ta;
        ctx.fillRect(X[i] - hs, Y[i] - hs, s, s);
      }
      n.px = sx;
      n.py = sy;
    }

    const RWd = R * 0.95;
    let tgt = 0;
    if (L > 0.004) {
      const dx = cx - lx, dy = cy - ly, d = Math.sqrt(dx * dx + dy * dy);
      if (d < RWd) {
        let u = (1 - d / RWd) * 1.6;
        if (u > 1) u = 1;
        tgt = u * u * (3 - 2 * u) * L;
      }
    }
    let wg = (this._wordG || 0) * Math.exp(-dt / 1.4);
    if (tgt > wg) wg += (tgt - wg) * rise;
    this._wordG = wg < 0.003 ? 0 : wg;
    if (this._wordG > 0) {
      ctx.globalAlpha = this._wordG > 1 ? 1 : this._wordG;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const ak = 'asc|' + this._wordFont;
      let asc = this._mcache.get(ak);
      if (asc === undefined) {
        ctx.font = this._wordFont;
        const mm = ctx.measureText('a');
        asc = mm.actualBoundingBoxAscent || this._wordSize * 0.42;
        this._mcache.set(ak, asc);
      }
      this._text(ctx, 'a.', cx, cy + asc / 2, this._wordFont, this._wordTrack);
    }

    const lgEl = this._legal;
    if (lgEl) {
      const stamp = W + 'x' + H;
      if (this._legalStamp !== stamp) {
        const r = lgEl.getBoundingClientRect();
        const cr = this._canvas.getBoundingClientRect();
        this._legalPos = [r.left - cr.left + r.width / 2, r.top - cr.top + r.height / 2];
        this._legalStamp = stamp;
      }
      let lgt = 0;
      if (L > 0.004) {
        const dx = this._legalPos[0] - lx, dy = this._legalPos[1] - ly, d = Math.sqrt(dx * dx + dy * dy), rr = R * 1.25;
        if (d < rr) {
          let u = (1 - d / rr) * 1.6;
          if (u > 1) u = 1;
          lgt = u * u * (3 - 2 * u) * L;
        }
      }
      let lgv = (this._legalG || 0) * Math.exp(-dt / 1.2);
      if (lgt > lgv) lgv += (lgt - lgv) * rise;
      this._legalG = lgv;
      const op = (0.14 + 0.86 * lgv).toFixed(2);
      if (op !== this._legalOp) {
        lgEl.style.setProperty('--glow', op);
        this._legalOp = op;
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

  function start() {
    const c = document.querySelector('canvas[data-aurentis]');
    if (!c) return;
    const sky = new Sky({ farbe: '#dfe6ff', dichte: 1, licht: 1 });
    sky._passive = c.getAttribute('data-mode') === 'passive';
    sky._legal = document.querySelector('[data-legal]');
    sky.componentDidMount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
