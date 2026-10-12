const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');

// Helper to safely update score display
function updateScoreUI(val) {
  if (scoreEl) scoreEl.innerText = val;
}

// 1. High-DPI Responsive Canvas Setup
const displayWidth = Math.min(window.innerWidth - 20, 400);
const displayHeight = Math.min(window.innerHeight - 60, 600);
const dpr = window.devicePixelRatio || 1;

canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
canvas.style.width = displayWidth + 'px';
canvas.style.height = displayHeight + 'px';

ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = false;

// Game State
let score = 0;
let level = 1;
let playerLives = 3;
const maxLives = 5;
let weaponLevel = 1;
let enemiesDefeatedInLevel = 0;
let weaponTimer = null;
let ultimateTimer = null;
let isUltimateActive = false;
let isGameOver = false;
let hasWon = false;
let screenShakeTime = 0;

// Drone State
let droneActive = false;
let droneTimer = null;
const droneLeft = { x: 0, y: 0 };
const droneRight = { x: 0, y: 0 };

// Missile Support Ship State (6 Seconds Duration)
let missileSupportActive = false;
let missileSupportTimer = null;
let missileInterval = null;
const missileShip = { x: 0, y: 0 };

// IMAGE LOADING SYSTEM (10 Players, 10 Enemies, 10 Bosses)
const images = {
  players: {},
  enemies: {},
  bosses: {}
};

for (let i = 1; i <= 10; i++) {
  // Player Ship Evolution per Level
  images.players[i] = new Image();
  images.players[i].src = `player${i}.png`;
  images.players[i].onerror = () => { images.players[i].src = 'player.png'; };

  // Enemies
  images.enemies[i] = new Image();
  images.enemies[i].src = `enemy${i}.png`;
  images.enemies[i].onerror = () => { images.enemies[i].src = 'enemy.png'; };

  // Bosses
  images.bosses[i] = new Image();
  images.bosses[i].src = `boss${i}.png`;
  images.bosses[i].onerror = () => { images.bosses[i].src = 'boss.png'; };
}

// Background Themes per Level
const levelThemes = {
  1: { grad1: '#020024', grad2: '#090979', starColor: '#aaccff', starSpeed: 1 },
  2: { grad1: '#2b0000', grad2: '#800000', starColor: '#ff9999', starSpeed: 1.2 },
  3: { grad1: '#002b0c', grad2: '#00591b', starColor: '#88ffaa', starSpeed: 1.4 },
  4: { grad1: '#1b002b', grad2: '#4a0059', starColor: '#e088ff', starSpeed: 1.6 },
  5: { grad1: '#2b1700', grad2: '#6e3800', starColor: '#ffbb66', starSpeed: 1.8 },
  6: { grad1: '#00262b', grad2: '#005f6e', starColor: '#66ffff', starSpeed: 2.0 },
  7: { grad1: '#0a0a0a', grad2: '#1f1f1f', starColor: '#ffd700', starSpeed: 2.2 },
  8: { grad1: '#07002b', grad2: '#18006e', starColor: '#9966ff', starSpeed: 2.4 },
  9: { grad1: '#2b0011', grad2: '#6e002c', starColor: '#ff3388', starSpeed: 2.6 },
  10: { grad1: '#211d00', grad2: '#574d00', starColor: '#ffffff', starSpeed: 3.0 }
};

// Starfield
const stars = [];
for (let i = 0; i < 70; i++) {
  stars.push({
    x: Math.random() * displayWidth,
    y: Math.random() * displayHeight,
    radius: Math.random() * 1.5 + 0.5
  });
}

// Player Ship Object
const player = {
  x: displayWidth / 2,
  y: displayHeight - 70,
  width: 52,
  height: 52,
  invincible: false
};

// Game Entities
const projectiles = [];
const enemyProjectiles = [];
const enemies = [];
const particles = [];
const buffs = [];
let boss = null;
let bossMinions = [];

// Controls
let isDragging = false;
function moveShip(e) {
  if (isGameOver) return;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  
  player.x = (clientX - rect.left) * (displayWidth / rect.width);
  player.y = (clientY - rect.top) * (displayHeight / rect.height);

  // Keep player inside screen boundaries
  player.x = Math.max(player.width / 2, Math.min(displayWidth - player.width / 2, player.x));
  player.y = Math.max(player.height / 2, Math.min(displayHeight - player.height / 2, player.y));
}

