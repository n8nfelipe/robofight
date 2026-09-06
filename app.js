const DEFAULT_RED = `const robot = {
  tick(api) {
    const enemy = api.scan();
    const me = api.status();
    const enemyShots = api.projectiles().filter(shot => shot.incoming);
    const threat = enemyShots
      .filter(shot => shot.missDistance < 48 && shot.timeToImpact < 12)
      .sort((a, b) => a.timeToImpact - b.timeToImpact)[0];
    const readyToFire = me.cooldown === 0;

    if (readyToFire) {
      // Com a arma pronta, ignora a pressão e fecha a mira no adversário.
      api.turn(enemy.angle);
      api.move(enemy.distance > 170 ? 4 : -1);
    } else if (threat) {
      // Só abandona o ataque para um tiro que esteja prestes a acertar.
      api.turn(threat.dodgeAngle);
      api.move(5);
    } else if (enemy.distance < 135) {
      // Abre apenas o espaço necessário para continuar atirando.
      api.turn(enemy.angle);
      api.move(-3);
    } else if (enemy.distance > 230) {
      // Persegue agressivamente durante a recarga.
      api.turn(enemy.angle);
      api.move(5);
    } else {
      // Orbita perto do alvo, mantendo pressão até o próximo disparo.
      api.turn(enemy.angle + 45);
      api.move(3);
    }

    // Atira sempre que consegue alinhar o canhão neste turno, mesmo sob ataque.
    const attackShot = enemy.distance <= 600 &&
      Math.abs(enemy.angle) <= 18 && readyToFire;
    if (attackShot) {
      api.fire();
    }
  }
};`;

const DEFAULT_BLUE = `const robot = {
  tick(api) {
    const enemy = api.scan();
    const me = api.status();
    const enemyShots = api.projectiles().filter(shot => shot.incoming);
    const threat = enemyShots
      .filter(shot => shot.missDistance < 62 && shot.timeToImpact < 28)
      .sort((a, b) => a.timeToImpact - b.timeToImpact)[0];
    const criticalThreat = enemyShots
      .filter(shot => shot.missDistance < 48 && shot.timeToImpact < 10)
      .sort((a, b) => a.timeToImpact - b.timeToImpact)[0];
    const readyToFire = me.cooldown === 0;
    const lowEnergy = me.energy <= 35;
    const minDistance = lowEnergy ? 340 : 265;
    const maxDistance = lowEnergy ? 450 : 390;

    if (criticalThreat) {
      // Só interrompe o ataque quando o impacto é realmente iminente.
      api.turn(criticalThreat.dodgeAngle);
      api.move(5);
    } else if (readyToFire) {
      // Com a arma pronta, caça o alvo e cria uma oportunidade de disparo.
      api.turn(enemy.angle);
      api.move(enemy.distance > maxDistance ? 4 : (enemy.distance < 190 ? -3 : 1));
    } else if (threat) {
      // Durante a recarga, mantém a defesa móvel do Cobalt-X.
      api.turn(threat.dodgeAngle);
      api.move(5);
    } else if (enemy.distance < minDistance) {
      // Mantém o canhão para a frente enquanto abre espaço.
      api.turn(enemy.angle);
      api.move(-5);
    } else if (enemy.distance > maxDistance) {
      // Recupera alcance com uma aproximação cautelosa.
      api.turn(enemy.angle);
      api.move(lowEnergy ? 1 : 2);
    } else if (me.cooldown > 4) {
      // Orbita no sentido oposto ao vermelho durante a recarga.
      api.turn(enemy.angle - 78);
      api.move(3.5);
    } else {
      // Estabiliza a mira somente perto do fim da recarga.
      api.turn(enemy.angle);
      api.move(-1);
    }

    // Ataca assim que consegue alinhar, aceitando pressão que não seja crítica.
    const attackShot = !criticalThreat && readyToFire &&
      enemy.distance <= 600 && Math.abs(enemy.angle) <= 18;
    if (attackShot) {
      api.fire();
    }
  }
};`;

