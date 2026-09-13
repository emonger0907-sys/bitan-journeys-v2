// <bitan-globe> — a 3D globe with real geography, no textures shipped:
// land is drawn from Natural Earth (world-atlas TopoJSON) into a canvas with
// d3 and used as the sphere texture in three.js. Drag to spin, auto-rotates
// when idle, pins are HTML overlays (accessible buttons) projected each frame.
// If WebGL or three.js is unavailable it falls back to a d3 orthographic SVG
// globe with the same drag + pins, so "el mundo" always loads.
//
// Attributes: pins='[{"i":0,"lat":..,"lng":..,"title":".."}]', selected="3",
//   autorotate="true|false", zoom="1.0" (bigger = closer)
//   visited='[{"i":0,"lat":..,"lng":..,"title":".."}]' — small, discreet secondary
//   points (places visited, not full destinations); hidden until show-visited="true",
//   then fade/scale in. They never trigger 'bitan-pin' — hover/tap just reveals a label.
//   visited-selected="2" — rotates to that visited pin and marks it active (bigger,
//   label pinned open); clearing it (empty string) just un-marks it.
// Events (bubble): 'bitan-pin' {detail:{i}} on tap, 'bitan-visited' {detail:{i}} on
//   tapping a visited pin, 'bitan-focus' {detail:{i}} when the pin nearest the center changes.
(function () {
  const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json';
  let topoPromise = null;
  const loadTopo = () => topoPromise || (topoPromise = fetch(TOPO_URL).then(r => r.json()));
  const rad = Math.PI / 180;
  const NS = 'http://www.w3.org/2000/svg';
  const sel = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
  const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } };

  class BitanGlobe extends HTMLElement {
    constructor() { super(); this._pins = []; this._vpins = []; }
    static get observedAttributes() { return ['selected', 'pins', 'visited', 'show-visited', 'showvisited', 'visited-selected', 'visitedselected', 'focus-image', 'focus-pos', 'focusimage', 'focuspos']; }
    _attr(a, b) { return this.getAttribute(a) || this.getAttribute(b); }
    connectedCallback() {
      if (this._started) return;
      this._started = true;
      this.style.cssText += ';display:block;position:relative;width:100%;height:100%;touch-action:none;cursor:grab;overflow:visible';
      this._rotY = -0.45; this._rotX = 0.12; this._vel = 0.0022;
      this._target = null;
      this._pins = [];
      this._vpins = [];
      this._activeVisited = null;
      this._showVisited = this._attr('show-visited', 'showvisited') === 'true';
      this._buildPins();
      this._buildVisitedPins();
      if (this.getAttribute('selected')) this.attributeChangedCallback('selected');
      if (this._attr('visited-selected', 'visitedselected')) this.attributeChangedCallback('visited-selected');
      this._tries = 0;
      this._wait();
    }
    disconnectedCallback() { this._alive = false; if (this._raf) cancelAnimationFrame(this._raf); if (this._off) this._off(); }
    attributeChangedCallback(name) {
      if (!this._started) return;
      if (name === 'pins') this._buildPins();
      if (name === 'visited') this._buildVisitedPins();
      if (name === 'show-visited' || name === 'showvisited') this._showVisited = this._attr('show-visited', 'showvisited') === 'true';
      if (name === 'selected') {
        const raw = this.getAttribute('selected');
        const i = (raw === null || raw === '') ? null : Number(raw);
        const p = i === null ? null : this._pins.find(p => p.i === i);
        if (p) { this._target = { y: -(p.lng + 90) * rad, x: Math.max(-0.5, Math.min(0.5, p.lat * rad * 0.45)) }; this._zoomTo = 1.45; }
        else { this._target = null; this._zoomTo = 1; }
        this._selected = p ? i : null;
        this._pins.forEach(p => { const on = i !== null && p.i === i; p.core.style.width = p.core.style.height = on ? '13px' : '8px'; p.core.style.background = on ? '#fff6e0' : '#f4ebd8'; });
      }
      if (name === 'visited-selected' || name === 'visitedselected') {
        const raw = this._attr('visited-selected', 'visitedselected');
        const i = (raw === null || raw === '') ? null : Number(raw);
        const p = i === null ? null : this._vpins.find(p => p.i === i);
        if (p) { this._target = { y: -(p.lng + 90) * rad, x: Math.max(-0.5, Math.min(0.5, p.lat * rad * 0.45)) }; this._zoomTo = 1.3; }
        this._activeVisited = p ? i : null;
        this._vpins.forEach(vp => {
          const on = i !== null && vp.i === i;
          vp.core.style.width = vp.core.style.height = on ? '7px' : '4px';
          vp.core.style.background = on ? '#fff6e0' : 'rgba(244,235,216,.8)';
          vp.label.style.opacity = on ? '1' : '0';
        });
      }
      if (name.indexOf('focus') === 0) this._syncPortrait();
    }
    _buildPins() {
      let data = [];
      try { data = JSON.parse(this.getAttribute('pins') || '[]'); } catch (e) {}
      this._pins.forEach(p => p.dot.remove());
      this._pins = data.map(d => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', d.title || '');
        dot.style.cssText = 'position:absolute;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border:0;background:none;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .25s ease';
        const halo = document.createElement('span');
        halo.style.cssText = 'position:absolute;width:22px;height:22px;border-radius:50%;background:rgba(212,180,131,.32);animation:bj-pulse 2.6s ease-in-out infinite;animation-delay:' + (d.i * 0.27) + 's';
        const core = document.createElement('span');
        core.style.cssText = 'position:relative;width:8px;height:8px;border-radius:50%;background:#f4ebd8;box-shadow:0 0 14px rgba(212,180,131,.95);transition:all .3s ease';
        dot.appendChild(halo); dot.appendChild(core);
        dot.addEventListener('pointerdown', e => e.stopPropagation());
        dot.addEventListener('click', e => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('bitan-pin', { detail: { i: d.i }, bubbles: true, composed: true })); });
        this.appendChild(dot);
        return { i: d.i, lat: d.lat, lng: d.lng, dot, core };
      });
    }
    _buildVisitedPins() {
      let data = [];
      try { data = JSON.parse(this.getAttribute('visited') || '[]'); } catch (e) {}
      (this._vpins || []).forEach(p => p.dot.remove());
      this._vpins = data.map(d => {
        // dot only ever gets a per-frame translate (no transition, or it'd lag behind
        // rotation); the fade/scale reveal lives on `reveal` instead, transitioned.
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', d.title || '');
        dot.style.cssText = 'position:absolute;left:0;top:0;width:20px;height:20px;margin:-10px 0 0 -10px;border:0;background:none;cursor:pointer;padding:0;pointer-events:none';
        const reveal = document.createElement('span');
        reveal.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.5);transition:opacity .5s ease,transform .5s ease';
        const core = document.createElement('span');
        core.style.cssText = 'position:relative;width:4px;height:4px;border-radius:50%;background:rgba(244,235,216,.8);box-shadow:0 0 5px rgba(212,180,131,.6);transition:all .3s ease';
        const label = document.createElement('span');
        label.textContent = d.title || '';
        label.style.cssText = 'position:absolute;left:50%;bottom:100%;transform:translate(-50%,-5px);white-space:nowrap;padding:3px 8px;border-radius:6px;background:rgba(5,11,20,.92);color:#f4ebd8;font-size:10px;letter-spacing:.02em;opacity:0;pointer-events:none;transition:opacity .2s ease;box-shadow:0 4px 14px rgba(0,0,0,.4)';
        reveal.appendChild(core); reveal.appendChild(label);
        dot.appendChild(reveal);
        const showLabel = () => { label.style.opacity = '1'; };
        const hideLabel = () => { if (this._activeVisited !== d.i) label.style.opacity = '0'; };
        dot.addEventListener('pointerdown', e => e.stopPropagation());
        dot.addEventListener('mouseenter', showLabel);
        dot.addEventListener('mouseleave', hideLabel);
        dot.addEventListener('focus', showLabel);
        dot.addEventListener('blur', hideLabel);
        dot.addEventListener('click', e => { e.stopPropagation(); this.dispatchEvent(new CustomEvent('bitan-visited', { detail: { i: d.i }, bubbles: true, composed: true })); });
        this.appendChild(dot);
        return { i: d.i, lat: d.lat, lng: d.lng, dot, reveal, core, label };
      });
    }
    _syncPortrait() {
      const src = this._attr('focus-image', 'focusimage');
      if (!src) { if (this._portrait) this._portrait.style.opacity = '0'; return; }
      if (!this._portrait) {
        const wrap = document.createElement('span');
        wrap.style.cssText = 'position:absolute;left:0;top:0;width:76px;height:76px;margin:-92px 0 0 -38px;border-radius:50%;overflow:hidden;pointer-events:none;opacity:0;transition:opacity .45s ease;box-shadow:0 0 0 2px rgba(212,180,131,.65),0 0 26px rgba(212,180,131,.4)';
        const img = document.createElement('img');
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        wrap.appendChild(img);
        const tail = document.createElement('span');
        tail.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:18px;margin:-16px 0 0 0;background:linear-gradient(to bottom,rgba(212,180,131,.7),rgba(212,180,131,0));pointer-events:none;opacity:0;transition:opacity .45s ease';
        this.appendChild(tail); this.appendChild(wrap);
        this._portrait = wrap; this._portraitImg = img; this._portraitTail = tail;
      }
      this._portraitImg.src = src;
      this._portraitImg.style.objectPosition = this._attr('focus-pos', 'focuspos') || '50% 35%';
    }
    _placePortrait(px, py, visible) {
      if (!this._portrait) return;
      this._portrait.style.transform = 'translate(' + px + 'px,' + py + 'px)';
      this._portraitTail.style.transform = 'translate(' + px + 'px,' + py + 'px)';
      const on = visible && !!this._attr('focus-image', 'focusimage');
      this._portrait.style.opacity = on ? '1' : '0';
      this._portraitTail.style.opacity = on ? '1' : '0';
    }
    _wait() {
      const T = window.THREE;
      if (T && hasWebGL()) return this._initThree(T);
      if (this._tries++ > 40) { if (window.d3) return this._initSvg(); }
      if (this._tries > 120) return;
      setTimeout(() => this._wait(), 100);
    }
    _drag(onMove) {
      let dragging = false, lx = 0, ly = 0;
      const down = e => { dragging = true; lx = e.clientX; ly = e.clientY; this._target = null; this.style.cursor = 'grabbing'; };
      const move = e => { if (!dragging) return; const dx = (e.clientX - lx) * 0.006, dy = (e.clientY - ly) * 0.005; lx = e.clientX; ly = e.clientY; onMove(dx, dy); };
      const up = () => { dragging = false; this.style.cursor = 'grab'; };
      this.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      this._off = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      this._isDragging = () => dragging;
    }
    _step() {
      if (!this._isDragging()) {
        if (this._target) {
          let dy = this._target.y - this._rotY; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          this._rotY += dy * 0.08; this._rotX += (this._target.x - this._rotX) * 0.08;
          if (Math.abs(dy) < 0.002) this._target = null;
        } else if (this.getAttribute('autorotate') !== 'false') {
          this._rotY += this._vel; this._vel += (0.0022 - this._vel) * 0.03;
        }
      }
    }
    _focusCheck(best) {
      if (best !== this._focus) { this._focus = best; if (best != null) this.dispatchEvent(new CustomEvent('bitan-focus', { detail: { i: best }, bubbles: true, composed: true })); }
    }

    // ---- WebGL path ----
    async _texture(T) {
      const color = this.getAttribute('palette') === 'color';
      const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color ? '#0a2f4e' : '#0b1f33'; ctx.fillRect(0, 0, c.width, c.height);
      const tex = new T.CanvasTexture(c);
      tex.anisotropy = 4;
      if (window.d3) {
        const d3 = window.d3;
        const proj = d3.geoEquirectangular().fitSize([c.width, c.height], { type: 'Sphere' });
        const path = d3.geoPath(proj, ctx);
        ctx.beginPath(); path(d3.geoGraticule().step([15, 15])()); ctx.strokeStyle = 'rgba(212,180,131,0.13)'; ctx.lineWidth = 1.2; ctx.stroke();
        try {
          const topo = await loadTopo();
          const land = window.topojson.feature(topo, topo.objects.countries);
          ctx.beginPath(); path(land);
          if (color) {
            const g = ctx.createLinearGradient(0, 0, 0, c.height);
            g.addColorStop(0, '#6f7f5c'); g.addColorStop(0.32, '#3f6b52'); g.addColorStop(0.52, '#5d7f4a');
            g.addColorStop(0.72, '#8a7a4e'); g.addColorStop(1, '#cfd6d8');
            ctx.fillStyle = g;
          } else ctx.fillStyle = 'rgba(244,235,216,0.17)';
          ctx.fill();
          ctx.strokeStyle = color ? 'rgba(212,180,131,0.85)' : 'rgba(212,180,131,0.7)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
          tex.needsUpdate = true;
        } catch (e) {}
      }
      return tex;
    }
    async _initThree(T) {
      let w = this.clientWidth || 360, h = this.clientHeight || 360;
      const zoom = Number(this.getAttribute('zoom') || 1);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(30, w / h, 0.1, 100);
      const R = 1.4;
      const placeCamera = () => { const fit = Math.min(w, h) / Math.max(w, h); camera.aspect = w / h; camera.position.set(0, 0, (R / Math.tan(15 * rad)) * 1.18 / (zoom * (h <= w ? 1 : fit))); camera.updateProjectionMatrix(); };
      placeCamera();
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
      renderer.domElement.style.position = 'absolute'; renderer.domElement.style.left = '0'; renderer.domElement.style.top = '0'; renderer.domElement.style.display = 'block';
      this.insertBefore(renderer.domElement, this.firstChild);
      if (window.ResizeObserver) { new ResizeObserver(() => { const nw = this.clientWidth, nh = this.clientHeight; if (nw && nh && (nw !== w || nh !== h)) { w = nw; h = nh; renderer.setSize(w, h); placeCamera(); } }).observe(this); }

      const world = new T.Group(); scene.add(world);
      const globe = new T.Mesh(new T.SphereGeometry(R, 64, 48), new T.MeshBasicMaterial({ color: this.getAttribute('palette') === 'color' ? 0x0a2f4e : 0x0b1f33 }));
      world.add(globe);
      world.add(new T.Mesh(new T.SphereGeometry(R * 1.1, 48, 32), new T.MeshBasicMaterial({ color: 0x2e5e4e, transparent: true, opacity: 0.08, side: T.BackSide })));
      world.add(new T.Mesh(new T.SphereGeometry(R * 1.035, 48, 32), new T.MeshBasicMaterial({ color: 0xd4b483, transparent: true, opacity: 0.06, side: T.BackSide })));
      const ringGroup = new T.Group(); ringGroup.rotation.x = 1.25; ringGroup.rotation.z = -0.31; scene.add(ringGroup);
      ringGroup.add(new T.Mesh(new T.TorusGeometry(R * 1.32, 0.006, 6, 200), new T.MeshBasicMaterial({ color: 0xd4b483, transparent: true, opacity: 0.6 })));
      const sparkImg = this._attr('spark-image', 'sparkimage');
      let spark;
      if (sparkImg) {
        const tex = new T.TextureLoader().load(sparkImg);
        spark = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true }));
        spark.scale.set(0.95, 0.343, 1);
      } else {
        spark = new T.Mesh(new T.SphereGeometry(0.03, 12, 12), new T.MeshBasicMaterial({ color: 0xfff6e0 }));
      }
      ringGroup.add(spark);

      this._texture(T).then(tex => { globe.material = new T.MeshBasicMaterial({ map: tex }); });

      const pinV = p => { const phi = (90 - p.lat) * rad, theta = (p.lng + 180) * rad; return new T.Vector3(-R * Math.sin(phi) * Math.cos(theta), R * Math.cos(phi), R * Math.sin(phi) * Math.sin(theta)); };
      this._drag((dx, dy) => { this._rotY += dx; this._rotX = Math.max(-1.1, Math.min(1.1, this._rotX + dy)); this._vel = dx * 0.35; this._zoomTo = 1; });
      this._alive = true;
      this._zoomK = 1; this._zoomTo = this._zoomTo || 1;
      this._syncPortrait();
      const baseZ = camera.position.z;
      if (window.IntersectionObserver) {
        this._visible = false;
        new IntersectionObserver(es => { this._visible = es[0].isIntersecting; }, { threshold: 0.05 }).observe(this);
      } else this._visible = true;
      renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); });
      const proj = new T.Vector3(); let t = 0;
      const loop = () => {
        if (!this._alive) return;
        this._raf = requestAnimationFrame(loop);
        if (!this._visible) return;
        t += 0.016; this._step();
        this._zoomK += ((this._zoomTo || 1) - this._zoomK) * 0.06;
        camera.position.z = baseZ / this._zoomK;
        world.rotation.y = this._rotY; world.rotation.x = this._rotX;
        ringGroup.rotation.y = 0.35;
        spark.position.set(Math.cos(t * 0.5) * R * 1.32, Math.sin(t * 0.5) * R * 1.32, 0);
        renderer.render(scene, camera);
        let best = null, bestD = 1e9;
        for (const p of this._pins) {
          if (!p.v) p.v = pinV(p);
          proj.copy(p.v).applyEuler(world.rotation);
          const front = proj.z > 0.1;
          proj.project(camera);
          const px = (proj.x * 0.5 + 0.5) * w, py = (-proj.y * 0.5 + 0.5) * h;
          p.dot.style.transform = 'translate(' + px + 'px,' + py + 'px)';
          p.dot.style.opacity = front ? '1' : '0'; p.dot.style.pointerEvents = front ? 'auto' : 'none';
          if (front) { const d = Math.hypot(px - w / 2, py - h / 2); if (d < bestD) { bestD = d; best = p.i; } }
          if (this._selected === p.i) this._placePortrait(px, py, front);
        }
        this._focusCheck(best);
        for (const p of this._vpins) {
          if (!p.v) p.v = pinV(p);
          proj.copy(p.v).applyEuler(world.rotation);
          const front = proj.z > 0.1;
          proj.project(camera);
          const px = (proj.x * 0.5 + 0.5) * w, py = (-proj.y * 0.5 + 0.5) * h;
          const on = this._showVisited && front;
          p.dot.style.transform = 'translate(' + px + 'px,' + py + 'px)';
          p.dot.style.pointerEvents = on ? 'auto' : 'none';
          p.reveal.style.opacity = on ? '1' : '0';
          p.reveal.style.transform = 'scale(' + (on ? 1 : 0.5) + ')';
        }
      };
      loop();
    }

    // ---- SVG fallback (d3 orthographic) ----
    _initSvg() {
      const d3 = window.d3;
      const svg = sel('svg', { viewBox: '0 0 200 200', preserveAspectRatio: 'xMidYMid meet' });
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
      svg.appendChild(sel('circle', { cx: 100, cy: 100, r: 95, fill: 'rgba(11,31,51,0.95)', stroke: 'rgba(212,180,131,0.25)', 'stroke-width': 0.5 }));
      const grat = sel('path', { fill: 'none', stroke: 'rgba(212,180,131,0.12)', 'stroke-width': 0.35 });
      const land = sel('path', { fill: 'rgba(244,235,216,0.15)', stroke: 'rgba(212,180,131,0.6)', 'stroke-width': 0.45, 'stroke-linejoin': 'round' });
      svg.appendChild(grat); svg.appendChild(land);
      this.insertBefore(svg, this.firstChild);
      const proj = d3.geoOrthographic().scale(95).translate([100, 100]).clipAngle(90);
      const path = d3.geoPath(proj);
      const graticule = d3.geoGraticule().step([15, 15])();
      let landF = null;
      loadTopo().then(topo => { landF = window.topojson.feature(topo, topo.objects.countries); }).catch(() => {});
      this._drag((dx, dy) => { this._rotY += dx; this._rotX = Math.max(-1.1, Math.min(1.1, this._rotX + dy)); this._vel = dx * 0.35; });
      this._alive = true;
      const loop = () => {
        if (!this._alive) return;
        this._raf = requestAnimationFrame(loop);
        this._step();
        const lng0 = -90 - this._rotY / rad, lat0 = this._rotX / rad;
        proj.rotate([-lng0, -lat0]);
        grat.setAttribute('d', path(graticule) || '');
        if (landF) land.setAttribute('d', path(landF) || '');
        const w = this.clientWidth, h = this.clientHeight, s = Math.min(w, h) / 200, ox = (w - 200 * s) / 2, oy = (h - 200 * s) / 2;
        let best = null, bestD = 1e9;
        for (const p of this._pins) {
          const pt = proj([p.lng, p.lat]);
          const front = !!pt && d3.geoDistance([p.lng, p.lat], [lng0, lat0]) < Math.PI / 2 - 0.05;
          if (pt) { const px = ox + pt[0] * s, py = oy + pt[1] * s; p.dot.style.transform = 'translate(' + px + 'px,' + py + 'px)'; if (front) { const d = Math.hypot(px - w / 2, py - h / 2); if (d < bestD) { bestD = d; best = p.i; } } }
          p.dot.style.opacity = front ? '1' : '0'; p.dot.style.pointerEvents = front ? 'auto' : 'none';
        }
        this._focusCheck(best);
        for (const p of this._vpins) {
          const pt = proj([p.lng, p.lat]);
          const front = !!pt && d3.geoDistance([p.lng, p.lat], [lng0, lat0]) < Math.PI / 2 - 0.05;
          const on = this._showVisited && front;
          if (pt) { const px = ox + pt[0] * s, py = oy + pt[1] * s; p.dot.style.transform = 'translate(' + px + 'px,' + py + 'px)'; }
          p.dot.style.pointerEvents = on ? 'auto' : 'none';
          p.reveal.style.opacity = on ? '1' : '0';
          p.reveal.style.transform = 'scale(' + (on ? 1 : 0.5) + ')';
        }
      };
      loop();
    }
  }
  if (!customElements.get('bitan-globe')) customElements.define('bitan-globe', BitanGlobe);
})();
