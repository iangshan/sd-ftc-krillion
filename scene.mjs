const POP_COLORS = ['#fdcd75', '#8af2df', '#eb88b0', '#fff0b0', '#a9a7ff'];
const SPRITE_WIDTH = 150;
const SPRITE_HEIGHT = 114;
const SPRITE_X = 74;
const SPRITE_GROUND = 94;
const REACTION_LENGTH = { start: 0.5, prompt: 0.5, hit: 0.75, miss: 0.45, finish: 1.2 };

function rectangle(context, color, x, y, width, height) {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), width, height);
}

function line(context, color, x1, y1, x2, y2, weight = 1) {
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  x2 = Math.round(x2);
  y2 = Math.round(y2);
  context.fillStyle = color;
  const width = Math.abs(x2 - x1);
  const height = -Math.abs(y2 - y1);
  const stepX = x1 < x2 ? 1 : -1;
  const stepY = y1 < y2 ? 1 : -1;
  let error = width + height;
  while (true) {
    context.fillRect(x1, y1, weight, weight);
    if (x1 === x2 && y1 === y2) break;
    const double = 2 * error;
    if (double >= height) { error += height; x1 += stepX; }
    if (double <= width) { error += width; y1 += stepY; }
  }
}

function polygon(context, color, vertices) {
  const first = Math.ceil(Math.min(...vertices.map(point => point[1])));
  const last = Math.ceil(Math.max(...vertices.map(point => point[1])));
  context.fillStyle = color;
  for (let y = first; y < last; y += 1) {
    const intersections = [];
    const row = y + 0.5;
    for (let index = 0; index < vertices.length; index += 1) {
      const [x1, y1] = vertices[index];
      const [x2, y2] = vertices[(index + 1) % vertices.length];
      if ((y1 <= row && row < y2) || (y2 <= row && row < y1)) {
        intersections.push(x1 + ((row - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2) {
      const left = Math.round(intersections[index]);
      const right = Math.round(intersections[index + 1]);
      context.fillRect(left, y, right - left, 1);
    }
  }
}

const WHEEL = [[-7, -5], [-9, -3], [-9, 4], [-6, 7], [6, 7], [8, 4], [8, -4], [5, -7], [-4, -7]];

function wheel(context, x, y, spoke) {
  polygon(context, '#151526', WHEEL.map(([dx, dy]) => [x + dx, y + dy]));
  rectangle(context, '#443b58', x - 6, y - 4, 11, 8);
  rectangle(context, '#6c5c70', x - 4, y - 3, 5, 6);
  rectangle(context, '#302c46', x - 2, y - 2, 4, 4);
  rectangle(context, '#f1b973', x - 1, y - 1, 2, 2);
  rectangle(context, '#63516a', x - 5 + spoke, y + 4, 2, 1);
  rectangle(context, '#63516a', x + 5 - spoke, y - 3, 1, 3);
}

function robot(context, x, y, ground, seconds, mode, reaction, phase) {
  const blink = mode === 'miss' ? phase < 0.75 : (seconds % 4.7) > 4.50;
  const celebrating = mode === 'hit' || mode === 'finish';
  const light = mode === 'miss' ? '#fb8e89' : celebrating ? '#f9cb6e' : '#90efdc';
  const spoke = Math.floor(seconds * (mode === 'start' || mode === 'prompt' ? 14 : 2)) % 4;
  const shadow = Math.max(1, 5 - Math.round((ground - y) / 5));
  polygon(context, '#14182f8c', [[x - 31, ground + 4], [x - 24, ground], [x + 24, ground],
    [x + 34, ground + 4], [x + 24, ground + 4 + shadow], [x - 26, ground + 4 + shadow]]);
  rectangle(context, '#293e55', x - 19, ground + 2, 37, 1);
  rectangle(context, '#406875', x - 9, ground + 2, 19, 1);

  context.save();
  context.translate(x, y);

  wheel(context, -22, -8, spoke);
  wheel(context, 21, -7, spoke);
  polygon(context, '#212239', [[-30, -15], [-25, -25], [18, -25], [31, -17],
    [31, -6], [25, -2], [-25, -2], [-31, -7]]);
  polygon(context, '#83504f', [[-31, -15], [-23, -21], [23, -21], [31, -15],
    [28, -10], [-29, -10]]);
  polygon(context, '#d18c55', [[-28, -15], [-23, -23], [18, -23], [28, -15]]);
  rectangle(context, '#ffd089', -24, -15, 49, 2);
  rectangle(context, '#cc7951', -27, -12, 53, 6);
  rectangle(context, '#6d4550', -26, -8, 53, 2);
  rectangle(context, '#ffbf73', -19, -10, 6, 1);
  rectangle(context, '#ffbf73', 10, -10, 6, 1);
  rectangle(context, '#a46653', -7, -12, 13, 4);
  rectangle(context, '#ffc575', -2, -11, 3, 1);

  // Belt-drive lift and pincher built from square aluminum bars.
  line(context, '#3e344d', 8, -23, 15, -36, 4);
  line(context, '#634e61', 15, -36, 27, -30, 4);
  line(context, '#e2a75e', 10, -23, 16, -35, 2);
  line(context, '#fecc7c', 16, -35, 28, -29, 2);
  rectangle(context, '#6e4b57', 13, -34, 4, 4);
  rectangle(context, '#ffe0a1', 14, -33, 2, 2);
  rectangle(context, '#4c405b', 26, -31, 5, 5);
  rectangle(context, '#e6a968', 28, -30, 4, 3);
  line(context, '#ecc58a', 31, -30, 34, -32);
  line(context, '#ad7666', 32, -26, 34, -27);
  rectangle(context, '#e6a968', 35, -32, 1, 2);
  rectangle(context, '#af7a6c', 35, -28, 1, 2);

  // A colorful face uses one three-pixel expression at a time.
  polygon(context, '#222137', [[-20, -28], [-20, -42], [-16, -47], [2, -47], [7, -42],
    [7, -28], [3, -24], [-16, -24]]);
  polygon(context, '#a86951', [[-18, -42], [-15, -45], [2, -45], [5, -42],
    [5, -29], [2, -26], [-16, -26], [-18, -29]]);
  rectangle(context, '#f6b966', -15, -44, 17, 2);
  rectangle(context, '#e6a958', -17, -42, 22, 11);
  rectangle(context, '#ffca77', -16, -41, 1, 14);
  rectangle(context, '#30445b', -14, -40, 16, 11);
  rectangle(context, '#22263e', -13, -39, 14, 9);
  rectangle(context, '#426877', -13, -39, 14, 1);
  const eyeShift = celebrating ? 0 : Math.round(Math.sin(seconds * 0.9));
  if (blink) {
    rectangle(context, light, -12 + eyeShift, -34, 4, 1);
    rectangle(context, light, -5 + eyeShift, -34, 4, 1);
  } else {
    rectangle(context, light, -12 + eyeShift, -37, 3, 4);
    rectangle(context, light, -5 + eyeShift, -37, 3, 4);
    rectangle(context, '#efffdd', -11 + eyeShift, -37, 1, 1);
    rectangle(context, '#efffdd', -4 + eyeShift, -37, 1, 1);
  }
  if (celebrating) rectangle(context, '#f9d984', -7, -32, 3, 1);
  rectangle(context, '#c7785d', -14, -28, 16, 1);
  rectangle(context, '#6e5b69', -8, -52, 1, 6);
  rectangle(context, '#b98777', -8, -50, 1, 3);
  rectangle(context, '#644d64', -9, -54, 3, 3);
  if (reaction || Math.floor(seconds * 2) % 6 !== 0) rectangle(context, light, -8, -54, 1, 2);

  wheel(context, -17, -4, 3 - spoke);
  wheel(context, 17, -4, 3 - spoke);
  context.restore();
}

function burst(context, x, y, reaction, phase, level) {
  if (reaction === 'start' || reaction === 'prompt') {
    if (phase > 0.36) return;
    for (let index = 0; index < 4; index += 1) {
      rectangle(context, index % 2 ? '#897184' : '#625a72',
        x - 18 - phase * (28 + index * 4), y - 1 - index % 3 * 3 - phase * 6,
        2 + Number(index % 3 === 0), 1);
    }
    return;
  }
  if (reaction !== 'hit' && reaction !== 'finish') return;
  const count = reaction === 'finish' ? 12 : 4 + level;
  const lifetime = reaction === 'finish' ? 1.05 : 0.7;
  if (phase > lifetime) return;
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2.399) % (Math.PI * 2);
    const speed = 14 + (index * 9) % 31;
    const drift = Math.cos(angle) * speed * phase;
    const lift = Math.sin(angle) * speed * phase - phase * 37 + phase * phase * 25;
    const px = x + drift;
    const py = y - 32 + lift;
    const width = (index + Math.floor(phase * 8)) % 4 === 0 ? 3 : 1;
    rectangle(context, POP_COLORS[(index + level) % POP_COLORS.length], px, py, width, 1);
  }
}

function travel(seconds) {
  const progress = Math.min(1, Math.max(0, seconds / 0.42));
  return 1 - (1 - progress) ** 3;
}

export function mountArena(canvas) {
  const context = canvas?.getContext('2d');
  if (!context) return Object.assign(() => {}, { setState() {} });
  const sprite = document.createElement('canvas');
  sprite.width = SPRITE_WIDTH;
  sprite.height = SPRITE_HEIGHT;
  const drawable = sprite.getContext('2d');
  if (!drawable) return Object.assign(() => {}, { setState() {} });
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame;
  let mode = 'home';
  let reaction;
  let level = 1;
  let fired = 0;
  let origin = 0;
  let target = 0;
  let promptSide = 1;
  let position;

  function measure(bounds = canvas.getBoundingClientRect()) {
    const compact = bounds.width <= 740;
    const scale = compact ? 0.76 : 1.12;
    const inset = Math.max(compact ? 31 : 52, bounds.width * (compact ? 0.105 : 0.09));
    let ground = bounds.height * (compact ? 0.77 : 0.88);
    if (compact && mode !== 'home') {
      const panel = canvas.parentElement?.querySelector('.prompt-panel, .finish');
      if (panel) ground = Math.min(ground, panel.getBoundingClientRect().top - bounds.top - 12);
    }
    return { scale, x: Math.max(30, bounds.width - inset), ground: Math.max(95, ground) };
  }

  function draw(now) {
    const still = motion.matches;
    const phase = (now - fired) / 1000;
    const doing = !still && phase < REACTION_LENGTH[reaction] ? reaction : undefined;
    const x = Math.round(SPRITE_X + origin + (target - origin) * travel(still ? 1 : phase)
      + (doing === 'miss' ? Math.sin(phase * 48) * (1 - phase) * 2 : 0));
    const amplitude = doing === 'hit' ? 4 + level : doing === 'finish' ? 11 : 0;
    const hop = amplitude ? Math.sin(Math.min(1, phase / 0.6) * Math.PI) * amplitude : 0;
    const y = SPRITE_GROUND - Math.round(hop);
    drawable.clearRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
    if (doing) burst(drawable, x, y, doing, phase, level);
    const face = doing || (mode === 'finish' ? 'finish' : still ? reaction : undefined);
    robot(drawable, x, y, SPRITE_GROUND, doing ? phase : 0, face, doing, phase);

    const { scale, x: anchorX, ground } = position;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(sprite, Math.round(anchorX - SPRITE_X * scale), Math.round(ground - SPRITE_GROUND * scale),
      Math.round(SPRITE_WIDTH * scale), Math.round(SPRITE_HEIGHT * scale));
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(bounds.width));
    canvas.height = Math.max(1, Math.round(bounds.height));
    position = measure(bounds);
    draw(performance.now());
  }

  function tick(now) {
    frame = undefined;
    draw(now);
    if (!motion.matches && !document.hidden && (now - fired) / 1000 < REACTION_LENGTH[reaction]) {
      frame = requestAnimationFrame(tick);
    }
  }

  function syncMotion() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (!document.hidden) tick(performance.now());
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  motion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  resize();

  function setState({ mode: newMode, event, level: newLevel } = {}) {
    const now = performance.now();
    if (newMode) mode = newMode;
    if (newLevel) level = Math.max(1, Math.min(5, newLevel));
    if (event) {
      origin += (target - origin) * travel((now - fired) / 1000);
      if (event === 'start') target = -9;
      if (event === 'prompt') {
        target = 7 * promptSide;
        promptSide *= -1;
      }
      if (event === 'finish') target = 0;
      reaction = event;
      fired = now;
    } else if (mode === 'home') {
      origin = 0;
      target = 0;
      reaction = undefined;
    }
    position = measure();
    syncMotion();
  }

  function dispose() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    motion.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', syncMotion);
  }

  return Object.assign(dispose, { setState });
}
