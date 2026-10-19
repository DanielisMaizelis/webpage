// Spinning dotted globe for the About photo card — plain WebGL, one full-card shader.
// Land comes from a small equirectangular mask (media/globe-land.png); Vilnius gets a pin.

(() => {
  const card = document.querySelector(".card-photo[data-globe]");
  if (!card) return;

  const canvas = document.createElement("canvas");
  canvas.className = "globe-canvas";
  canvas.setAttribute("aria-label", "Spinning globe with a pin on Vilnius, Lithuania");
  canvas.setAttribute("role", "img");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false });
  if (!gl) return;
  card.prepend(canvas);
  card.classList.add("has-globe");

  const vert = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uYaw, uTilt, uTime;
    uniform vec3 uPin;
    uniform sampler2D uLand;

    const float PI = 3.14159265;
    const float ROWS = 120.0;
    const vec3 BG = vec3(0.086, 0.082, 0.075);      // --card-dark
    const vec3 INK = vec3(0.953, 0.941, 0.918);     // --on-dark
    const vec3 ACCENT = vec3(0.769, 0.271, 0.110);  // --accent

    void main() {
      float s = 0.5 * min(uRes.x, uRes.y);
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / s;
      float px = 1.5 / s;
      float R = 0.84;
      float d = length(p);
      vec3 col = BG;

      // soft atmosphere just outside the limb
      float halo = smoothstep(R + 0.22, R, d) * step(R, d);
      col += ACCENT * 0.28 * halo * halo;

      if (d < R + px) {
        vec3 n = vec3(p, sqrt(max(R * R - d * d, 0.0))) / R;   // view space, z toward viewer

        // view -> world: undo tilt (x axis) then yaw (y axis)
        float ct = cos(uTilt), st = sin(uTilt);
        vec3 w = vec3(n.x, n.y * ct + n.z * st, -n.y * st + n.z * ct);
        float cy = cos(uYaw), sy = sin(uYaw);
        w = vec3(w.x * cy - w.z * sy, w.y, w.x * sy + w.z * cy);

        float lat = asin(clamp(w.y, -1.0, 1.0));
        float lon = atan(w.x, w.z);

        // equal-area-ish dot grid: fewer columns towards the poles
        float row = floor((lat + 0.5 * PI) / PI * ROWS);
        float latC = (row + 0.5) / ROWS * PI - 0.5 * PI;
        float cols = max(1.0, floor(2.0 * ROWS * cos(latC)));
        float colI = floor((lon + PI) / (2.0 * PI) * cols);
        float lonC = (colI + 0.5) / cols * 2.0 * PI - PI;
        vec2 cell = vec2((lon - lonC) / (2.0 * PI / cols), (lat - latC) / (PI / ROWS));
        float r = length(cell);

        float land = texture2D(uLand, vec2((lonC + PI) / (2.0 * PI), (0.5 * PI - latC) / PI)).r;
        land = smoothstep(0.35, 0.65, land);

        vec3 light = normalize(vec3(-0.55, 0.6, 0.75));
        float diff = 0.3 + 0.7 * max(dot(n, light), 0.0);
        float limb = smoothstep(0.0, 0.35, n.z);               // fade dots where they squash

        vec3 sphere = mix(BG, vec3(0.13, 0.125, 0.115), diff);
        float dotLand = smoothstep(0.36, 0.2, r) * land;
        float dotSea = smoothstep(0.16, 0.06, r) * (1.0 - land) * 0.16;
        vec3 globe = sphere;
        globe = mix(globe, INK * diff, dotLand * limb);
        globe = mix(globe, INK, dotSea * limb);

        // Vilnius pin with a pulsing ring
        float ang = acos(clamp(dot(w, uPin), -1.0, 1.0));
        float core = smoothstep(0.045, 0.03, ang);
        float t = fract(uTime * 0.5);
        float ring = smoothstep(0.008, 0.0, abs(ang - (0.045 + 0.18 * t))) * (1.0 - t);
        globe = mix(globe, ACCENT, max(core, ring * 0.9));

        // rim light
        globe += ACCENT * 0.18 * pow(1.0 - n.z, 3.0);

        col = mix(col, globe, smoothstep(R + px, R - px, d));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn("globe:", err);
    canvas.remove();
    card.classList.remove("has-globe");
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = name => gl.getUniformLocation(prog, name);
  const uRes = u("uRes"), uYaw = u("uYaw"), uTilt = u("uTilt"), uTime = u("uTime"), uPin = u("uPin");

  // Vilnius, Lithuania
  const toRad = Math.PI / 180;
  const pinLat = 54.687 * toRad, pinLon = 25.279 * toRad;
  gl.uniform3f(uPin, Math.cos(pinLat) * Math.sin(pinLon), Math.sin(pinLat), Math.cos(pinLat) * Math.cos(pinLon));

  // Land mask: until it loads the globe is just dots-free shading
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    needsDraw = true;
  };
  img.src = "media/globe-land.png";

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const AUTO = reduce ? 0 : 0.12;           // rad/s
  let yaw = -pinLon, tilt = 0.42;           // start with Vilnius facing the viewer
  let vel = AUTO, dragging = false, lastX = 0, lastY = 0, lastMove = 0;
  let visible = false, needsDraw = true, raf = 0, prev = 0;
  const start = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
      needsDraw = true;
    }
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min((now - (prev || now)) / 1000, 0.05);
    prev = now;
    if (!dragging) {
      vel += (AUTO - vel) * Math.min(dt * 1.5, 1);   // inertia eases back to the idle spin
      yaw += vel * dt;
    }
    resize();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uYaw, yaw);
    gl.uniform1f(uTilt, tilt);
    gl.uniform1f(uTime, reduce ? 0.6 : (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    needsDraw = false;
    schedule();
  }

  function schedule() {
    if (raf || !visible) return;
    const moving = !reduce || dragging || Math.abs(vel) > 0.001;
    if (moving || needsDraw) raf = requestAnimationFrame(frame);
    else prev = 0;
  }

  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { prev = 0; schedule(); }
  }).observe(card);
  new ResizeObserver(() => { needsDraw = true; schedule(); }).observe(canvas);

  // Drag to spin (horizontal) and tip (vertical); vertical page scroll still works on touch
  canvas.addEventListener("pointerdown", e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; lastMove = performance.now(); vel = 0;
    canvas.setPointerCapture(e.pointerId);
    card.classList.add("is-dragging");
    schedule();
  });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const k = 2.6 / Math.max(canvas.clientWidth, 1);
    const now = performance.now();
    const dx = (e.clientX - lastX) * k;
    yaw += dx;
    tilt = Math.max(-1.1, Math.min(1.1, tilt + (e.clientY - lastY) * k));
    vel = dx / Math.max((now - lastMove) / 1000, 0.008);
    lastX = e.clientX; lastY = e.clientY; lastMove = now;
    needsDraw = true;
    schedule();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    if (performance.now() - lastMove > 80) vel = 0;
    vel = Math.max(-6, Math.min(6, vel));
    card.classList.remove("is-dragging");
    schedule();
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
})();