canvas.addEventListener('mousedown', (e) => { isDragging = true; moveShip(e); });
canvas.addEventListener('mousemove', (e) => { if (isDragging) moveShip(e); });
canvas.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('touchstart', (e) => { isDragging = true; moveShip(e); });
canvas.addEventListener('touchmove', (e) => { if (isDragging) moveShip(e); });
canvas.addEventListener('touchend', () => isDragging = false);

// Power-up Mechanics
function activateWeaponUpgrade() {
  if (weaponLevel < 3) weaponLevel++;
  if (weaponTimer) clearTimeout(weaponTimer);
  weaponTimer = setTimeout(() => {
    weaponLevel = 1;
    weaponTimer = null;
  }, 8000);
}

function activateWingmanDrone() {
  droneActive = true;
  if (droneTimer) clearTimeout(droneTimer);
  droneTimer = setTimeout(() => {
    droneActive = false;
    droneTimer = null;
  }, 15000);
}

function activateUltimateMode() {
  isUltimateActive = true;
  triggerScreenShake(15);
  if (ultimateTimer) clearTimeout(ultimateTimer);
  ultimateTimer = setTimeout(() => {
    isUltimateActive = false;
    ultimateTimer = null;
  }, 8000);
}

// Activate Missile Support Ship for 6 Seconds
function activateMissileSupport() {
  missileSupportActive = true;
  if (missileTimer) clearTimeout(missileTimer);
  if (missileInterval) clearInterval(missileInterval);

  // Rapid Homing Missile Barrage every 200ms
  missileInterval = setInterval(() => {
    if (isGameOver || !missileSupportActive) return;
    
    projectiles.push({
      x: missileShip.x,
      y: missileShip.y - 12,
      width: 6,
      height: 16,
      vx: (Math.random() - 0.5) * 4,
      vy: -8,
      color: '#bd00ff',
      type: 'missile'
    });
  }, 200);

  // Stops automatically after 6 seconds
  missileTimer = setTimeout(() => {
    missileSupportActive = false;
    clearInterval(missileInterval);
    missileTimer = null;
  }, 6000);
}

// Player Firing Loop
setInterval(() => {
  if (isGameOver || isUltimateActive) return;
  const speed = 14;
  const shipTipY = player.y - player.height / 2;
  
  if (weaponLevel === 1) {
    projectiles.push({ x: player.x, y: shipTipY, width: 4, height: 18, vx: 0, vy: -speed, color: '#ffea00', type: 'standard' });
  } else if (weaponLevel === 2) {
    projectiles.push(
      { x: player.x - 12, y: shipTipY + 5, width: 6, height: 22, vx: 0, vy: -speed, color: '#00ffcc', type: 'laser' },
      { x: player.x + 12, y: shipTipY + 5, width: 6, height: 22, vx: 0, vy: -speed, color: '#00ffcc', type: 'laser' }
    );
  } else {
    // Level 3 Multi-Stream Spread
    const angles = [-0.28, -0.14, 0, 0.14, 0.28];
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i];
      projectiles.push({
        x: player.x,
        y: shipTipY,
        width: 6,
        height: 22,
        vx: Math.sin(a) * speed,
        vy: -Math.cos(a) * speed,
        color: '#ff3300',
        type: 'plasma',
        angle: a
      });
    }
  }
}, 120);

// Wingman Drone Laser Firing Loop
setInterval(() => {
  if (isGameOver || !droneActive || isUltimateActive) return;
  projectiles.push(
    { x: droneLeft.x, y: droneLeft.y - 10, width: 4, height: 20, vx: 0, vy: -15, color: '#00ffff', type: 'droneLaser' },
    { x: droneRight.x, y: droneRight.y - 10, width: 4, height: 20, vx: 0, vy: -15, color: '#00ffff', type: 'droneLaser' }
  );
}, 140);

function triggerScreenShake(duration) {
  screenShakeTime = duration;
}

function hitPlayer() {
  if (player.invincible || isGameOver) return;
  playerLives--;
  triggerScreenShake(14);
  createExplosion(player.x, player.y, '#ff0000');
  if (playerLives <= 0) {
    isGameOver = true;
  } else {
    player.invincible = true;
    setTimeout(() => player.invincible = false, 1500);
  }
}