const $ = (selector) => document.querySelector(selector);
const canvas = $('#arena');
const ctx = canvas.getContext('2d');

const ui = {
  battle: $('#battleButton'), reset: $('#resetButton'), rematch: $('#rematchButton'),
  speed: $('#speedSelect'), round: $('#roundLabel'), pill: $('.round-pill'), countdown: $('#countdown'),
  result: $('#resultCard'), resultTitle: $('#resultTitle'), resultEyebrow: $('#resultEyebrow'),
  help: $('#helpButton'), manual: $('#manualDialog'), closeManual: $('#closeManual'),
  red: robotUI('red'), blue: robotUI('blue')
};

function robotUI(team) {
  return {
    code: $(`#${team}Code`), name: $(`#${team}Name`), lines: $(`#${team}Lines`),
    hpText: $(`#${team}HpText`), hpBar: $(`#${team}HpBar`),
    console: $(`#${team}Console`), score: $(`#${team}Score`)
  };
}

let runners = [];
let running = false;
let paused = false;
let starting = false;
let ending = false;
let battleId = 0;
let tickTimer = null;
let finishTimer = null;
let turn = 0;
let scores = { red: 0, blue: 0 };
let bullets = [];
let particles = [];
let flashes = [];
let explosions = [];
let robots = [];

function makeRobot(team) {
  const red = team === 'red';
  return {
    team,
    x: red ? 135 : 625,
    y: red ? 380 : 380,
    angle: red ? 0 : 180,
    hp: 100,
    cooldown: 0,
    flash: 0,
    alive: true,
    color: red ? '#ff3b30' : '#18a9ff'
  };
}

function resetState() {
  battleId++;
  clearTimeout(finishTimer);
  stopRunners();
  running = false;
  paused = false;
  starting = false;
  ending = false;
  turn = 0;
  bullets = [];
  particles = [];
  flashes = [];
  explosions = [];
  robots = [makeRobot('red'), makeRobot('blue')];
  ui.result.classList.add('hidden');
  ui.countdown.classList.add('hidden');
  ui.battle.innerHTML = '<span>▶</span> INICIAR BATALHA';
  ui.battle.classList.remove('running');
  ui.round.textContent = 'PRONTO PARA LUTAR';
  ui.pill.classList.remove('live');
  updateHealth();
  log('red', 'SISTEMA', 'Código carregado. Aguardando combate.');
  log('blue', 'SISTEMA', 'Código carregado. Aguardando combate.');
}

class RobotRunner {
  constructor(team, source) {
    this.team = team;
    this.pending = new Map();
    this.seq = 0;
    this.failed = null;
    const workerSource = `
      let bot;
      try {
        bot = new Function(${JSON.stringify(source + '\n; return typeof robot !== "undefined" ? robot : null;')})();
        if (!bot || typeof bot.tick !== 'function') throw new Error('Declare const robot = { tick(api) { ... } }');
        postMessage({ type: 'ready' });
      } catch (error) { postMessage({ type: 'compileError', message: error.message }); }
      onmessage = async ({ data }) => {
        if (data.type !== 'tick' || !bot) return;
        const actions = { move: 0, turn: 0, fire: false, logs: [] };
        const api = Object.freeze({
          scan: () => Object.freeze({ ...data.enemy }),
          projectiles: () => data.projectiles.map(shot => Object.freeze({ ...shot })),
          status: () => Object.freeze({ ...data.self }),
          move: n => { actions.move = Math.max(-5, Math.min(5, Number(n) || 0)); },
          turn: n => { actions.turn = Math.max(-18, Math.min(18, Number(n) || 0)); },
          fire: () => { actions.fire = true; },
          log: msg => { if (actions.logs.length < 3) actions.logs.push(String(msg).slice(0, 120)); }
        });
        try {
          await bot.tick(api);
          postMessage({ type: 'result', id: data.id, actions });
        } catch (error) { postMessage({ type: 'runtimeError', id: data.id, message: error.message }); }
      };`;
    this.worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })));
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'compileError') {
        this.failed = data.message;
        log(team, 'ERRO', data.message);
        this.pending.forEach(resolve => resolve({ type: 'compileError', message: data.message }));
        this.pending.clear();
      }
      const pending = this.pending.get(data.id);
      if (pending) { this.pending.delete(data.id); pending(data); }
    };
  }

  run(payload) {
    if (this.failed) return Promise.resolve({ type: 'compileError', message: this.failed });
    return new Promise((resolve) => {
      const id = ++this.seq;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        this.worker.terminate();
        resolve({ type: 'timeout', actions: {} });
      }, 70);
      this.pending.set(id, (data) => { clearTimeout(timeout); resolve(data); });
      this.worker.postMessage({ type: 'tick', id, ...payload });
    });
  }

  destroy() { this.worker?.terminate(); }
}

