document.addEventListener("DOMContentLoaded", () => {
  let currentMember = null;
  let typingTimeoutId = null;
  let typingSession = 0;
  const audioPlayer = document.getElementById("audio-player");

  const redirect = () => {
    sessionStorage.setItem("devtools_detected", "true");
    window.location.href = "about:blank";
  };

  if (
    sessionStorage.getItem("devtools_detected") === "true" ||
    document.referrer === "about:blank"
  ) {
    redirect();
    return;
  }

  const debuggerCheck = () => {
    if (document.hidden) return;
    const start = performance.now();
    debugger;
    const end = performance.now();
    if (end - start > 100) redirect();
  };

  setInterval(debuggerCheck, 2500);

  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      e.keyCode === 123 ||
      (e.ctrlKey && e.shiftKey && ["I", "J", "C", "K"].includes(e.key)) ||
      (e.ctrlKey && e.key === "U") ||
      (e.metaKey && e.altKey && ["I", "J", "C"].includes(e.key))
    ) {
      e.preventDefault();
      redirect();
    }
  });

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  (function () {
    const element = new Image();
    Object.defineProperty(element, "id", {
      get: function () {
        redirect();
      },
    });
    console.log(element);
  })();

  function isVideoPath(path) {
    return typeof path === "string" && /\.(mp4|webm|ogg)$/i.test(path);
  }

  function getVideoMimeType(path) {
    const ext = (path.split(".").pop() || "").toLowerCase();
    if (ext === "webm") return "video/webm";
    if (ext === "ogg") return "video/ogg";
    return "video/mp4";
  }

  function normalizeTgsPath(path) {
    return String(path || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
  }

  function resolveEmbeddedTgsEntry(embeddedAnimations, entry) {
    const seen = new Set();
    let currentEntry = entry;

    while (
      typeof currentEntry === "string" &&
      embeddedAnimations[currentEntry] &&
      !seen.has(currentEntry)
    ) {
      seen.add(currentEntry);
      currentEntry = embeddedAnimations[currentEntry];
    }

    return currentEntry;
  }

  function getEmbeddedTgsEntry(path) {
    const embeddedAnimations = window.inlineTgsAnimations || {};
    const normalizedPath = normalizeTgsPath(path);
    const fileName = normalizedPath.split("/").pop();
    const variants = [
      path,
      normalizedPath,
      normalizedPath ? `./${normalizedPath}` : "",
      fileName,
    ];

    for (const variant of variants) {
      if (variant && embeddedAnimations[variant]) {
        return resolveEmbeddedTgsEntry(embeddedAnimations, embeddedAnimations[variant]);
      }
    }

    return null;
  }

  async function decodeEmbeddedCompressedTgs(entry) {
    if (entry._animationData) {
      return entry._animationData;
    }

    if (typeof DecompressionStream === "undefined") {
      throw new Error("TGS decoding is not supported in this browser.");
    }

    const binary = atob(entry.data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decompressed = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const animationText = await new Response(decompressed).text();
    const animationData = JSON.parse(animationText);
    entry._animationData = animationData;
    return animationData;
  }

  async function readTgsAnimation(path) {
    const embeddedEntry = getEmbeddedTgsEntry(path);
    if (embeddedEntry) {
      if (
        typeof embeddedEntry === "object" &&
        embeddedEntry.encoding === "gzip-base64" &&
        typeof embeddedEntry.data === "string"
      ) {
        return decodeEmbeddedCompressedTgs(embeddedEntry);
      }

      return embeddedEntry;
    }

    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load TGS asset: ${path}`);
    }

    if (!response.body || typeof DecompressionStream === "undefined") {
      throw new Error("TGS decoding is not supported in this browser.");
    }

    const decompressed = response.body.pipeThrough(
      new DecompressionStream("gzip"),
    );
    const animationText = await new Response(decompressed).text();
    return JSON.parse(animationText);
  }

  async function loadInlineTgsIcon(icon, lottiePlayer) {
    if (!icon || !lottiePlayer) return;

    const src = icon.getAttribute("data-tgs-src");
    if (!src) return;

    const normalizedSrc = normalizeTgsPath(src);
    const previousSrc = icon.dataset.tgsCurrentSrc;

    if (previousSrc && previousSrc !== normalizedSrc && icon._tgsAnimation) {
      icon._tgsAnimation.destroy();
      delete icon._tgsAnimation;
      delete icon.dataset.tgsState;
    }

    if (
      icon.dataset.tgsState === "loading" ||
      icon.dataset.tgsState === "ready"
    ) {
      return;
    }

    icon.dataset.tgsCurrentSrc = normalizedSrc;
    icon.dataset.tgsState = "loading";

    try {
      const animationData = await readTgsAnimation(src);
      icon._tgsAnimation = lottiePlayer.loadAnimation({
        container: icon,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
        rendererSettings: {
          preserveAspectRatio: "xMidYMid meet",
        },
      });
      icon.dataset.tgsState = "ready";
    } catch (error) {
      icon.dataset.tgsState = "error";
      console.error("Failed to render TGS icon:", error);
    }
  }

  function collectInlineTgsIcons(root) {
    const icons = [];
    if (!root) return icons;

    if (root.nodeType === Node.ELEMENT_NODE && root.matches("[data-tgs-src]")) {
      icons.push(root);
    }

    if (typeof root.querySelectorAll === "function") {
      icons.push(...root.querySelectorAll("[data-tgs-src]"));
    }

    return icons;
  }

  function setupInlineTgsIcons(root = document) {
    const lottiePlayer = window.lottie || window.bodymovin;
    if (!lottiePlayer) return;

    const icons = collectInlineTgsIcons(root);
    if (!icons.length) return;

    for (const icon of icons) {
      void loadInlineTgsIcon(icon, lottiePlayer);
    }
  }

  function observeInlineTgsIcons() {
    if (!document.body || typeof MutationObserver === "undefined") return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            setupInlineTgsIcons(node);
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function setupTiltCards() {
    const supportsHover = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!supportsHover || reducedMotion) return;

    document.querySelectorAll(".tilt-card").forEach((card) => {
      let frameId = null;
      let pointerX = 0;
      let pointerY = 0;

      const resetTilt = () => {
        card.classList.remove("is-tilting");
        card.style.setProperty("--card-rx", "0deg");
        card.style.setProperty("--card-ry", "0deg");
        card.style.setProperty("--glow-x", "50%");
        card.style.setProperty("--glow-y", "50%");
        card.style.removeProperty("--lift");
      };

      const applyTilt = () => {
        frameId = null;
        const rect = card.getBoundingClientRect();
        const x = Math.min(Math.max(pointerX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(pointerY - rect.top, 0), rect.height);
        const percentX = rect.width ? x / rect.width : 0.5;
        const percentY = rect.height ? y / rect.height : 0.5;
        const rotateY = (percentX - 0.5) * 10;
        const rotateX = (0.5 - percentY) * 8;

        card.style.setProperty("--card-rx", `${rotateX.toFixed(2)}deg`);
        card.style.setProperty("--card-ry", `${rotateY.toFixed(2)}deg`);
        card.style.setProperty("--glow-x", `${(percentX * 100).toFixed(1)}%`);
        card.style.setProperty("--glow-y", `${(percentY * 100).toFixed(1)}%`);
      };

      const queueTilt = (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        if (!frameId) frameId = requestAnimationFrame(applyTilt);
      };

      card.addEventListener("pointerenter", (event) => {
        card.classList.add("is-tilting");
        queueTilt(event);
      });

      card.addEventListener("pointermove", queueTilt);

      card.addEventListener("pointerleave", () => {
        if (frameId) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
        resetTilt();
      });

      card.addEventListener("pointerdown", () => {
        card.style.setProperty("--lift", "2px");
      });

      card.addEventListener("pointerup", () => {
        card.style.removeProperty("--lift");
      });
    });
  }

  function createStormController() {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion || !document.body) {
      return {
        activate() {},
        deactivate() {},
      };
    }

    const layer = document.createElement("div");
    layer.className = "storm-layer";
    layer.setAttribute("aria-hidden", "true");

    const rainCanvas = document.createElement("canvas");
    rainCanvas.className = "storm-canvas storm-rain-canvas";

    const lightningCanvas = document.createElement("canvas");
    lightningCanvas.className = "storm-canvas storm-lightning-canvas";

    const bloom = document.createElement("div");
    bloom.className = "storm-bloom";

    const flash = document.createElement("div");
    flash.className = "storm-flash";

    layer.append(rainCanvas, lightningCanvas, bloom, flash);
    document.body.appendChild(layer);

    const rainCtx = rainCanvas.getContext("2d");
    const lightningCtx = lightningCanvas.getContext("2d");

    if (!rainCtx || !lightningCtx) {
      layer.remove();
      return {
        activate() {},
        deactivate() {},
      };
    }

    const surfaceSelector =
      ".section-block, .member-tile, #member-info, .ascii-logo, #controls, footer, .footer";

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const lerp = (start, end, amount) => start + (end - start) * amount;
    const randomBetween = (min, max) => min + Math.random() * (max - min);

    const state = {
      active: false,
      running: false,
      rafId: null,
      targetVisibility: 0,
      visibility: 0,
      lastFrame: 0,
      width: 0,
      height: 0,
      dpr: 1,
      renderScale: 0.8,
      drops: [],
      splashes: [],
      sparks: [],
      bolts: [],
      pulses: [],
      pendingStrikes: [],
      surfaceEntries: [],
      surfacesDirty: true,
      primaryAnchor: null,
      secondaryAnchor: null,
      focusX: window.innerWidth * 0.5,
      focusY: window.innerHeight * 0.26,
      nextStrikeAt: 0,
    };

    const pulseFrames = [
      [0, 0],
      [0.03, 1],
      [0.11, 0.24],
      [0.19, 0.9],
      [0.34, 0.16],
      [1, 0],
    ];

    function readRect(element) {
      if (!element || !element.isConnected) return null;

      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return rect;
    }

    function sampleFrames(frames, progress) {
      if (progress <= frames[0][0]) return frames[0][1];

      for (let index = 1; index < frames.length; index += 1) {
        const [nextProgress, nextValue] = frames[index];

        if (progress <= nextProgress) {
          const [prevProgress, prevValue] = frames[index - 1];
          const localProgress =
            (progress - prevProgress) / (nextProgress - prevProgress || 1);
          return lerp(prevValue, nextValue, localProgress);
        }
      }

      return frames[frames.length - 1][1];
    }

    function markSurfacesDirty() {
      state.surfacesDirty = true;
    }

    function refreshSurfaceCache(force = false) {
      if (!force && !state.surfacesDirty) return;

      state.surfaceEntries = Array.from(document.querySelectorAll(surfaceSelector)).map(
        (element) => ({
          element,
          rect: readRect(element),
        }),
      );
      state.surfacesDirty = false;
    }

    function getSurfaceEntries(force = false) {
      refreshSurfaceCache(force);
      return state.surfaceEntries;
    }

    function getVisibleSurfaceEntries() {
      return getSurfaceEntries().filter(
        (entry) =>
          entry.rect &&
          entry.rect.bottom > -state.height * 0.16 &&
          entry.rect.top < state.height * 1.08,
      );
    }

    function createDrop(spawnAtTop = false) {
      return {
        x: randomBetween(-state.width * 0.12, state.width * 1.1),
        y: spawnAtTop
          ? randomBetween(-state.height * 0.3, 0)
          : randomBetween(-state.height * 0.08, state.height),
        length: randomBetween(16, 34),
        speed: randomBetween(520, 880),
        thickness: randomBetween(0.55, 1.35),
        alpha: randomBetween(0.12, 0.3),
        drift: randomBetween(112, 178),
      };
    }

    function resizeScene() {
      state.width = window.innerWidth;
      state.height = window.innerHeight;
      state.renderScale = state.width < 720 ? 0.68 : 0.82;
      state.dpr = Math.min(
        (window.devicePixelRatio || 1) * state.renderScale,
        1.25,
      );

      [rainCanvas, lightningCanvas].forEach((canvas) => {
        canvas.width = Math.floor(state.width * state.dpr);
        canvas.height = Math.floor(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
      });

      rainCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      lightningCtx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

      const dropCount = Math.round(clamp(state.width * 0.092, 42, 118));
      while (state.drops.length < dropCount) {
        state.drops.push(createDrop());
      }
      state.drops.length = dropCount;
      markSurfacesDirty();
    }

    function scheduleNextStrike(minDelay = 2400, maxDelay = 5000) {
      state.nextStrikeAt = performance.now() + randomBetween(minDelay, maxDelay);
    }

    function spawnSplash(x, y, strength = 1) {
      const count = Math.max(2, Math.round(randomBetween(3, 7) * strength));

      for (let index = 0; index < count; index += 1) {
        state.splashes.push({
          x,
          y,
          vx: randomBetween(-58, 58) * strength,
          vy: -randomBetween(26, 118) * strength,
          age: 0,
          life: randomBetween(0.18, 0.42),
          size: randomBetween(0.8, 2.3),
          alpha: randomBetween(0.14, 0.34),
        });
      }
    }

    function spawnImpactSparks(x, y, strength = 1) {
      const count = Math.max(4, Math.round(randomBetween(6, 12) * strength));

      for (let index = 0; index < count; index += 1) {
        const angle = randomBetween(-Math.PI * 0.96, -Math.PI * 0.04);
        const speed = randomBetween(110, 420) * strength;

        state.sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          age: 0,
          life: randomBetween(0.18, 0.46),
          size: randomBetween(0.8, 1.9),
          alpha: randomBetween(0.22, 0.56),
          glow: randomBetween(5, 14),
        });
      }
    }

    function resolveStrikePoint(referencePoint = null) {
      if (referencePoint) {
        return {
          x: clamp(referencePoint.x, 40, state.width - 40),
          y: clamp(referencePoint.y, 40, state.height - 8),
        };
      }

      const candidateRects = [
        readRect(state.primaryAnchor),
        readRect(state.secondaryAnchor),
      ].filter(Boolean);
      const visibleSurfaces = getVisibleSurfaceEntries();
      const lowestVisibleSurface = visibleSurfaces.reduce((lowest, entry) => {
        if (!lowest || entry.rect.bottom > lowest.rect.bottom) return entry;
        return lowest;
      }, null);
      const targetRect =
        candidateRects.length && Math.random() < 0.24
          ? candidateRects[Math.floor(Math.random() * candidateRects.length)]
          : null;

      if (targetRect && Math.random() < 0.82) {
        return {
          x: clamp(
            targetRect.left + targetRect.width * randomBetween(0.12, 0.88),
            40,
            state.width - 40,
          ),
          y: clamp(
            targetRect.top + targetRect.height * randomBetween(0.08, 0.92),
            40,
            state.height - 8,
          ),
        };
      }

      if (visibleSurfaces.length && Math.random() < 0.28) {
        const weightedSurfaces = [...visibleSurfaces];

        if (
          lowestVisibleSurface &&
          lowestVisibleSurface.rect.bottom > state.height * 0.58
        ) {
          weightedSurfaces.push(lowestVisibleSurface, lowestVisibleSurface);
        }

        const surface =
          weightedSurfaces[Math.floor(Math.random() * weightedSurfaces.length)];

        return {
          x: clamp(
            surface.rect.left + surface.rect.width * randomBetween(0.08, 0.92),
            36,
            state.width - 36,
          ),
          y: clamp(
            surface.rect.top + surface.rect.height * randomBetween(0.04, 0.96),
            36,
            state.height - 8,
          ),
        };
      }

      const bandRoll = Math.random();
      let bandStart = 0.08;
      let bandEnd = 0.96;

      if (bandRoll < 0.33) {
        bandStart = 0.06;
        bandEnd = 0.28;
      } else if (bandRoll < 0.66) {
        bandStart = 0.26;
        bandEnd = 0.62;
      } else {
        bandStart = 0.58;
        bandEnd = 0.98;
      }

      return {
        x: randomBetween(state.width * 0.04, state.width * 0.96),
        y: randomBetween(state.height * bandStart, state.height * bandEnd),
      };
    }

    function buildBoltPoints(startX, startY, endX, endY, sway, allowBranches) {
      const points = [{ x: startX, y: startY }];
      const branches = [];
      const steps = Math.max(7, Math.round((endY - startY) / 48));
      let currentX = startX;

      for (let stepIndex = 1; stepIndex < steps; stepIndex += 1) {
        const progress = stepIndex / steps;
        const currentY = lerp(startY, endY, progress);
        const attraction = (endX - currentX) * (0.24 + progress * 0.16);
        const noise = randomBetween(-sway, sway) * (1 - progress * 0.68);

        currentX += attraction + noise;
        points.push({ x: currentX, y: currentY });

        if (
          allowBranches &&
          progress > 0.18 &&
          progress < 0.78 &&
          Math.random() < 0.1
        ) {
          const branchEndX = clamp(
            currentX + randomBetween(-130, 130),
            -40,
            state.width + 40,
          );
          const branchEndY = clamp(
            currentY + randomBetween(54, 160),
            0,
            state.height,
          );
          branches.push({
            ...buildBoltPoints(
              currentX,
              currentY,
              branchEndX,
              branchEndY,
              sway * 0.52,
              false,
            ),
            widthFactor: randomBetween(0.34, 0.58),
          });
        }
      }

      points.push({ x: endX, y: endY });
      return { points, branches };
    }

    function createBolt(point, strength, now) {
      const startX = point.x + randomBetween(-160, 160);
      const startY = -randomBetween(24, 108);

      return {
        ...buildBoltPoints(
          startX,
          startY,
          point.x,
          point.y,
          randomBetween(20, 42),
          true,
        ),
        createdAt: now,
        duration: randomBetween(220, 420),
        width: randomBetween(1.8, 3.2) * strength,
        glow: randomBetween(8, 16) * strength,
        alpha: randomBetween(0.8, 0.98) * strength,
      };
    }

    function queueStrike(referencePoint = null, strength = 1, allowCluster = true) {
      const now = performance.now();
      const point = resolveStrikePoint(referencePoint);

      state.focusX = point.x;
      state.focusY = point.y;
      state.bolts.push(createBolt(point, strength, now));
      state.pulses.push({
        x: point.x,
        y: point.y,
        start: now,
        duration: 1180,
        strength,
      });

      spawnSplash(
        point.x,
        clamp(point.y + randomBetween(10, 34), 40, state.height - 6),
        0.95 * strength,
      );
      spawnImpactSparks(point.x, point.y, strength);

      if (allowCluster && Math.random() < 0.46) {
        const followUps = Math.round(randomBetween(0, 2));
        for (let index = 0; index < followUps; index += 1) {
          state.pendingStrikes.push({
            at: now + randomBetween(90, 210),
            point: {
              x: point.x + randomBetween(-92, 92),
              y: point.y + randomBetween(-48, 220),
            },
            strength: randomBetween(0.52, 0.76),
          });
        }
      }
    }

    function updateSurfaceLighting(flashLevel) {
      const wetness = state.visibility.toFixed(3);

      getSurfaceEntries().forEach(({ element: surface, rect }) => {
        surface.style.setProperty("--storm-wetness", wetness);

        if (!rect || (surface.id === "member-info" && !surface.childElementCount)) {
          surface.style.setProperty("--storm-surface-intensity", "0");
          surface.style.setProperty("--storm-specular", "0");
          surface.style.setProperty("--storm-shadow-depth", "0");
          return;
        }

        const localX = clamp(
          ((state.focusX - rect.left) / rect.width) * 100,
          -20,
          120,
        );
        const localY = clamp(
          ((state.focusY - rect.top) / rect.height) * 100,
          -20,
          140,
        );
        const centerX = rect.left + rect.width * 0.5;
        const centerY = rect.top + rect.height * 0.5;
        let proximity =
          1 - Math.hypot(state.focusX - centerX, state.focusY - centerY) /
            Math.max(state.width * 0.78, 1);

        proximity = clamp(proximity, 0, 1);

        if (surface.classList.contains("member-tile-active")) {
          proximity = Math.min(1, proximity + 0.22);
        }

        if (surface.id === "member-info" && surface.childElementCount > 0) {
          proximity = Math.min(1, proximity + 0.18);
        }

        const surfaceIntensity = clamp(
          flashLevel * (0.24 + proximity * 0.94),
          0,
          1,
        );
        const specular = clamp(
          flashLevel * (0.2 + proximity * 1.08) + state.visibility * 0.08,
          0,
          1,
        );
        const shadowDepth = clamp(
          flashLevel * (0.16 + proximity * 0.66) + state.visibility * 0.18,
          0,
          1,
        );

        surface.style.setProperty("--storm-light-x", `${localX.toFixed(2)}%`);
        surface.style.setProperty("--storm-light-y", `${localY.toFixed(2)}%`);
        surface.style.setProperty(
          "--storm-surface-intensity",
          surfaceIntensity.toFixed(3),
        );
        surface.style.setProperty("--storm-specular", specular.toFixed(3));
        surface.style.setProperty(
          "--storm-shadow-depth",
          shadowDepth.toFixed(3),
        );
      });
    }

    function resetSurfaceLighting() {
      getSurfaceEntries().forEach(({ element }) => {
        element.style.setProperty("--storm-wetness", "0");
        element.style.setProperty("--storm-surface-intensity", "0");
        element.style.setProperty("--storm-specular", "0");
        element.style.setProperty("--storm-shadow-depth", "0");
      });
    }

    function clearStormCanvases() {
      rainCtx.clearRect(0, 0, state.width, state.height);
      lightningCtx.clearRect(0, 0, state.width, state.height);
    }

    function drawRain(delta, flashLevel) {
      rainCtx.clearRect(0, 0, state.width, state.height);

      if (state.visibility < 0.01 && !state.active) return;

      const brightness = 1 + flashLevel * 0.9;
      rainCtx.save();
      rainCtx.lineCap = "round";
      rainCtx.shadowBlur = 6 + flashLevel * 14;
      rainCtx.shadowColor = `rgba(255, 120, 120, ${0.08 + flashLevel * 0.24})`;

      state.drops.forEach((drop) => {
        drop.x += drop.drift * delta;
        drop.y += drop.speed * delta;

        if (drop.y - drop.length > state.height || drop.x > state.width + 110) {
          if (Math.random() < 0.06 * state.visibility) {
            spawnSplash(
              clamp(drop.x, 0, state.width),
              state.height - randomBetween(24, 110),
              0.32,
            );
          }

          Object.assign(drop, createDrop(true));
        }

        const tailX = drop.x - drop.drift * 0.0027 * drop.length;
        const opacity = drop.alpha * state.visibility;
        const red = Math.round(clamp(156 * brightness, 0, 255));
        const green = Math.round(clamp(18 + flashLevel * 34, 0, 255));
        const blue = Math.round(clamp(22 + flashLevel * 34, 0, 255));

        rainCtx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
        rainCtx.lineWidth = drop.thickness + flashLevel * 0.44;
        rainCtx.beginPath();
        rainCtx.moveTo(drop.x, drop.y);
        rainCtx.lineTo(tailX, drop.y - drop.length);
        rainCtx.stroke();

        rainCtx.strokeStyle = `rgba(255, 246, 246, ${opacity * (0.12 + flashLevel * 0.38)})`;
        rainCtx.lineWidth = Math.max(0.4, drop.thickness * 0.45);
        rainCtx.beginPath();
        rainCtx.moveTo(drop.x, drop.y);
        rainCtx.lineTo(lerp(drop.x, tailX, 0.32), drop.y - drop.length * 0.3);
        rainCtx.stroke();
      });

      state.splashes = state.splashes.filter((splash) => {
        splash.age += delta;
        if (splash.age >= splash.life) return false;

        splash.x += splash.vx * delta;
        splash.y += splash.vy * delta;
        splash.vy += 280 * delta;

        const life = 1 - splash.age / splash.life;
        rainCtx.fillStyle = `rgba(255, 178, 178, ${splash.alpha * life * (0.7 + flashLevel * 0.4)})`;
        rainCtx.beginPath();
        rainCtx.arc(splash.x, splash.y, splash.size * life, 0, Math.PI * 2);
        rainCtx.fill();
        return true;
      });

      rainCtx.restore();
    }

    function drawSparks(delta, flashLevel) {
      state.sparks = state.sparks.filter((spark) => {
        spark.age += delta;
        if (spark.age >= spark.life) return false;

        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;
        spark.vy += 520 * delta;
        spark.vx *= 0.988;

        const life = 1 - spark.age / spark.life;
        const trailX = spark.x - spark.vx * 0.018;
        const trailY = spark.y - spark.vy * 0.018;
        const alpha = spark.alpha * life * (0.72 + flashLevel * 0.28);

        lightningCtx.beginPath();
        lightningCtx.strokeStyle = `rgba(255, 214, 214, ${alpha})`;
        lightningCtx.lineWidth = Math.max(0.8, spark.size * life);
        lightningCtx.shadowBlur = spark.glow * life;
        lightningCtx.shadowColor = `rgba(255, 110, 110, ${alpha * 0.96})`;
        lightningCtx.moveTo(spark.x, spark.y);
        lightningCtx.lineTo(trailX, trailY);
        lightningCtx.stroke();

        lightningCtx.beginPath();
        lightningCtx.fillStyle = `rgba(255, 248, 248, ${alpha * 0.9})`;
        lightningCtx.arc(spark.x, spark.y, spark.size * life * 0.66, 0, Math.PI * 2);
        lightningCtx.fill();

        return true;
      });
    }

    function traceBolt(points) {
      lightningCtx.beginPath();
      lightningCtx.moveTo(points[0].x, points[0].y);

      for (let index = 1; index < points.length; index += 1) {
        lightningCtx.lineTo(points[index].x, points[index].y);
      }
    }

    function drawBolt(points, width, alpha, glow) {
      traceBolt(points);
      lightningCtx.strokeStyle = `rgba(255, 72, 72, ${alpha * 0.24})`;
      lightningCtx.lineWidth = width + glow;
      lightningCtx.shadowBlur = glow * 0.8;
      lightningCtx.shadowColor = `rgba(255, 88, 88, ${alpha * 0.82})`;
      lightningCtx.stroke();

      traceBolt(points);
      lightningCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      lightningCtx.lineWidth = Math.max(0.75, width * 0.34);
      lightningCtx.shadowBlur = 0;
      lightningCtx.stroke();
    }

    function drawLightning(now, delta, flashLevel) {
      lightningCtx.clearRect(0, 0, state.width, state.height);

      if (!state.bolts.length && !state.sparks.length && flashLevel < 0.04) return;

      lightningCtx.save();
      lightningCtx.globalCompositeOperation = "screen";

      if (flashLevel > 0.04) {
        const bloomRadius = 160 + flashLevel * 180;
        const bloomGradient = lightningCtx.createRadialGradient(
          state.focusX,
          state.focusY,
          0,
          state.focusX,
          state.focusY,
          bloomRadius,
        );
        bloomGradient.addColorStop(
          0,
          `rgba(255, 255, 255, ${flashLevel * 0.18})`,
        );
        bloomGradient.addColorStop(
          0.18,
          `rgba(255, 124, 124, ${flashLevel * 0.12})`,
        );
        bloomGradient.addColorStop(1, "rgba(16, 0, 0, 0)");
        lightningCtx.fillStyle = bloomGradient;
        lightningCtx.fillRect(
          state.focusX - bloomRadius,
          state.focusY - bloomRadius,
          bloomRadius * 2,
          bloomRadius * 2,
        );

        const shaftWidth = 18 + flashLevel * 36;
        const shaftGradient = lightningCtx.createLinearGradient(
          state.focusX,
          0,
          state.focusX,
          state.focusY + 90,
        );
        shaftGradient.addColorStop(
          0,
          `rgba(255, 244, 244, ${flashLevel * 0.16})`,
        );
        shaftGradient.addColorStop(
          0.38,
          `rgba(255, 118, 118, ${flashLevel * 0.1})`,
        );
        shaftGradient.addColorStop(1, "rgba(28, 0, 0, 0)");
        lightningCtx.strokeStyle = shaftGradient;
        lightningCtx.lineWidth = shaftWidth;
        lightningCtx.lineCap = "round";
        lightningCtx.shadowBlur = 10 + flashLevel * 12;
        lightningCtx.shadowColor = `rgba(255, 136, 136, ${flashLevel * 0.12})`;
        lightningCtx.beginPath();
        lightningCtx.moveTo(state.focusX, 0);
        lightningCtx.lineTo(state.focusX, state.focusY + 24);
        lightningCtx.stroke();

        const floorGlowRadius = 72 + flashLevel * 92;
        const floorGlow = lightningCtx.createRadialGradient(
          state.focusX,
          state.focusY + 14,
          0,
          state.focusX,
          state.focusY + 14,
          floorGlowRadius,
        );
        floorGlow.addColorStop(
          0,
          `rgba(255, 255, 255, ${flashLevel * 0.12})`,
        );
        floorGlow.addColorStop(
          0.24,
          `rgba(255, 110, 110, ${flashLevel * 0.08})`,
        );
        floorGlow.addColorStop(1, "rgba(18, 0, 0, 0)");
        lightningCtx.fillStyle = floorGlow;
        lightningCtx.beginPath();
        lightningCtx.ellipse(
          state.focusX,
          state.focusY + 12,
          floorGlowRadius,
          floorGlowRadius * 0.34,
          0,
          0,
          Math.PI * 2,
        );
        lightningCtx.fill();
      }

      state.bolts = state.bolts.filter((bolt) => {
        const progress = clamp((now - bolt.createdAt) / bolt.duration, 0, 1);
        const life = 1 - progress;
        if (life <= 0) return false;

        const flicker = 0.74 + Math.random() * 0.36;
        drawBolt(
          bolt.points,
          bolt.width,
          bolt.alpha * life * flicker,
          bolt.glow * life,
        );

        bolt.branches.forEach((branch) => {
          drawBolt(
            branch.points,
            bolt.width * branch.widthFactor,
            bolt.alpha * life * 0.58 * flicker,
            bolt.glow * 0.6 * life,
          );
        });

        return true;
      });

      drawSparks(delta, flashLevel);

      lightningCtx.restore();
    }

    function updatePulseLevel(now) {
      let strongest = 0;

      state.pulses = state.pulses.filter((pulse) => {
        const progress = (now - pulse.start) / pulse.duration;
        if (progress >= 1) return false;

        const level = sampleFrames(pulseFrames, progress) * pulse.strength;
        if (level > strongest) {
          strongest = level;
          state.focusX = pulse.x;
          state.focusY = pulse.y;
        }

        return true;
      });

      if (state.sparks.length) {
        strongest = Math.max(strongest, 0.12);
      }

      return clamp(strongest, 0, 1);
    }

    function syncVars(flashLevel) {
      document.body.style.setProperty(
        "--storm-visibility",
        state.visibility.toFixed(3),
      );
      document.body.style.setProperty(
        "--storm-light-intensity",
        flashLevel.toFixed(3),
      );
      document.body.style.setProperty(
        "--storm-flash",
        clamp(flashLevel * 1.08, 0, 1).toFixed(3),
      );
      document.body.style.setProperty(
        "--storm-focus-x",
        `${state.focusX.toFixed(1)}px`,
      );
      document.body.style.setProperty(
        "--storm-focus-y",
        `${state.focusY.toFixed(1)}px`,
      );
    }

    function ensureRunning() {
      if (state.running) return;
      state.running = true;
      state.lastFrame = 0;
      state.rafId = requestAnimationFrame(step);
    }

    function stopRunning() {
      state.running = false;
      state.rafId = null;
      state.lastFrame = 0;
    }

    function step(timestamp) {
      if (!state.running) return;
      if (!state.lastFrame) state.lastFrame = timestamp;

      const delta = Math.min((timestamp - state.lastFrame) / 1000, 0.035);
      state.lastFrame = timestamp;

      const easing = 1 - Math.exp(-delta * (state.active ? 5.6 : 3.6));
      state.visibility = lerp(state.visibility, state.targetVisibility, easing);

      if (state.active && timestamp >= state.nextStrikeAt) {
        queueStrike();
        scheduleNextStrike();
      }

      state.pendingStrikes = state.pendingStrikes.filter((entry) => {
        if (entry.at > timestamp) return true;
        queueStrike(entry.point, entry.strength, false);
        return false;
      });

      const flashLevel = updatePulseLevel(timestamp);
      drawRain(delta, flashLevel);
      drawLightning(timestamp, delta, flashLevel);
      updateSurfaceLighting(flashLevel);
      syncVars(flashLevel);

      const hasWork =
        state.active ||
        state.visibility >= 0.03 ||
        state.bolts.length ||
        state.pulses.length ||
        state.sparks.length ||
        state.splashes.length ||
        state.pendingStrikes.length;

      if (!hasWork) {
        document.body.classList.remove("storm-active");
        clearStormCanvases();
        resetSurfaceLighting();
        syncVars(0);
        stopRunning();
        return;
      }

      state.rafId = requestAnimationFrame(step);
    }

    resizeScene();
    scheduleNextStrike(3200, 5200);
    window.addEventListener("resize", resizeScene, { passive: true });
    window.addEventListener("scroll", markSurfacesDirty, { passive: true });

    const surfaceObserver = new MutationObserver(() => {
      markSurfacesDirty();
    });

    surfaceObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return {
      activate({ primary = null, secondary = null } = {}) {
        state.active = true;
        state.targetVisibility = 1;
        state.primaryAnchor = primary;
        state.secondaryAnchor = secondary;
        state.pendingStrikes = [];
        markSurfacesDirty();
        refreshSurfaceCache(true);
        document.body.classList.add("storm-active");
        ensureRunning();
        queueStrike();
        scheduleNextStrike(2800, 4800);
      },
      deactivate() {
        state.active = false;
        state.targetVisibility = 0;
        state.primaryAnchor = null;
        state.secondaryAnchor = null;
        state.pendingStrikes = [];
        markSurfacesDirty();
        ensureRunning();
        scheduleNextStrike(3800, 5800);
      },
    };
  }

  const stormController = createStormController();

  function renderMemberMedia(src, name, memberId) {
    if (!src) return "";
    const avatarClass =
      memberId === "nineoneone"
        ? "fade-in member-avatar nineoneone-avatar"
        : "fade-in member-avatar";

    if (isVideoPath(src)) {
      const type = getVideoMimeType(src);
      return `
                <video class="${avatarClass}" autoplay loop muted playsinline preload="metadata">
                    <source src="${src}" type="${type}">
                </video>
            `;
    }

    return `<img src="${src}" class="${avatarClass}" draggable="false" alt="${name}">`;
  }

  const memberInfoData = {
    evil: {
      name: "EVIL",
      image: "./assets/wtf.mp4",
      description: "hello.",
      track: "./assets/yoo.mp3",
    },
    nineoneone: {
      name: "911",
      image: "./assets/911.mp4",
      description: "where is emergency?",
      track: "./assets/911.mp3",
    },
    psychokim: {
      name: "psychokim",
      image: "./assets/psychokim.mp4",
      description: '<span style="color:red">money money money</span>',
      track: "./assets/psychokim.mp3",
    },
  };

  function stopTypingAnimation() {
    typingSession += 1;
    if (typingTimeoutId) {
      window.clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
  }

  function typeHtmlContent(element, html, speed = 24) {
    if (!element) return;

    stopTypingAnimation();

    const session = typingSession;
    const template = document.createElement("template");
    const textNodes = [];
    let nodeIndex = 0;
    let charIndex = 0;

    element.innerHTML = "";
    element.classList.add("is-typing");
    template.innerHTML = html;

    const buildTypedTree = (sourceParent, targetParent) => {
      sourceParent.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const targetTextNode = document.createTextNode("");
          targetParent.appendChild(targetTextNode);
          textNodes.push({
            sourceText: node.textContent || "",
            targetTextNode,
          });
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const clone = node.cloneNode(false);
          targetParent.appendChild(clone);
          buildTypedTree(node, clone);
        }
      });
    };

    buildTypedTree(template.content, element);

    const step = () => {
      if (session !== typingSession) return;

      while (
        nodeIndex < textNodes.length &&
        charIndex >= textNodes[nodeIndex].sourceText.length
      ) {
        nodeIndex += 1;
        charIndex = 0;
      }

      if (nodeIndex >= textNodes.length) {
        element.classList.remove("is-typing");
        typingTimeoutId = null;
        return;
      }

      const currentTextNode = textNodes[nodeIndex];
      currentTextNode.targetTextNode.textContent +=
        currentTextNode.sourceText[charIndex];
      charIndex += 1;
      typingTimeoutId = window.setTimeout(step, speed);
    };

    step();
  }

  function clearMemberInfo(memberDiv, { preserveStorm = false } = {}) {
    stopTypingAnimation();
    memberDiv.innerHTML = "";
    removeBackgroundVideo();
    if (!preserveStorm) {
      stormController.deactivate();
    }
  }

  function setupMemberTiles() {
    document.querySelectorAll(".member-trigger[data-member]").forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showMember(trigger.dataset.member);
      });
    });

    document.querySelectorAll(".member-tile[data-member]").forEach((tile) => {
      tile.addEventListener("click", (event) => {
        if (event.target.closest("a")) return;
        showMember(tile.dataset.member);
      });

      tile.addEventListener("keydown", (event) => {
        if (event.target.closest("a")) return;

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showMember(tile.dataset.member);
        }
      });
    });
  }

  function showMember(member) {
    const info = memberInfoData[member];
    const memberDiv = document.getElementById("member-info");
    const selectedTile = document.querySelector(
      `.member-tile[data-member="${member}"]`,
    );
    const selectedTrigger = selectedTile?.querySelector(".member-trigger");

    if (!info || !memberDiv || !selectedTile) return;

    const isSameMember = currentMember?.dataset.member === member;

    if (currentMember) {
      currentMember.classList.remove("member-tile-active");
      currentMember.querySelector(".member-trigger")?.classList.remove("selected");
      resetDot(currentMember.dataset.member);
    }

    if (isSameMember) {
      currentMember = null;
      clearMemberInfo(memberDiv);
      resetMusic();
      return;
    }

    clearMemberInfo(memberDiv, { preserveStorm: true });

    selectedTile.classList.add("member-tile-active");
    selectedTrigger?.classList.add("selected");
    currentMember = selectedTile;

    updateDots(member);

    if (isVideoPath(info.image)) {
      showBackgroundVideo(info.image, member);
      memberDiv.innerHTML = `
                <p class="member-name">[ ${info.name} ]</p>
                <hr class="member-separator">
                <p class="glitch member-description"></p>
            `;
    } else {
      const mediaHtml = renderMemberMedia(info.image, info.name, member);
      memberDiv.innerHTML = `
                ${mediaHtml}
                <p class="member-name">[ ${info.name} ]</p>
                <hr class="member-separator">
                <p class="glitch member-description"></p>
            `;
    }

    stormController.activate({
      primary: selectedTile,
      secondary: memberDiv,
    });
    typeHtmlContent(memberDiv.querySelector(".member-description"), info.description);
    playMemberMusic(info.track);
  }

  function showBackgroundVideo(src, memberId) {
    removeBackgroundVideo();
    const videoContainer = document.createElement("div");
    videoContainer.id = "background-video-container";
    videoContainer.className = `background-video-container ${memberId}-bg`;

    if (isVideoPath(src)) {
      const type = getVideoMimeType(src);
      videoContainer.innerHTML = `
                <video class="background-video" autoplay loop muted playsinline preload="metadata">
                    <source src="${src}" type="${type}">
                </video>
            `;
    }

    document.body.insertBefore(videoContainer, document.body.firstChild);
  }

  function removeBackgroundVideo() {
    const existing = document.getElementById("background-video-container");
    if (existing) existing.remove();
  }

  function playMemberMusic(track) {
    if (!track) return;
    const trackUrl = new URL(track, window.location.href).href;
    if (audioPlayer.src !== trackUrl) {
      audioPlayer.src = track;
      audioPlayer.play();
    }
  }

  function resetMusic() {
    const defaultTrack = "./assets/main_menu.mp3";
    const defaultUrl = new URL(defaultTrack, window.location.href).href;
    if (audioPlayer.src !== defaultUrl) {
      audioPlayer.src = defaultTrack;
      audioPlayer.play();
    }
    removeBackgroundVideo();
  }

  function removeOverlay() {
    const overlay = document.getElementById("overlay");
    if (overlay) overlay.style.display = "none";
    audioPlayer.play().catch((err) => console.log("Audio play failed:", err));
  }

  function resetDot(memberId) {
    const previousDot = document.getElementById(`${memberId}-dot`);
    if (previousDot) previousDot.innerHTML = "::";
  }

  function updateDots(member) {
    document.querySelectorAll(".yellow").forEach((dot) => {
      dot.innerHTML = "::";
    });
    const currentDot = document.getElementById(`${member}-dot`);
    if (currentDot) currentDot.innerHTML = '<span class="red">•</span>';
  }

  window.removeOverlay = removeOverlay;
  window.showMember = showMember;
  setupTiltCards();
  setupMemberTiles();
  setupInlineTgsIcons();
  observeInlineTgsIcons();
});
