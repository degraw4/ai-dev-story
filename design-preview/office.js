// Original pixel artwork, drawn on an integer grid without Canvas path antialiasing.
(() => {
  const canvas = document.getElementById('office');
  const scene = canvas.parentElement;
  const context = canvas.getContext('2d');
  const width = 320;
  const height = 224;
  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  const ink = '#3c5048';
  const project = (x, y, elevation = 0) => [160 + (x - y) * 18, 56 + (x + y) * 9 - elevation];

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // Bresenham edges and scanline fills contain only opaque, whole pixels.
  function line(start, end, color = ink) {
    let [x, y] = start.map(Math.round);
    const [targetX, targetY] = end.map(Math.round);
    const dx = Math.abs(targetX - x);
    const dy = -Math.abs(targetY - y);
    const stepX = x < targetX ? 1 : -1;
    const stepY = y < targetY ? 1 : -1;
    let error = dx + dy;
    context.fillStyle = color;
    while (true) {
      context.fillRect(x, y, 1, 1);
      if (x === targetX && y === targetY) break;
      const twiceError = 2 * error;
      if (twiceError >= dy) { error += dy; x += stepX; }
      if (twiceError <= dx) { error += dx; y += stepY; }
    }
  }

  function polygon(vertices, color, outline = true) {
    const points = vertices.map(point => point.map(Math.round));
    const minimumY = Math.min(...points.map(point => point[1]));
    const maximumY = Math.max(...points.map(point => point[1]));
    for (let y = minimumY; y < maximumY; y++) {
      const intersections = [];
      for (let index = 0; index < points.length; index++) {
        const [x1, y1] = points[index];
        const [x2, y2] = points[(index + 1) % points.length];
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
          intersections.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
        }
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index < intersections.length; index += 2) {
        const start = Math.ceil(intersections[index]);
        rect(start, y, Math.floor(intersections[index + 1]) - start + 1, 1, color);
      }
    }
    if (outline) points.forEach((point, index) => line(point, points[(index + 1) % points.length]));
  }

  function box(x, y, w, depth, elevation, top, left, right) {
    polygon([project(x, y + depth), project(x + w, y + depth), project(x + w, y + depth, elevation), project(x, y + depth, elevation)], left);
    polygon([project(x + w, y), project(x + w, y + depth), project(x + w, y + depth, elevation), project(x + w, y, elevation)], right);
    polygon([project(x, y, elevation), project(x + w, y, elevation), project(x + w, y + depth, elevation), project(x, y + depth, elevation)], top);
  }

  const people = {
    avery: { shirt: '#9877cd', light: '#c1a6ed', hair: '#493f4a', skin: '#efbf95' },
    alex: { shirt: '#e6a62c', light: '#ffd96a', hair: '#493e33', skin: '#efbf95' },
    tim: { shirt: '#2f9f89', light: '#7bceb0', hair: '#5b473a', skin: '#dfab81' },
    jules: { shirt: '#d2717e', light: '#f4a5a5', hair: '#7d4b3e', skin: '#eabe9b' },
  };

  function person(x, y, name, frame) {
    const [px, py] = project(x, y).map(Math.round);
    const palette = people[name];
    const top = py - 28;
    rect(px - 9, py, 20, 3, '#9fb393');
    rect(px - 6, top + 23, 5, 6, '#3e4651');
    rect(px + 2, top + 23, 5, 6, '#3e4651');
    rect(px - 7, top + 28, 6, 2, ink);
    rect(px + 2, top + 28, 6, 2, ink);
    rect(px - 8, top + 13, 17, 13, ink);
    rect(px - 6, top + 14, 13, 10, palette.shirt);
    rect(px - 5, top + 14, 3, 9, palette.light);
    rect(px - 2, top + 13, 5, 3, '#fff3cf');
    if (name === 'alex') {
      rect(px, top + 16, 2, 6, '#85652e');
      rect(px + 4, top + 18, 2, 2, '#fff3cf');
    }
    if (name === 'avery') rect(px, top + 18, 1, 5, '#654d9a');
    const handOffset = frame % 2;
    rect(px - 9, top + 17 + handOffset, 3, 6, ink);
    rect(px - 8, top + 18 + handOffset, 3, 4, palette.skin);
    rect(px + 7, top + 17, 3, 6, ink);
    rect(px + 7, top + 18, 2, 4, palette.skin);
    rect(px - 7, top, 14, 13, palette.hair);
    rect(px - 5, top + 3, 11, 10, palette.skin);
    rect(px - 4, top + 4, 8, 1, '#f9d6b1');
    rect(px - 7, top, 14, 4, palette.hair);
    rect(px - 5, top - 1, 10, 2, palette.hair);
    rect(px - 7, top + 4, 2, 6, palette.hair);
    if (name === 'alex') {
      rect(px - 3, top - 2, 8, 2, palette.hair);
      rect(px - 6, top + 2, 4, 3, palette.hair);
      rect(px - 2, top, 6, 1, '#7d634a');
    } else if (name === 'jules') {
      rect(px + 6, top + 3, 2, 11, palette.hair);
      rect(px - 8, top + 4, 2, 9, palette.hair);
      rect(px - 5, top + 1, 3, 2, '#b16d4f');
    } else if (name === 'avery') {
      rect(px - 4, top + 3, 3, 2, palette.hair);
      rect(px + 4, top + 3, 3, 3, palette.hair);
    }
    rect(px - 3, top + 7, 2, 2, '#34453f');
    rect(px + 3, top + 7, 2, 2, '#34453f');
    rect(px, top + 11, 3, 1, '#bc785b');
    if (name === 'tim') {
      rect(px - 5, top + 6, 5, 4, '#e8edcf');
      rect(px + 2, top + 6, 5, 4, '#e8edcf');
      line([px - 5, top + 6], [px + 6, top + 6]);
      line([px - 5, top + 9], [px - 1, top + 9]);
      line([px + 2, top + 9], [px + 6, top + 9]);
      rect(px - 3, top + 7, 2, 2, '#34453f');
      rect(px + 3, top + 7, 2, 2, '#34453f');
      rect(px, top + 7, 2, 1, ink);
    }
  }

  function desk(x, y, name, frame) {
    box(x + .15, y + .16, .2, .7, 13, '#bc966a', '#826d52', '#a5845f');
    box(x + 1.45, y + .16, .2, .7, 13, '#bc966a', '#826d52', '#a5845f');
    box(x, y, 1.8, 1.1, 16, '#edd3a0', '#b38d62', '#d2ae78');
    line(project(x + .12, y + .1, 17), project(x + 1.64, y + .1, 17), '#fff0c9');
    const [px, py] = project(x + .8, y + .42, 17).map(Math.round);
    rect(px - 1, py - 5, 3, 7, ink);
    rect(px - 6, py + 1, 13, 2, '#6a7966');
    rect(px - 12, py - 22, 25, 18, ink);
    rect(px - 10, py - 20, 21, 13, '#9fe2c9');
    rect(px - 9, py - 19, 19, 2, '#c6f2d6');
    rect(px - 8, py - 15, 3, 1, '#478469');
    rect(px - 3, py - 15, 10, 1, '#478469');
    rect(px - 6, py - 12, 11, 1, '#478469');
    if (frame % 2) rect(px + 6, py - 12, 2, 2, '#fff3a6');
    if (name === 'tim') {
      rect(px - 8, py - 10, 4, 2, '#f4bf49');
      rect(px - 2, py - 10, 4, 2, '#f4bf49');
    }
    polygon([project(x + .7, y + .78, 17), project(x + 1.3, y + .78, 17), project(x + 1.3, y + 1, 17), project(x + .7, y + 1, 17)], '#7d8b80');
    line(project(x + .75, y + .83, 18), project(x + 1.2, y + .83, 18), '#e0e6cc');
    rect(px + 16, py + 1, 5, 6, '#fff6dc');
    rect(px + 17, py + 1, 3, 2, '#946a43');
    rect(px + 21, py + 3, 2, 3, '#d8c09a');
    if (name === 'alex') rect(px - 17, py + 3, 6, 3, '#e0aa39');
    if (name === 'jules') {
      rect(px - 17, py + 1, 6, 5, '#d8e8c7');
      rect(px - 17, py + 1, 2, 5, '#d2717e');
    }
    box(x + .56, y + 1.16, .66, .56, 7, '#8ca69a', '#4e7064', '#668579');
    person(x + .88, y + 1.4, name, frame);
  }

  function plant(x, y) {
    box(x, y, .62, .62, 8, '#cba176', '#9e704c', '#b8885a');
    const [px, py] = project(x + .31, y + .31, 9);
    rect(px - 2, py - 15, 3, 16, '#3f8151');
    rect(px - 7, py - 16, 7, 6, '#7abd55');
    rect(px - 8, py - 15, 5, 3, '#a6d56a');
    rect(px + 1, py - 23, 6, 11, '#4f9d57');
    rect(px + 2, py - 22, 3, 7, '#8dca61');
    rect(px - 11, py - 10, 10, 5, '#4f9d57');
    rect(px + 2, py - 10, 7, 5, '#79bc56');
  }

  function rack(x, y, frame) {
    box(x, y, .84, 1.4, 42, '#82948b', '#3f5e53', '#526f61');
    const [px, py] = project(x + .43, y + .9, 36).map(Math.round);
    for (let index = 0; index < 4; index++) {
      rect(px - 7, py + index * 7, 15, 5, '#263e37');
      rect(px - 5, py + index * 7 + 1, 2, 2, (frame + index) % 3 ? '#b7e875' : '#ffd36a');
      rect(px, py + index * 7 + 2, 6, 1, '#80977b');
      rect(px - 6, py + index * 7 + 4, 13, 1, '#587568');
    }
    line(project(x + .1, y + .08, 43), project(x + .74, y + .08, 43), '#a6b7a2');
  }

  function wallProps() {
    polygon([project(0, 1, 42), project(0, 3.6, 42), project(0, 3.6, 17), project(0, 1, 17)], '#789a91');
    polygon([project(0, 1.14, 40), project(0, 3.46, 40), project(0, 3.46, 20), project(0, 1.14, 20)], '#b2e0d8');
    polygon([project(0, 1.14, 40), project(0, 3.46, 40), project(0, 3.46, 33), project(0, 1.14, 33)], '#d6f0e2', false);
    line(project(0, 2.3, 40), project(0, 2.3, 19), '#6f9587');
    line(project(0, 1.1, 28), project(0, 3.5, 28), '#91b9aa');
    line(project(0, 1, 17), project(0, 3.7, 17), '#f7efd0');
    const [boardX, boardY] = project(3.7, 0, 34).map(Math.round);
    rect(boardX - 17, boardY - 10, 34, 24, ink);
    rect(boardX - 16, boardY - 9, 32, 22, '#b78c52');
    rect(boardX - 14, boardY - 7, 28, 18, '#e8c88c');
    rect(boardX - 11, boardY - 4, 9, 12, '#fff6d5');
    rect(boardX + 2, boardY - 3, 9, 9, '#d9e5bc');
    rect(boardX - 8, boardY - 5, 2, 2, '#cb6e55');
    rect(boardX + 5, boardY - 4, 2, 2, '#4a9670');
    rect(boardX - 9, boardY, 5, 1, '#c8b987');
    rect(boardX - 9, boardY + 3, 4, 1, '#c8b987');
    // A small wall shelf contains books, not additional compute equipment.
    const [shelfX, shelfY] = project(6.3, 0, 17).map(Math.round);
    rect(shelfX - 14, shelfY, 30, 4, '#9b784f');
    rect(shelfX - 14, shelfY, 30, 1, '#ecd2a3');
    const bookColors = ['#c77a68', '#7d9cbd', '#e0b54e', '#8eaa77'];
    for (let index = 0; index < 4; index++) {
      const bookX = shelfX - 12 + index * 6;
      const bookHeight = index === 1 ? 14 : 11;
      rect(bookX, shelfY - bookHeight, 5, bookHeight, ink);
      rect(bookX + 1, shelfY - bookHeight + 1, 3, bookHeight - 1, bookColors[index]);
      rect(bookX + 1, shelfY - bookHeight + 3, 3, 1, '#f6e4b8');
    }
    rect(shelfX - 10, shelfY + 4, 2, 4, '#927653');
    rect(shelfX + 10, shelfY + 4, 2, 4, '#927653');
  }

  function coffeeStation(frame) {
    box(.42, 5.9, .85, .8, 15, '#d0ac7b', '#967451', '#b68e5d');
    const [px, py] = project(.86, 6.18, 16).map(Math.round);
    rect(px - 6, py - 17, 12, 17, ink);
    rect(px - 4, py - 15, 8, 4, '#a5b9a3');
    rect(px - 4, py - 9, 7, 7, '#283c36');
    rect(px - 2, py - 7, 4, 5, '#f6e6bd');
    rect(px + 4, py - 10, 1, 2, '#e4b44e');
    if (frame % 2) rect(px - 1, py - 21, 2, 3, '#c1ccb1');
  }

  function draw(frame) {
    context.clearRect(0, 0, width, height);
    polygon([[160, 63], [309, 132], [164, 210], [14, 136]], '#bdc9ad', false);
    polygon([project(0, 0), project(8, 0), project(8, 0, 48), project(0, 0, 48)], '#d4dfc7');
    polygon([project(0, 0), project(0, 8), project(0, 8, 48), project(0, 0, 48)], '#f1e6c6');
    line(project(0, 0, 47), project(8, 0, 47), '#edf1da');
    line(project(0, 0, 47), project(0, 8, 47), '#fff4d7');
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      polygon([project(x, y), project(x + 1, y), project(x + 1, y + 1), project(x, y + 1)], (x + y) % 2 ? '#c4d4ad' : '#dce3bd', false);
    }
    line(project(0, 0), project(8, 0), '#93a581');
    line(project(0, 0), project(0, 8), '#b6b58d');
    polygon([project(0, 8), project(8, 8), project(8, 8, -6), project(0, 8, -6)], '#92a984');
    polygon([project(8, 0), project(8, 8), project(8, 8, -6), project(8, 0, -6)], '#adbf95');
    line(project(0, 8), project(8, 8), '#dce4bd');
    line(project(8, 0), project(8, 8), '#dce4bd');
    wallProps();
    const objects = [
      { depth: 3.7, render: () => desk(1.3, 1.2, 'avery', frame) },
      { depth: 6.6, render: () => desk(4.4, 1.1, 'alex', frame) },
      { depth: 8.3, render: () => rack(6.7, 1.1, frame) },
      { depth: 7, render: () => desk(1.4, 4.5, 'tim', frame) },
      { depth: 10.1, render: () => desk(4.5, 4.5, 'jules', frame) },
      { depth: 11.5, render: () => plant(6.7, 6.8) },
      { depth: 8.5, render: () => plant(.6, 7.1) },
      { depth: 7.1, render: () => coffeeStation(frame) },
    ];
    objects.sort((a, b) => a.depth - b.depth).forEach(object => object.render());
  }

  function fitCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const available = Math.max(1, scene.clientWidth - 4);
    // Cap at two CSS pixels per source pixel, then snap to whole device pixels.
    const physicalScale = Math.max(1, Math.floor(Math.min(available / width, 2) * ratio));
    const scale = physicalScale / ratio;
    const displayWidth = width * scale;
    const displayHeight = height * scale;
    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    const bounds = scene.getBoundingClientRect();
    const desiredLeft = bounds.left + (scene.clientWidth - displayWidth) / 2;
    const desiredTop = bounds.top + 32;
    // The source pixel grid and its origin both align to the display pixel grid.
    canvas.style.left = Math.round(desiredLeft * ratio) / ratio - bounds.left + 'px';
    canvas.style.top = Math.round(desiredTop * ratio) / ratio - bounds.top + 'px';
    scene.style.height = Math.ceil(displayHeight + 84) + 'px';
    canvas.dataset.pixelScale = String(physicalScale);
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  draw(frame);
  fitCanvas();
  new ResizeObserver(fitCanvas).observe(scene);
  window.addEventListener('resize', fitCanvas);
  // Browser zoom and moving between displays can change DPR without layout resize.
  let resolutionQuery;
  function watchResolution() {
    resolutionQuery?.removeEventListener('change', onResolutionChange);
    resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    resolutionQuery.addEventListener('change', onResolutionChange);
  }
  function onResolutionChange() { fitCanvas(); watchResolution(); }
  watchResolution();
  setInterval(() => { if (!document.hidden && !reducedMotion.matches) draw(++frame); }, 650);
})();