function createExplosion(x, y, color) {
  if (particles.length > 60) particles.splice(0, 15);
  for (let i = 0; i < 12; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      radius: Math.random() * 3 + 1,
      alpha: 1,
      color: color
    });
  }
}

// Enemy Spawner
setInterval(() => {
  if (boss || isGameOver) return;
  
  const allowHeavy = level >= 2;
  const isHeavy = allowHeavy && Math.random() < 0.35;
  const size = isHeavy ? 52 : 40;
  const baseHp = isHeavy ? (2 + level) : (1 + Math.floor(level / 3));

  enemies.push({
    x: Math.random() * (displayWidth - size) + size / 2,
    y: -size,
    width: size,
    height: size,
    hp: baseHp,
    maxHp: baseHp,
    speed: isHeavy ? (1.0 + level * 0.1) : (1.8 + level * 0.1),
    hasHealthBar: isHeavy || level >= 4
  });
}, Math.max(350, 850 - level * 40));

// Boss Spawner
function checkBossSpawn() {
  if (!boss && enemiesDefeatedInLevel >= 15) {
    const bossHp = 40 + (level * 30);
    
    boss = {
      x: displayWidth / 2,
      y: -100,
      targetY: 90,
      width: 120,
      height: 100,
      hp: bossHp,
      maxHp: bossHp,
      vx: 1.5 + (level * 0.2)
    };

    bossMinions = [];
    const minionCount = Math.min(4 + level, 12);
    for (let i = 0; i < minionCount; i++) {
      bossMinions.push({
        angleOffset: (Math.PI * 2 / minionCount) * i,
        radius: 80 + (level * 2),
        x: 0, y: 0,
        hp: 2 + Math.floor(level / 2),
        lastShot: Date.now() + Math.random() * 2000
      });
    }
  }
}