function stopRunners() {
  clearTimeout(tickTimer);
  runners.forEach(r => r.destroy());
  runners = [];
}

function normalizeAngle(angle) {
  let result = angle % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

function enemyInfo(self, enemy) {
  const dx = enemy.x - self.x;
  const dy = enemy.y - self.y;
  const bearing = Math.atan2(dy, dx) * 180 / Math.PI;
  return {
    distance: Math.hypot(dx, dy),
    angle: normalizeAngle(bearing - self.angle),
    energy: enemy.hp
  };
}

function projectileInfo(self) {
  return bullets
    .filter(bullet => bullet.team !== self.team)
    .map(bullet => {
      const toRobotX = self.x - bullet.x;
      const toRobotY = self.y - bullet.y;
      const distance = Math.hypot(toRobotX, toRobotY);
      const speedSquared = bullet.vx ** 2 + bullet.vy ** 2;
      const approach = bullet.vx * toRobotX + bullet.vy * toRobotY;
      const timeToImpact = approach / speedSquared;
      const closestX = bullet.x + bullet.vx * Math.max(0, timeToImpact);
      const closestY = bullet.y + bullet.vy * Math.max(0, timeToImpact);
      const heading = Math.atan2(bullet.vy, bullet.vx) * 180 / Math.PI;
      const side = ((bullet.x - self.x) * bullet.vy - (bullet.y - self.y) * bullet.vx) >= 0 ? 1 : -1;

      return {
        distance,
        incoming: timeToImpact > 0,
        missDistance: Math.hypot(closestX - self.x, closestY - self.y),
        timeToImpact,
        dodgeAngle: normalizeAngle(heading + side * 90 - self.angle)
      };
    });
}

async function battleTick() {
  if (!running || paused) return;
  turn++;
  const results = await Promise.all(robots.map((robot, index) => {
    const enemy = robots[1 - index];
    return runners[index].run({
      enemy: enemyInfo(robot, enemy),
      projectiles: projectileInfo(robot),
      self: { energy: robot.hp, cooldown: robot.cooldown, turn }
    });
  }));

  if (!running) return;
  results.forEach((result, index) => {
    if (result.type === 'timeout') return finish(robots[1 - index].team, `${robots[index].team.toUpperCase()} EXCEDEU O TEMPO`);
    if (result.type === 'compileError') return finish(robots[1 - index].team, `${robots[index].team.toUpperCase()} TEM CÓDIGO INVÁLIDO`);
    if (result.type === 'runtimeError') {
      log(robots[index].team, 'ERRO', result.message);
      return;
    }
    applyActions(robots[index], result.actions || {});
  });

  moveBullets();
  robots.forEach(r => { if (r.cooldown > 0) r.cooldown--; if (r.flash > 0) r.flash--; });
  updateHealth();

  if (robots[0].hp <= 0 && robots[1].hp <= 0) destroyRobots(null, 'DESTRUIÇÃO MÚTUA');
  else if (robots[0].hp <= 0) destroyRobots('blue');
  else if (robots[1].hp <= 0) destroyRobots('red');
  else if (turn >= 1800) finish(robots[0].hp === robots[1].hp ? null : (robots[0].hp > robots[1].hp ? 'red' : 'blue'), 'LIMITE DE TURNOS');

  if (running && !ending) tickTimer = setTimeout(battleTick, 72 / Number(ui.speed.value));
}

function applyActions(robot, actions) {
  robot.angle = normalizeAngle(robot.angle + (actions.turn || 0));
  const radians = robot.angle * Math.PI / 180;
  const nextX = robot.x + Math.cos(radians) * (actions.move || 0) * 2.5;
  const nextY = robot.y + Math.sin(radians) * (actions.move || 0) * 2.5;
  robot.x = Math.max(35, Math.min(725, nextX));
  robot.y = Math.max(35, Math.min(725, nextY));
  (actions.logs || []).forEach(message => log(robot.team, 'ROBÔ', message));
  if (actions.fire && robot.cooldown === 0) {
    bullets.push({ x: robot.x + Math.cos(radians) * 30, y: robot.y + Math.sin(radians) * 30, vx: Math.cos(radians) * 17, vy: Math.sin(radians) * 17, team: robot.team, color: robot.color, life: 55 });
    robot.cooldown = 16;
    flashes.push({ x: robot.x + Math.cos(radians) * 34, y: robot.y + Math.sin(radians) * 34, life: 5, color: robot.color });
  }
}

function moveBullets() {
  bullets.forEach(b => {
    b.x += b.vx; b.y += b.vy; b.life--;
    const target = robots.find(r => r.team !== b.team);
    if (target.alive && Math.hypot(b.x - target.x, b.y - target.y) < 29) {
      target.hp = Math.max(0, target.hp - 5);
      target.flash = 4;
      b.life = 0;
      for (let i = 0; i < 14; i++) particles.push({ x: b.x, y: b.y, vx: (Math.random() - .5) * 8, vy: (Math.random() - .5) * 8, life: 18 + Math.random() * 12, color: target.color });
      log(target.team, 'DANO', `Impacto recebido. Integridade: ${target.hp}%`);
    }
    if (b.x < 0 || b.x > 760 || b.y < 0 || b.y > 760) b.life = 0;
  });
  bullets = bullets.filter(b => b.life > 0);
}

function spawnExplosion(robot) {
  robot.alive = false;
  explosions.push({ x: robot.x, y: robot.y, life: 42, maxLife: 42, color: robot.color });

  for (let i = 0; i < 90; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 11;
    particles.push({
      x: robot.x,
      y: robot.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 30 + Math.random() * 28,
      size: 2 + Math.random() * 5,
      color: Math.random() > .45 ? robot.color : (Math.random() > .5 ? '#fff4b0' : '#ff8a00')
    });
  }
}

function destroyRobots(winner, reason = '') {
  if (!running || ending) return;
  ending = true;
  running = false;
  stopRunners();
  bullets = [];
  robots.filter(robot => robot.hp <= 0).forEach(robot => {
    spawnExplosion(robot);
    log(robot.team, 'EXPLOSÃO', 'Integridade esgotada. Unidade destruída.');
  });
  ui.battle.classList.remove('running');
  ui.battle.innerHTML = '<span>◆</span> DESTRUIÇÃO';
  ui.round.textContent = 'ALVO DESTRUÍDO';
  finishTimer = setTimeout(() => finish(winner, reason), 900);
}

function finish(winner, reason = '') {
  if (!running && !ending) return;
  clearTimeout(finishTimer);
  running = false;
  ending = false;
  stopRunners();
  ui.battle.classList.remove('running');
  ui.battle.innerHTML = '<span>▶</span> NOVA BATALHA';
  ui.pill.classList.remove('live');
  ui.round.textContent = 'COMBATE ENCERRADO';
  if (winner) {
    scores[winner]++;
    ui[winner].score.textContent = scores[winner];
    ui.resultEyebrow.textContent = reason || 'VENCEDOR DA ARENA';
    ui.resultTitle.textContent = ui[winner].name.value.toUpperCase();
    log(winner, 'VITÓRIA', 'Alvo destruído. Arena dominada.');
  } else {
    ui.resultEyebrow.textContent = reason || 'EMPATE';
    ui.resultTitle.textContent = 'SEM VENCEDOR';
  }
  ui.result.classList.remove('hidden');
}

async function startBattle() {
  if (ending) return;
  if (running) {
    paused = !paused;
    ui.battle.innerHTML = paused ? '<span>▶</span> CONTINUAR' : '<span>Ⅱ</span> PAUSAR BATALHA';
    if (!paused) battleTick();
    return;
  }
  if (starting) return;
  resetState();
  starting = true;
  const currentBattle = battleId;
  saveEditors();
  runners = [new RobotRunner('red', ui.red.code.value), new RobotRunner('blue', ui.blue.code.value)];
  ui.countdown.classList.remove('hidden');
  for (const value of ['3', '2', '1', 'LUTEM']) {
    ui.countdown.textContent = value;
    await new Promise(resolve => setTimeout(resolve, value === 'LUTEM' ? 450 : 600));
    if (currentBattle !== battleId) return;
  }
  ui.countdown.classList.add('hidden');
  starting = false;
  running = true;
  ui.battle.innerHTML = '<span>Ⅱ</span> PAUSAR BATALHA';
  ui.battle.classList.add('running');
  ui.round.textContent = 'BATALHA EM CURSO';
  ui.pill.classList.add('live');
  log('red', 'SISTEMA', 'Execução iniciada.');
  log('blue', 'SISTEMA', 'Execução iniciada.');
  battleTick();
}

function updateHealth() {
  robots.forEach(robot => {
    ui[robot.team].hpBar.style.width = `${robot.hp}%`;
    ui[robot.team].hpText.textContent = `${robot.hp}%`;
  });
}

function log(team, type, message) {
  ui[team].console.innerHTML = `<span>${escapeHtml(type)}</span>${escapeHtml(message)}`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function updateLines(team) {
  const textarea = ui[team].code;
  const count = textarea.value.split('\n').length;
  ui[team].lines.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

function saveEditors() {
  localStorage.setItem('robofight-red', ui.red.code.value);
  localStorage.setItem('robofight-blue', ui.blue.code.value);
  localStorage.setItem('robofight-red-name', ui.red.name.value);
  localStorage.setItem('robofight-blue-name', ui.blue.name.value);
}

function setupEditor(team, fallback) {
  const editor = ui[team].code;
  const rubyUpgrade = team === 'red' && localStorage.getItem('robofight-red-strategy-version') !== '4';
  const cobaltUpgrade = team === 'blue' && localStorage.getItem('robofight-blue-strategy-version') !== '4';
  editor.value = (rubyUpgrade || cobaltUpgrade) ? fallback : (localStorage.getItem(`robofight-${team}`) || fallback);
  if (rubyUpgrade) {
    localStorage.setItem('robofight-red', fallback);
    localStorage.setItem('robofight-red-strategy-version', '4');
  }
  if (cobaltUpgrade) {
    localStorage.setItem('robofight-blue', fallback);
    localStorage.setItem('robofight-blue-strategy-version', '4');
  }
  ui[team].name.value = localStorage.getItem(`robofight-${team}-name`) || ui[team].name.value;
  updateLines(team);
  editor.addEventListener('input', () => { updateLines(team); saveEditors(); });
  editor.addEventListener('scroll', () => { ui[team].lines.scrollTop = editor.scrollTop; });
  editor.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = editor.selectionStart;
      editor.setRangeText('  ', start, editor.selectionEnd, 'end');
      updateLines(team);
    }
  });
  ui[team].name.addEventListener('input', saveEditors);
}

