/* WAYVEX — editable copy and wave controls. No dependencies or build step. */
const STATUS = "Coming soon.";
const INTRO_SPEED = 1.5; // 1.5 plays the complete opening in nine seconds.
const WAVE_AMPLITUDE = 1.15; // Ripple height; 0.6 is quieter, 1.4 is more pronounced.
const WAVE_SPEED = 1; // 1 = a ten-second breathing cycle.
const MORPH_CURVE = 5.2; // Exponential curvature; try 4–6.5.

(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const TIMELINE_DURATION = 13.5;
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const between = (value, start, end) => ease(clamp((value - start) / (end - start)));

  // Integral of beta(3,5): gentle acceleration, long deceleration, and zero
  // endpoint velocity/acceleration. Equivalent forms keep both ends stable.
  function dockEase(value) {
    const u = clamp(value);
    return u < 0.5
      ? u * u * u * (35 + u * (-105 + u * (126 + u * (-70 + 15 * u))))
      : 1 - Math.pow(1 - u, 5) * (1 + 5 * u + 15 * u * u);
  }
  const dockBetween = (value, start, end) => dockEase((value - start) / (end - start));

  // A monotonic, active-time sequence. Scroll changes its pace, never its place.
  function timelineState(seconds = TIMELINE_DURATION) {
    const t = Math.max(0, Number.isFinite(seconds) ? seconds : TIMELINE_DURATION);
    const brandShineProgress = between(t, 0.9, 2.2);
    // One soft pass on the existing clock; exactly off before and after it.
    const brandShineOpacity = brandShineProgress > 0 && brandShineProgress < 1
      ? Math.pow(Math.sin(Math.PI * brandShineProgress), 2) * 0.28
      : 0;
    return {
      seconds: t,
      brandOpacity: between(t, 0.1, 1.1),
      brandShineProgress,
      brandShineOpacity,
      brandDock: dockBetween(t, 2.2, 4.7),
      brandScaleDock: dockBetween(t, 2.35, 4.8),
      heroWay: between(t, 5.1, 6.3),
      heroWave: between(t, 8, 9.5),
      lineDraw: between(t, 5.1, 7.3),
      linePulseProgress: between(t, 6.45, 8.4),
      linePulseOpacity: between(t, 6.45, 6.7) * (1 - between(t, 8.15, 8.4)),
      waveReveal: between(t, 8, 11.2),
      status: between(t, 12, 13.2)
    };
  }

  /**
   * Deterministic canvas renderer, also used to create the static sharing image.
   * Coordinates are normalized; no DOM, random numbers, or external images here.
   * time/timeline are seconds, intro in [0, 1], quality in [0.5, 1].
   * Omit timeline for the final wave; existing { morph: 1 } OG calls still work.
   */
  function renderFrame(ctx, width, height, options = {}) {
    const time = options.time ?? 0;
    const timeline = options.timeline === undefined ? null : timelineState(options.timeline);
    const waveReveal = timeline ? timeline.waveReveal : 1;
    const lineDraw = timeline ? timeline.lineDraw : 1;
    const intro = ease(clamp(options.intro ?? 1));
    const mobile = width < 700;
    const quality = clamp(options.quality ?? (mobile ? 0.7 : 1), 0.5, 1);
    const pointer = options.pointer ?? { x: 0.5, y: 0.5, strength: 0 };
    const strength = clamp(pointer.strength ?? 0);
    const phase = time * TAU * WAVE_SPEED / 10;
    const rows = Math.round(43 * quality);
    const columns = Math.round(75 * quality);
    const segments = Math.round(112 * quality);
    const depthSegments = Math.round(33 * quality);
    const lift = (1 - intro) * height * 0.065;
    const parallaxX = (pointer.x - 0.5) * 5 * strength;
    const parallaxY = (pointer.y - 0.5) * 3 * strength;
    const mobileAmplitude = mobile ? 0.78 : 1;
    const amplitude = WAVE_AMPLITUDE * mobileAmplitude;
    const originX = mobile ? 0.04 : 0.06;
    const endX = 1;
    const originY = 0.705;
    const exponentialRise = originY;
    const curvePower = Math.max(0.05, MORPH_CURVE);
    const denominator = Math.expm1(curvePower);
    const meshPresence = Math.pow(waveReveal, 1.2);

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = intro;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // The fan is raised 14% of the viewport. Its entire right edge converges at
    // the top-right corner; the highlighted depth has x=u and shares that anchor.
    function surface(u, depth) {
      const t = clamp(u);
      if (t === 1) return [width, 0]; // Exact anchor, unaffected by any motion.
      const anchorWeight = 1 - ease(t);
      const spread = 1 + (depth - 0.46) * 0.38;
      const x = 1 - (1 - t) * spread;
      const fanPower = Math.max(3, MORPH_CURVE);
      const exponential = Math.expm1(fanPower * t) / Math.expm1(fanPower);
      const baseline = 0.67 + Math.pow(depth, 1.4) * 0.21;
      const broadWave = Math.sin(t * TAU * 1.08 - depth * 2.65 + phase);
      const crossWave = Math.sin(t * TAU * 1.88 + depth * 3.2 - phase * 1.17);
      const swell = Math.sin(t * 3.35 - depth * 1.9 + phase * 0.85);
      // Breathing fades smoothly before the corner, preserving a precise finish.
      const envelope = (0.45 + Math.sin(t * Math.PI) * 0.55) * anchorWeight;
      const depthAmplitude = 0.5 + depth * 0.5;
      const breathing = (broadWave * 0.065 + crossWave * 0.021 + swell * 0.026)
        * envelope * depthAmplitude * amplitude;
      let y = baseline * (1 - exponential) - breathing;
      if (strength > 0.001) {
        const dx = (x - pointer.x) * (width / height);
        const dy = y - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        y += Math.sin(distance * 16 - phase * 1.1) * Math.exp(-distance * distance * 9)
          * 0.008 * strength * anchorWeight;
      }
      // Rows unfold from one exponential line while keeping the shared endpoint.
      const lineX = lerp(originX, endX, t) * width;
      const lineY = (originY - exponentialRise * Math.expm1(curvePower * t) / denominator) * height;
      return [
        lerp(lineX, x * width, waveReveal) + parallaxX * anchorWeight,
        lerp(lineY, y * height, waveReveal) + (parallaxY + lift) * anchorWeight
      ];
    }

    // Each crisp packet has a narrow cyan trail and a near-white moving tip.
    // Its sampled path stays on the surface, including during pointer deformation.
    function drawPacket(head, depth, length, opacity, emphasis = 1) {
      if (opacity <= 0.001) return;
      const tip = surface(head, depth);
      const tail = surface(head - length, depth);
      const pixelLength = Math.hypot(tip[0] - tail[0], tip[1] - tail[1]);
      // Keep a compact ray even where the exponential becomes almost vertical.
      length *= Math.min(1, (mobile ? 32 : 58) * emphasis / Math.max(1, pixelLength));
      const points = [];
      for (let segment = 0; segment <= 6; segment++) {
        points.push(surface(head - length + length * segment / 6, depth));
      }
      ctx.shadowBlur = 0;
      ctx.beginPath();
      points.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point));
      ctx.strokeStyle = "#55D9FF";
      ctx.lineWidth = (mobile ? 1.15 : 1.55) * emphasis;
      ctx.globalAlpha = opacity * 0.72;
      ctx.stroke();
      ctx.strokeStyle = "#EDFCFF";
      ctx.lineWidth = (mobile ? 0.7 : 0.9) * emphasis;
      for (let segment = 0; segment < 6; segment++) {
        ctx.globalAlpha = opacity * (0.12 + 0.88 * ease((segment + 1) / 6));
        ctx.beginPath();
        ctx.moveTo(...points[segment]);
        ctx.lineTo(...points[segment + 1]);
        ctx.stroke();
      }
      ctx.fillStyle = "#EDFCFF";
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(tip[0], tip[1], (mobile ? 0.9 : 1.1) * emphasis, 0, TAU);
      ctx.fill();
    }

    // Keep the mesh unlit; a single luminous ridge grows into the wave.
    const meshGradient = ctx.createLinearGradient(0, 0, width, 0);
    meshGradient.addColorStop(0, "rgba(13,107,255,0)");
    meshGradient.addColorStop(0.14, "rgba(13,107,255,0.66)");
    meshGradient.addColorStop(0.52, "rgba(13,107,255,1)");
    meshGradient.addColorStop(0.86, "rgba(13,107,255,0.82)");
    meshGradient.addColorStop(1, "rgba(13,107,255,0)");
    ctx.strokeStyle = meshGradient;
    ctx.lineWidth = mobile ? 0.72 : 0.85;

    for (let row = 0; meshPresence > 0 && row <= rows; row++) {
      const depth = row / rows;
      const edgeFade = Math.sin(Math.PI * (0.035 + depth * 0.93));
      ctx.globalAlpha = intro * meshPresence * (0.24 + depth * 0.74) * edgeFade;
      ctx.beginPath();
      for (let segment = 0; segment <= segments; segment++) {
        const point = surface(segment / segments, depth);
        if (segment === 0) ctx.moveTo(...point);
        else ctx.lineTo(...point);
      }
      ctx.stroke();
    }

    // The second family of lines gives the sea its finely woven depth.
    ctx.lineWidth = mobile ? 0.5 : 0.6;
    for (let column = 0; meshPresence > 0 && column <= columns; column++) {
      const u = column / columns;
      ctx.globalAlpha = intro * meshPresence * 0.43 * Math.sin(clamp(u) * Math.PI);
      ctx.beginPath();
      for (let segment = 0; segment <= depthSegments; segment++) {
        const point = surface(u, segment / depthSegments);
        if (segment === 0) ctx.moveTo(...point);
        else ctx.lineTo(...point);
      }
      ctx.stroke();
    }

    // Sparse data nodes and travelling signals belong to the surface itself.
    // They emerge only as the line unfolds, and stay still when time is frozen.
    const texturePresence = intro * between(waveReveal, 0.08, 0.78);
    if (texturePresence > 0) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#91D4FF";
      const rowStep = mobile ? 6 : 5;
      const columnStep = mobile ? 5 : 4;
      for (let row = 2; row < rows - 1; row += rowStep) {
        for (let column = 4; column < columns * 0.94; column += columnStep) {
          const seed = (row * 37 + column * 19 + row * column * 11) % 29;
          if (seed > 16) continue;
          const u = column / columns;
          const edgeFade = between(u, 0.04, 0.18) * (1 - between(u, 0.84, 0.95));
          const brightness = 0.48 + 0.22 * Math.sin(phase * 0.7 + seed * 1.31);
          const radius = (mobile ? 0.68 : 0.85) + (seed / 28) * (mobile ? 0.3 : 0.45);
          const point = surface(u, row / rows);
          ctx.globalAlpha = texturePresence * edgeFade * brightness;
          ctx.beginPath();
          ctx.arc(point[0], point[1], radius, 0, TAU);
          ctx.fill();
        }
      }

      // Offset 1.8–2.34 second pulses vary smoothly, never blinking on and off.
      const packetCount = Math.round(lerp(mobile ? 7 : 12, mobile ? 10 : 16, (quality - 0.5) * 2));
      for (let packet = 0; packet < packetCount; packet++) {
        const head = (0.11 + packet * 0.618034 + time * WAVE_SPEED * 0.038 * (0.84 + (packet % 5) * 0.08)) % 1;
        const depth = Math.round(rows * (0.13 + ((packet * 0.381966 + 0.1) % 1) * 0.74)) / rows;
        const pulsePeriod = 1.8 + (packet % 4) * 0.18;
        const breath = 0.58 + 0.42 * Math.sin(time * WAVE_SPEED * TAU / pulsePeriod + packet * 1.73);
        const edgeFade = between(head, 0.04, 0.13) * (1 - between(head, 0.9, 0.99));
        const length = (mobile ? 0.065 : 0.04) * (0.84 + breath * 0.24);
        drawPacket(head, depth, length, texturePresence * edgeFade * breath);
      }
    }

    // The line becomes one actual surface ribbon and stays part of the wave.
    const curvePoints = [];
    for (let index = 0; index <= segments; index++) {
      curvePoints.push(surface(index / segments, 0.46));
    }

    // Draw the first line continuously from left to right, with a sub-segment tip.
    const drawn = lineDraw * segments;
    const whole = Math.floor(drawn);
    const visibleCurve = curvePoints.slice(0, whole + 1);
    if (whole < segments && drawn > whole) {
      visibleCurve.push([
        lerp(curvePoints[whole][0], curvePoints[whole + 1][0], drawn - whole),
        lerp(curvePoints[whole][1], curvePoints[whole + 1][1], drawn - whole)
      ]);
    }
    ctx.beginPath();
    visibleCurve.forEach((point, index) => index ? ctx.lineTo(...point) : ctx.moveTo(...point));
    const ridgeLight = lerp(0.28, 0.72, waveReveal);
    if (ridgeLight > 0.01) {
      ctx.strokeStyle = "#0D6BFF";
      // Small screens keep a clean ridge without a full-canvas shadow pass.
      if (!mobile) {
        ctx.globalAlpha = intro * ridgeLight * 0.085;
        ctx.lineWidth = 12;
        ctx.shadowColor = "#0D6BFF";
        ctx.shadowBlur = 28;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = intro * ridgeLight * (mobile ? 0.28 : 0.20);
      ctx.lineWidth = mobile ? 2.8 : 5;
      ctx.stroke();
    }
    ctx.globalAlpha = intro * (0.5 + ridgeLight * 0.5);
    ctx.strokeStyle = "#0D6BFF";
    ctx.lineWidth = lerp(0.95, mobile ? 1.65 : 2, ridgeLight);
    ctx.stroke();

    // One welcoming ray follows the already drawn line, then yields to the sea.
    // The final/reduced-motion frame has no introductory ray to replay.
    if (timeline && timeline.linePulseOpacity > 0) {
      drawPacket(Math.min(lineDraw, timeline.linePulseProgress), 0.46,
        mobile ? 0.085 : 0.055, intro * timeline.linePulseOpacity, 1.25);
    }

    ctx.restore();
  }

  // Public only so the same renderer can produce an exact static OG frame.
  globalThis.WayvexScene = Object.freeze({ renderFrame, timelineState });
  if (typeof document === "undefined") return;

  const body = document.body;
  const stage = document.getElementById("stage");
  const masthead = document.querySelector(".masthead");
  const experience = document.getElementById("experience");
  const canvas = document.getElementById("wave-canvas");
  const status = document.getElementById("status");
  const motionToggle = document.getElementById("motion-toggle");
  if (status) status.textContent = STATUS;
  if (!stage || !experience || !canvas) return;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let motionOptIn = false;
  const motionReduced = () => reducedMotion.matches && !motionOptIn;
  let ctx;
  try { ctx = canvas.getContext("2d", { alpha: true }); } catch (_) { return; }
  if (!ctx) return; // The accessible SVG and all content remain available.

  body.classList.add("js-ready", "canvas-ready");
  const startedAt = performance.now();
  let lastFrameAt = startedAt;
  let lastScrollAt = startedAt;
  let previousScrollY = window.scrollY;
  let elapsed = 0;
  let timeline = reducedMotion.matches ? TIMELINE_DURATION : 0;
  let intro = reducedMotion.matches ? 1 : 0;
  let motionSpeed = 1;
  let scrollBoost = 0;
  let width = 1;
  let height = 1;
  let scale = 1;
  let initialBrandScale = 1;
  let initialBrandY = 0;
  let frame = 0;
  let running = false;
  let onScreen = true;
  let pageActive = true;
  let quality = 1;
  let slowFrames = 0;
  const pointer = { x: 0.5, y: 0.5, strength: 0 };
  const pointerTarget = { x: 0.5, y: 0.5, strength: 0 };

  function setState() {
    const state = timelineState(timeline);
    intro = between(timeline, 0, 0.6);
    stage.style.setProperty("--timeline", timeline.toFixed(3));
    stage.style.setProperty("--motion-speed", motionSpeed.toFixed(3));
    stage.style.setProperty("--intro", intro.toFixed(4));
    stage.style.setProperty("--brand-opacity", state.brandOpacity.toFixed(4));
    stage.style.setProperty("--brand-shine-x", `${lerp(-50, 50, state.brandShineProgress).toFixed(3)}%`);
    stage.style.setProperty("--brand-shine-opacity", state.brandShineOpacity.toFixed(4));
    stage.style.setProperty("--brand-dock", state.brandDock.toFixed(5));
    stage.style.setProperty("--brand-scale-dock", state.brandScaleDock.toFixed(5));
    stage.style.setProperty("--brand-y", `${((1 - state.brandDock) * initialBrandY).toFixed(3)}px`);
    stage.style.setProperty("--brand-scale", lerp(initialBrandScale, 1, state.brandScaleDock).toFixed(5));
    stage.style.setProperty("--hero-way", state.heroWay.toFixed(4));
    stage.style.setProperty("--hero-wave", state.heroWave.toFixed(4));
    stage.style.setProperty("--status-reveal", state.status.toFixed(4));
    const hidden = String(state.status <= 0.02);
    if (status && status.getAttribute("aria-hidden") !== hidden) {
      status.setAttribute("aria-hidden", hidden);
    }
  }

  function draw() {
    // Set rather than compound the transform so resizing cannot accumulate scale.
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderFrame(ctx, width, height, { time: elapsed, timeline, intro, pointer, quality });
  }

  function resize() {
    const bounds = stage.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    const viewportWidth = window.innerWidth || width;
    const mobile = viewportWidth <= 700;
    // Read fixed layout values before applying transforms: this also matches
    // the inclusive mobile breakpoint and CSS vh units in short viewports.
    const brandStyle = masthead && window.getComputedStyle ? window.getComputedStyle(masthead) : null;
    const finalBrandWidth = parseFloat(brandStyle?.width) || (mobile ? 210 : 280);
    const brandTop = parseFloat(brandStyle?.top) || (mobile ? 34 : viewportWidth >= 1600 ? (window.innerHeight || height) * 0.06 : 42);
    initialBrandScale = (mobile ? width * 0.86 : Math.min(width * 0.8, 580)) / finalBrandWidth;
    initialBrandY = height / 2 - (brandTop + finalBrandWidth / 10);
    // A 2× mobile backing store keeps the narrow light cores crisp on Retina screens.
    scale = Math.min(window.devicePixelRatio || 1, 2);
    quality = width < 700 ? 0.68 : 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    setState();
    draw();
  }

  function tick(now) {
    frame = 0;
    if (!running) return;
    const rawDelta = now - lastFrameAt;
    const delta = Math.max(0, Math.min(rawDelta, 50));
    lastFrameAt = now;

    // Native scrolling supplies momentum. Its direction and absolute position
    // never scrub, reverse, cancel, or restart the automatic story.
    scrollBoost *= Math.exp(-delta / 1100);
    const desiredSpeed = 1 + scrollBoost;
    motionSpeed = lerp(motionSpeed, desiredSpeed, 1 - Math.exp(-delta / 220));
    motionSpeed = clamp(motionSpeed, 1, 3);
    const previousTimeline = timeline;
    timeline = Math.min(TIMELINE_DURATION, timeline + delta / 1000 * motionSpeed * INTRO_SPEED);
    // Breathing responds too, but stays calmer than the narrative: at most 1.5x.
    elapsed += delta / 1000 * (1 + (motionSpeed - 1) * 0.25);

    const pointerBlend = 1 - Math.exp(-delta / 420);
    pointer.x = lerp(pointer.x, pointerTarget.x, pointerBlend);
    pointer.y = lerp(pointer.y, pointerTarget.y, pointerBlend);
    pointer.strength = lerp(pointer.strength, pointerTarget.strength, pointerBlend);
    // Once the opening is complete, only the canvas moves: avoid mobile style churn.
    if (timeline !== previousTimeline) setState();
    draw();

    // Sustained slow devices reduce mesh density, never the scene's geometry.
    if (rawDelta > 24 && now - startedAt > 3000) slowFrames++;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 75 && quality > 0.55) {
      quality = Math.max(0.55, quality - 0.12);
      slowFrames = 0;
    }
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    running = pageActive && !document.hidden && onScreen && !motionReduced();
    if (motionToggle) {
      motionToggle.hidden = !reducedMotion.matches;
      motionToggle.textContent = motionOptIn ? "Pause animation" : "Play animation";
      motionToggle.setAttribute("aria-pressed", String(motionOptIn));
    }
    if (motionReduced()) {
      timeline = TIMELINE_DURATION;
      motionSpeed = 1;
      scrollBoost = 0;
      pointer.strength = pointerTarget.strength = 0;
      setState();
      draw();
    } else if (running) {
      lastFrameAt = performance.now();
      lastScrollAt = lastFrameAt;
      previousScrollY = window.scrollY;
      frame = requestAnimationFrame(tick);
    }
  }

  function onScroll() {
    const now = performance.now();
    const y = window.scrollY;
    const distance = Math.abs(y - previousScrollY);
    const interval = Math.max(16, Math.min(100, now - lastScrollAt));
    previousScrollY = y;
    lastScrollAt = now;
    if (motionReduced() || !running || distance < 0.25) return;
    const velocity = distance / interval; // Pixels per millisecond, either direction.
    scrollBoost = Math.min(2, scrollBoost + velocity * 0.75);
  }

  function onPointer(event) {
    if (motionReduced()) return;
    const bounds = stage.getBoundingClientRect();
    pointerTarget.x = clamp((event.clientX - bounds.left) / bounds.width);
    pointerTarget.y = clamp((event.clientY - bounds.top) / bounds.height);
    pointerTarget.strength = event.pointerType === "touch" ? 0.65 : 1;
  }

  stage.addEventListener("pointermove", onPointer, { passive: true });
  stage.addEventListener("pointerdown", onPointer, { passive: true });
  stage.addEventListener("pointerleave", () => { pointerTarget.strength = 0; }, { passive: true });
  stage.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") pointerTarget.strength = 0;
  }, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", syncPlayback);
  // Older mobile WebKit exposes MediaQueryList.addListener only. Do not let an
  // optional preference listener prevent the canvas and opening from starting.
  function onMotionPreferenceChange() {
    motionOptIn = false;
    body.classList.remove("motion-enabled");
    syncPlayback();
  }
  if (typeof reducedMotion.addEventListener === "function") {
    reducedMotion.addEventListener("change", onMotionPreferenceChange);
  } else if (typeof reducedMotion.addListener === "function") {
    reducedMotion.addListener(onMotionPreferenceChange);
  }
  if (motionToggle) motionToggle.addEventListener("click", () => {
    motionOptIn = !motionOptIn;
    body.classList.toggle("motion-enabled", motionOptIn);
    if (motionOptIn) {
      timeline = 0;
      elapsed = 0;
      scrollBoost = 0;
      motionSpeed = 1;
      setState();
      draw();
    }
    syncPlayback();
  });
  // Mobile browsers can restore a cached page with no active animation callback.
  window.addEventListener("pagehide", () => {
    pageActive = false;
    syncPlayback();
  });
  window.addEventListener("pageshow", () => {
    pageActive = true;
    const bounds = experience.getBoundingClientRect();
    onScreen = bounds.bottom > 0 && bounds.top < window.innerHeight;
    resize();
    syncPlayback();
  });
  if (typeof IntersectionObserver !== "undefined") {
    new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      syncPlayback();
    }, { rootMargin: "40px" }).observe(experience);
  }
  resize();
  if (reducedMotion.matches) body.classList.add("is-ready");
  else requestAnimationFrame(() => body.classList.add("is-ready"));
  syncPlayback();
})();