// MAIN GAME LOOP
function animate() {
  requestAnimationFrame(animate);

  ctx.save();

  // Screen Shake
  if (screenShakeTime > 0) {
    const offsetX = (Math.random() - 0.5) * 6;
    const offsetY = (Math.random() - 0.5) * 6;
    ctx.translate(offsetX, offsetY);
    screenShakeTime--;
  }
  
  // Background
  const theme = levelThemes[level] || levelThemes[1];
  const bgGrad = ctx.createLinearGradient(0, 0, 0, displayHeight);
  bgGrad.addColorStop(0, theme.grad1);
  bgGrad.addColorStop(1, theme.grad2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(-10, -10, displayWidth + 20, displayHeight + 20);

  // Starfield
  stars.forEach(star => {
    star.y += theme.starSpeed;
    if (star.y > displayHeight) { star.y = 0; star.x = Math.random() * displayWidth; }
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = theme.starColor;
    ctx.fill();
  });

  if (isGameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    if (hasWon) {
      ctx.fillStyle = '#00ffcc';
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VICTORY!', displayWidth / 2, displayHeight / 2 - 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px sans-serif';
      ctx.fillText('You conquered all 10 Levels!', displayWidth / 2, displayHeight / 2 + 20);
      ctx.fillText(`Final Score: ${score}`, displayWidth / 2, displayHeight / 2 + 50);
    } else {
      ctx.fillStyle = '#ff0055';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', displayWidth / 2, displayHeight / 2 - 10);
      ctx.fillStyle = '#ffffff';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Reached Level ${level}`, displayWidth / 2, displayHeight / 2 + 30);
      ctx.fillText('Refresh page to restart', displayWidth / 2, displayHeight / 2 + 60);
    }
    ctx.restore();
    return;
  }

  // HUD
  ctx.fillStyle = '#00ffcc';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`LVL ${level}/10`, displayWidth - 15, 25);
  ctx.fillText(`Kills: ${enemiesDefeatedInLevel}/15`, displayWidth - 15, 45);
  ctx.textAlign = 'left';
  
  let heartsText = '';
  for (let i = 0; i < playerLives; i++) heartsText += '❤️ ';
  ctx.fillText(heartsText, 15, 25);

  if (isUltimateActive) {
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`ULTIMATE OVERDRIVE!`, 15, 45);
  } else if (missileSupportActive) {
    ctx.fillStyle = '#bd00ff';
    ctx.fillText(`MISSILE SUPPORT ACTIVE!`, 15, 45);
  } else if (weaponLevel > 1) {
    ctx.fillStyle = '#ff3300';
    ctx.fillText(`WEAPON L${weaponLevel}`, 15, 45);
  }

  // Render Level-Evolved Player Ship PNG
  if (!player.invincible || Math.floor(Date.now() / 100) % 2 === 0) {
    const currentShipImg = images.players[level];
    if (currentShipImg && currentShipImg.complete && currentShipImg.naturalWidth !== 0) {
      ctx.drawImage(currentShipImg, player.x - player.width / 2, player.y - player.height / 2, player.width, player.height);
    } else {
      ctx.fillStyle = '#00ffcc';
      ctx.fillRect(player.x - player.width / 2, player.y - player.height / 2, player.width, player.height);
    }
  }

  // Render Wingman Drones
  if (droneActive) {
    droneLeft.x = player.x - 38;
    droneLeft.y = player.y + 5;
    droneRight.x = player.x + 38;
    droneRight.y = player.y + 5;

    [droneLeft, droneRight].forEach(d => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(d.x, d.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#00ffff';
      ctx.fill();
      ctx.restore();
    });
  }

  // Render Missile Support Aiding Ship
  if (missileSupportActive) {
    missileShip.x = player.x;
    missileShip.y = player.y + 42;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(missileShip.x, missileShip.y - 12);
    ctx.lineTo(missileShip.x - 18, missileShip.y + 12);
    ctx.lineTo(missileShip.x + 18, missileShip.y + 12);
    ctx.closePath();
    ctx.fillStyle = '#bd00ff';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // ULTIMATE GOLDEN MEGA-BEAM (Starts cleanly from ship's top tip)
  const tipY = player.y - player.height / 2;

  if (isUltimateActive) {
    const beamWidth = 36 + Math.sin(Date.now() * 0.05) * 6;
    const beamX = player.x;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 1. Outer Flame Aura
    ctx.fillStyle = 'rgba(255, 120, 0, 0.35)';
    ctx.fillRect(beamX - beamWidth / 2 - 12, 0, beamWidth + 24, tipY);

    // 2. Thick Golden Body
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(beamX - beamWidth / 2, 0, beamWidth, tipY);

    // 3. Ultra-Bright White Core
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(beamX - beamWidth / 4, 0, beamWidth / 2, tipY);

    // 4. Muzzle Burst at the exact Tip of the Ship
    ctx.beginPath();
    ctx.arc(beamX, tipY, beamWidth * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    // Ultimate Beam Collision & Destruction against Regular Enemies
    for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
      const enemy = enemies[enemyIndex];
      if (Math.abs(enemy.x - beamX) < (beamWidth / 2 + enemy.width / 2)) {
        enemy.hp -= 0.3;
        createExplosion(enemy.x, enemy.y, '#ffd700');

        if (enemy.hp <= 0) {
          score += enemy.maxHp * 15;
          updateScoreUI(score);
          enemiesDefeatedInLevel++;
          createExplosion(enemy.x, enemy.y, '#ff0055');

          const rand = Math.random();
          if (rand < 0.10) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'upgrade' });
          else if (rand < 0.18) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.8, type: 'hazard' });
          else if (rand < 0.25) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'health' });
          else if (rand < 0.33) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'drone' });
          else if (rand < 0.40) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'ultimate' });
          else if (rand < 0.48) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'missile' });

          enemies.splice(enemyIndex, 1);
        }
      }
    }

    // Ultimate Beam Collision Logic against Boss
    if (boss && Math.abs(boss.x - beamX) < (beamWidth / 2 + boss.width / 2)) {
      boss.hp -= 0.4;
      createExplosion(boss.x, boss.y - 20, '#ffffff');
    }
  }

  // Regular & Homing Projectiles
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let index = projectiles.length - 1; index >= 0; index--) {
    const p = projectiles[index];

    // Homing logic for Aiding Ship Missiles
    if (p.type === 'missile') {
      let target = boss || enemies[0];
      if (target) {
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        p.vx += dx * 0.03;
        p.vy += dy * 0.03;
        p.vx = Math.max(-6, Math.min(6, p.vx));
        p.vy = Math.max(-10, Math.min(10, p.vy));
      }
    }

    p.x += p.vx;
    p.y += p.vy;

    if (p.type === 'standard') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.width, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'laser' || p.type === 'droneLaser') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - p.width / 4, p.y - p.height / 2, p.width / 2, p.height);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
    } else if (p.type === 'plasma') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = '#ff3300';
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      ctx.fillStyle = '#ffff66';
      ctx.fillRect(-p.width / 4, -p.height / 4, p.width / 2, p.height / 2);
      ctx.restore();
    } else if (p.type === 'missile') {
      ctx.fillStyle = '#bd00ff';
      ctx.fillRect(p.x - p.width / 2, p.y - p.height / 2, p.width, p.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x - p.width / 4, p.y - p.height / 4, p.width / 2, p.height / 2);
    }

    if (p.y < -30 || p.x < -30 || p.x > displayWidth + 30) {
      projectiles.splice(index, 1);
    }
  }
  ctx.restore();

  // Enemy Bullets
  for (let index = enemyProjectiles.length - 1; index >= 0; index--) {
    const ep = enemyProjectiles[index];
    ep.y += ep.speed;
    
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, 4, 0, Math.PI * 2);
    ctx.fill();

    if (Math.hypot(player.x - ep.x, player.y - ep.y) < player.width / 2 + 4) {
      hitPlayer();
      enemyProjectiles.splice(index, 1);
    } else if (ep.y > displayHeight + 10) {
      enemyProjectiles.splice(index, 1);
    }
  }

  // Power-up Buff Items
  for (let buffIndex = buffs.length - 1; buffIndex >= 0; buffIndex--) {
    const buff = buffs[buffIndex];
    buff.y += buff.speed;
    ctx.save();
    ctx.beginPath();
    ctx.arc(buff.x, buff.y, buff.radius, 0, Math.PI * 2);

    let color = '#00ff66';
    if (buff.type === 'hazard') color = '#ff0033';
    if (buff.type === 'health') color = '#ff007f';
    if (buff.type === 'drone') color = '#00ffff';
    if (buff.type === 'ultimate') color = '#ffd700';
    if (buff.type === 'missile') color = '#bd00ff';

    ctx.fillStyle = color;
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let symbol = 'P';
    if (buff.type === 'hazard') symbol = 'X';
    if (buff.type === 'health') symbol = 'H';
    if (buff.type === 'drone') symbol = 'S';
    if (buff.type === 'ultimate') symbol = 'U';
    if (buff.type === 'missile') symbol = 'M';
    
    ctx.fillText(symbol, buff.x, buff.y);
    ctx.restore();

    if (Math.hypot(player.x - buff.x, player.y - buff.y) < player.width / 2 + buff.radius) {
      if (buff.type === 'upgrade') activateWeaponUpgrade();
      else if (buff.type === 'hazard') hitPlayer();
      else if (buff.type === 'health') { if (playerLives < maxLives) playerLives++; }
      else if (buff.type === 'drone') activateWingmanDrone();
      else if (buff.type === 'ultimate') activateUltimateMode();
      else if (buff.type === 'missile') activateMissileSupport();
      
      buffs.splice(buffIndex, 1);
    } else if (buff.y > displayHeight + 20) {
      buffs.splice(buffIndex, 1);
    }
  }

if (boss) {
    if (boss.y < boss.targetY) boss.y += 1;
    boss.x += boss.vx;
    if (boss.x - boss.width / 2 < 0 || boss.x + boss.width / 2 > displayWidth) boss.vx *= -1;

    const bossImg = images.bosses[level];
    if (bossImg && bossImg.complete && bossImg.naturalWidth !== 0) {
      ctx.drawImage(bossImg, boss.x - boss.width / 2, boss.y - boss.height / 2, boss.width, boss.height);
    } else {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(boss.x - boss.width / 2, boss.y - boss.height / 2, boss.width, boss.height);
    }

    // Boss Health Bar
    ctx.fillStyle = '#333';
    ctx.fillRect(displayWidth / 2 - 100, 40, 200, 12);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(displayWidth / 2 - 100, 40, Math.max(0, (boss.hp / boss.maxHp) * 200), 12);

    // Orbiting Minions
    for (let mIndex = bossMinions.length - 1; mIndex >= 0; mIndex--) {
      const m = bossMinions[mIndex];
      m.angleOffset += 0.03;
      m.x = boss.x + Math.cos(m.angleOffset) * m.radius;
      m.y = boss.y + Math.sin(m.angleOffset) * m.radius;

      ctx.save();
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5500';
      ctx.fill();
      ctx.restore();

      if (Date.now() > m.lastShot) {
        enemyProjectiles.push({ x: m.x, y: m.y + 10, speed: 3.5 });
        m.lastShot = Date.now() + Math.random() * 3000 + 1500;
      }

      for (let pIndex = projectiles.length - 1; pIndex >= 0; pIndex--) {
        const p = projectiles[pIndex];
        if (Math.hypot(p.x - m.x, p.y - m.y) < 12) {
          m.hp--;
          projectiles.splice(pIndex, 1);
          if (m.hp <= 0) {
            createExplosion(m.x, m.y, '#ff5500');
            bossMinions.splice(mIndex, 1);
            break;
          }
        }
      }
    }

    for (let pIndex = projectiles.length - 1; pIndex >= 0; pIndex--) {
      const p = projectiles[pIndex];
      if (Math.hypot(p.x - boss.x, p.y - boss.y) < boss.width / 2) {
        boss.hp--;
        createExplosion(p.x, p.y, '#ffea00');
        projectiles.splice(pIndex, 1);
      }
    }

    if (boss.hp <= 0) {
      triggerScreenShake(20);
      createExplosion(boss.x, boss.y, '#ff0000');
      score += 500 * level;
      updateScoreUI(score);
      boss = null;
      bossMinions = [];
      enemiesDefeatedInLevel = 0;

      if (level >= 10) {
        isGameOver = true;
        hasWon = true;
      } else {
        level++;
      }
    }
  } else {
    checkBossSpawn();
  }

  // Regular Enemies Logic
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
    const enemy = enemies[enemyIndex];
    enemy.y += enemy.speed;

    const currentEnemyImg = images.enemies[level];
    if (currentEnemyImg && currentEnemyImg.complete && currentEnemyImg.naturalWidth !== 0) {
      ctx.drawImage(currentEnemyImg, enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.width, enemy.height);
    } else {
      ctx.fillStyle = '#ff5500';
      ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.width, enemy.height);
    }

    if (enemy.hasHealthBar) {
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(enemy.x - 15, enemy.y - enemy.height / 2 - 8, Math.max(0, (enemy.hp / enemy.maxHp) * 30), 4);
    }

    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) < (player.width / 2 + enemy.width / 2)) {
      hitPlayer();
      enemies.splice(enemyIndex, 1);
      continue;
    }

    for (let pIndex = projectiles.length - 1; pIndex >= 0; pIndex--) {
      const p = projectiles[pIndex];
      if (Math.hypot(p.x - enemy.x, p.y - enemy.y) < enemy.width / 2) {
        enemy.hp--;
        projectiles.splice(pIndex, 1);
      }
    }

    if (enemy.hp <= 0) {
      score += enemy.maxHp * 15;
      updateScoreUI(score);
      enemiesDefeatedInLevel++;
      
      createExplosion(enemy.x, enemy.y, '#ff0055');

      const rand = Math.random();
      if (rand < 0.10) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'upgrade' });
      else if (rand < 0.18) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.8, type: 'hazard' });
      else if (rand < 0.25) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'health' });
      else if (rand < 0.33) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'drone' });
      else if (rand < 0.40) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'ultimate' });
      else if (rand < 0.48) buffs.push({ x: enemy.x, y: enemy.y, radius: 12, speed: 1.5, type: 'missile' });

      enemies.splice(enemyIndex, 1);
    } else if (enemy.y > displayHeight + 50) {
      enemies.splice(enemyIndex, 1);
    }
  }

  // Particles Render
  for (let index = particles.length - 1; index >= 0; index--) {
    const p = particles[index];
    p.x += p.vx; p.y += p.vy; p.alpha -= 0.03;
    if (p.alpha <= 0) particles.splice(index, 1);
    else {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

animate();