function drawGrid() {
  ctx.fillStyle = '#0a0d0f';
  ctx.fillRect(0, 0, 760, 760);
  ctx.strokeStyle = 'rgba(120,145,155,.1)';
  ctx.lineWidth = 1;
  for (let p = 20; p < 760; p += 40) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 760); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(760, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(215,255,47,.16)';
  ctx.setLineDash([4, 10]);
  ctx.beginPath(); ctx.arc(380, 380, 250, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(380, 0); ctx.lineTo(380, 760); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(215,255,47,.15)';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText('SECTOR A-01', 22, 32);
  ctx.fillText(`TURN ${String(turn).padStart(3, '0')}`, 668, 32);
}

function drawRobot(robot) {
  if (!robot.alive) return;
  ctx.save();
  ctx.translate(robot.x, robot.y);
  ctx.rotate(robot.angle * Math.PI / 180);
  ctx.shadowColor = robot.color;
  ctx.shadowBlur = robot.flash ? 35 : 12;
  ctx.fillStyle = robot.flash ? '#fff' : robot.color;
  ctx.fillRect(-20, -23, 41, 46);
  ctx.fillStyle = '#111519';
  ctx.fillRect(-14, -17, 27, 34);
  ctx.fillStyle = robot.color;
  ctx.fillRect(7, -4, 31, 8);
  ctx.fillRect(-25, -29, 13, 7);
  ctx.fillRect(-25, 22, 13, 7);
  ctx.fillRect(12, -29, 13, 7);
  ctx.fillRect(12, 22, 13, 7);
  ctx.restore();

  ctx.fillStyle = '#dfe4e6';
  ctx.font = '600 10px JetBrains Mono';
  ctx.textAlign = 'center';
  ctx.fillText(ui[robot.team].name.value.toUpperCase(), robot.x, robot.y - 42);
  ctx.fillStyle = '#272d31';
  ctx.fillRect(robot.x - 24, robot.y + 35, 48, 3);
  ctx.fillStyle = robot.color;
  ctx.fillRect(robot.x - 24, robot.y + 35, 48 * robot.hp / 100, 3);
  ctx.textAlign = 'start';
}

function drawScene() {
  drawGrid();
  bullets.forEach(b => {
    ctx.beginPath(); ctx.fillStyle = b.color; ctx.shadowColor = b.color; ctx.shadowBlur = 14;
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  });
  flashes.forEach(f => {
    ctx.beginPath(); ctx.fillStyle = f.color; ctx.globalAlpha = f.life / 5;
    ctx.arc(f.x, f.y, 5 + (5 - f.life) * 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; f.life--;
  });
  flashes = flashes.filter(f => f.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vx *= .94; p.vy *= .94; p.life--;
    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life / 40); ctx.fillRect(p.x, p.y, p.size || 3, p.size || 3); ctx.globalAlpha = 1;
  });
  particles = particles.filter(p => p.life > 0);
  explosions.forEach(explosion => {
    const progress = 1 - explosion.life / explosion.maxLife;
    ctx.beginPath();
    ctx.strokeStyle = explosion.color;
    ctx.lineWidth = Math.max(1, 8 * (1 - progress));
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.shadowColor = explosion.color;
    ctx.shadowBlur = 30;
    ctx.arc(explosion.x, explosion.y, 18 + progress * 105, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    explosion.life--;
  });
  explosions = explosions.filter(explosion => explosion.life > 0);
  robots.forEach(drawRobot);
  requestAnimationFrame(drawScene);
}

ui.battle.addEventListener('click', startBattle);
ui.reset.addEventListener('click', resetState);
ui.rematch.addEventListener('click', startBattle);
ui.help.addEventListener('click', () => ui.manual.showModal());
ui.closeManual.addEventListener('click', () => ui.manual.close());
ui.manual.addEventListener('click', event => { if (event.target === ui.manual) ui.manual.close(); });

setupEditor('red', DEFAULT_RED);
setupEditor('blue', DEFAULT_BLUE);
resetState();
drawScene();
