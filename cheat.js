/* ============================================================
 * cheat.js v3
 * - AIM / SILENT AIM / MAGIC / ESP GỌN / FLY
 * - RAPID FIRE (sấy đạn nhanh)
 * - INFINITE AMMO (unimate đạn)
 * - SPAWN WALL có va chạm (theo tâm súng, không giới hạn)
 * Yêu cầu: gamefps.html expose window.__GAME__
 * ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // CẤU HÌNH
  // ============================================================
  const CFG = {
    aim: {
      enabled: false,
      key: 'KeyX',
      fov: 400,
      smooth: 0.4,
      targetPart: 'chest'
    },
    silent: {
      enabled: false,
      key: 'KeyZ',
      fov: 600,
      targetPart: 'head',
      onlyVisible: false
    },
    magic: {
      enabled: false,
      key: 'KeyM',
      fov: 360
    },
    rapid: {
      enabled: false,
      key: 'KeyG',
      multiplier: 20          // fireRate / multiplier
    },
    infAmmo: {
      enabled: false,
      key: 'KeyH'
    },
    esp: {
      enabled: true,
      color: '#00ff88',
      bossColor: '#ff8800',
      maxDist: 250,
      showBox: true,
      showName: true,
      showHealth: true,
      showDistance: true,
      showLine: true          // line tâm → enemy
    },
    fly: {
      enabled: false,
      key: 'KeyF',
      speed: 15,
      fastMult: 2.5,
      upKey: 'Space',
      downKey: 'ControlLeft'
    },
    wallSpawn: {
      key: 'KeyT',
      size: 4,                // cạnh wall
      height: 5,              // chiều cao
      distance: 8,            // khoảng cách từ player theo tâm súng
      maxCount: 9999          // gần như không giới hạn
    }
  };

  // ============================================================
  // OVERLAY
  // ============================================================
  const espLayer = document.createElement('div');
  Object.assign(espLayer.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none',
    zIndex: '9999', overflow: 'hidden'
  });
  document.body.appendChild(espLayer);

  const statusEl = document.createElement('div');
  Object.assign(statusEl.style, {
    position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '10000', pointerEvents: 'none', fontFamily: 'Consolas, monospace',
    fontSize: '11px', color: '#0f0', background: 'rgba(0,0,0,.75)',
    padding: '6px 14px', borderRadius: '6px', lineHeight: '1.5',
    whiteSpace: 'nowrap', textAlign: 'center', border: '1px solid #0f04'
  });
  statusEl.textContent = '[CHEAT] chờ __GAME__...';
  document.body.appendChild(statusEl);

  // ============================================================
  // CHỜ GAME
  // ============================================================
  let G = null;
  const wait = setInterval(() => {
    if (window.__GAME__ && window.__GAME__.scene && window.__GAME__.enemies) {
      G = window.__GAME__;
      clearInterval(wait);
      updateStatus();
    }
  }, 150);

  // ============================================================
  // HELPERS
  // ============================================================
  const worldPos = () => G.camera.getWorldPosition(new G.THREE.Vector3());
  const worldDir = () => G.camera.getWorldDirection(new G.THREE.Vector3());

  function enemyTarget(en, part) {
    const sz = (en.userData.type && en.userData.type.size) || [1, 1.8, 0.6];
    const p = en.position.clone();
    if (part === 'head') p.y += sz[1] * 1.05;
    else if (part === 'chest') p.y += sz[1] * 0.7;
    else p.y += sz[1] * 0.3;
    return p;
  }

  function screenPos(worldVec) {
    const p = worldVec.clone().project(G.camera);
    if (p.z > 1 || p.z < -1) return null;
    return {
      x: (p.x * 0.5 + 0.5) * innerWidth,
      y: (-p.y * 0.5 + 0.5) * innerHeight,
      z: p.z
    };
  }

  function pickBest(fovPx, part) {
    if (!G.enemies.length) return null;
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const camPos = worldPos();
    const camDir = worldDir();

    let best = null, bestD = fovPx;
    for (const en of G.enemies) {
      if (!en.userData || en.userData.health <= 0) continue;
      const t = enemyTarget(en, part);
      const toEn = t.clone().sub(camPos);
      if (toEn.dot(camDir) <= 0) continue;
      const sp = screenPos(t);
      if (!sp) continue;
      const d = Math.hypot(sp.x - cx, sp.y - cy);
      if (d < bestD) { bestD = d; best = { en, point: t }; }
    }
    return best;
  }

  // ============================================================
  // AIMBOT
  // ============================================================
  function doAim() {
    if (!CFG.aim.enabled || !G) return;
    const best = pickBest(CFG.aim.fov, CFG.aim.targetPart);
    if (!best) return;

    const eye = worldPos();
    const t = best.point;
    const dx = t.x - eye.x, dy = t.y - eye.y, dz = t.z - eye.z;
    const horiz = Math.hypot(dx, dz);
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = -Math.atan2(dy, horiz);

    const s = CFG.aim.smooth;
    let dY = desiredYaw - G.playerYaw.rotation.y;
    while (dY > Math.PI) dY -= Math.PI * 2;
    while (dY < -Math.PI) dY += Math.PI * 2;
    G.playerYaw.rotation.y += dY * s;

    let dP = desiredPitch - G.playerPitch.rotation.x;
    G.playerPitch.rotation.x += dP * s;
    G.playerPitch.rotation.x = Math.max(-Math.PI / 2 + 0.05,
                                Math.min(Math.PI / 2 - 0.05, G.playerPitch.rotation.x));
  }

  // ============================================================
  // SILENT AIM (patch Raycaster.setFromCamera)
  // ============================================================
  let silentPatched = false;
  let silentFireActive = false;

  function ensureSilentPatch() {
    if (silentPatched || !G) return;
    const THREE = G.THREE;
    const orig = THREE.Raycaster.prototype.setFromCamera;
    THREE.Raycaster.prototype.setFromCamera = function (coords, cam) {
      if (CFG.silent.enabled && cam === G.camera && silentFireActive) {
        const best = pickBest(CFG.silent.fov, CFG.silent.targetPart);
        if (best) {
          const eye = cam.getWorldPosition(new THREE.Vector3());
          orig.call(this, coords, cam);
          this.ray.origin.copy(eye);
          this.ray.direction.copy(best.point.clone().sub(eye).normalize());
          return;
        }
      }
      return orig.call(this, coords, cam);
    };
    silentPatched = true;
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !CFG.silent.enabled) return;
    silentFireActive = true;
    setTimeout(() => { silentFireActive = false; }, 80);
  }, true);

  // ============================================================
  // MAGIC BULLET (patch Raycaster.intersectObjects)
  // ============================================================
  let magicPatched = false;
  function ensureMagicPatch() {
    if (magicPatched || !G) return;
    const THREE = G.THREE;
    const orig = THREE.Raycaster.prototype.intersectObjects;

    THREE.Raycaster.prototype.intersectObjects = function (objects, recursive) {
      if (CFG.magic.enabled && this.ray.origin && this.ray.direction) {
        const camPos = worldPos();
        if (this.ray.origin.distanceTo(camPos) < 0.5) {
          const best = pickBest(CFG.magic.fov, 'chest');
          if (best) {
            const eye = camPos;
            const dir = best.point.clone().sub(eye).normalize();
            this.ray.direction.copy(dir);
            let result = orig.call(this, objects, recursive);
            if (result.length === 0 && best.en) {
              const meshes = [];
              best.en.traverse(o => { if (o.isMesh) meshes.push(o); });
              if (meshes.length) {
                const r2 = new THREE.Raycaster(eye, dir, 0, 9999);
                const fake = r2.intersectObjects(meshes, false);
                if (fake.length) return fake;
                return [{
                  distance: eye.distanceTo(best.point),
                  point: best.point.clone(),
                  object: meshes[0],
                  face: null, uv: null, normal: dir.clone().negate()
                }];
              }
            }
            return result;
          }
        }
      }
      return orig.call(this, objects, recursive);
    };
    magicPatched = true;
  }

  // ============================================================
  // RAPID FIRE (sấy đạn nhanh)
  // Patch setTimeout? Không — game dùng performance.now() so sánh fireRate.
  // Cách: giảm w.fireRate mỗi frame khi bật (áp vào state.weapons).
  // ============================================================
  const _origFireRates = new WeakMap();
  function doRapid() {
    if (!G) return;
    const weapons = G.state.weapons;
    if (!weapons) return;
    for (const w of weapons) {
      if (CFG.rapid.enabled) {
        if (!_origFireRates.has(w)) _origFireRates.set(w, w.fireRate);
        w.fireRate = Math.max(5, (_origFireRates.get(w) || w.baseFireRate) / CFG.rapid.multiplier);
      } else {
        if (_origFireRates.has(w)) {
          w.fireRate = _origFireRates.get(w);
          _origFireRates.delete(w);
        }
      }
    }
  }

  // ============================================================
  // INFINITE AMMO
  // ============================================================
  function doInfAmmo() {
    if (!CFG.infAmmo.enabled || !G) return;
    const weapons = G.state.weapons;
    if (!weapons) return;
    const w = weapons[G.state.currentWeapon];
    if (w && w.ammo < w.magSize) w.ammo = w.magSize;
    // Cập nhật HUD (nếu có hàm updateHUD expose — không có, nên set text trực tiếp)
    const ammoEl = document.getElementById('ammo');
    if (ammoEl && w) ammoEl.textContent = `🔫 ${w.ammo} / ${w.magSize}`;
  }

  // ============================================================
  // WALL SPAWN theo tâm súng, có va chạm
  // ============================================================
  let wallCount = 0;

  function spawnWall() {
    if (!G) return;
    if (wallCount >= CFG.wallSpawn.maxCount) return;

    const THREE = G.THREE;
    const camPos = worldPos();
    const dir = worldDir();

    // Điểm đặt: camPos + dir * distance, chiếu xuống mặt đất
    const spawnPos = camPos.clone().add(dir.clone().multiplyScalar(CFG.wallSpawn.distance));
    spawnPos.y = CFG.wallSpawn.height / 2;

    // clamp trong map
    const lim = 34;
    spawnPos.x = Math.max(-lim, Math.min(lim, spawnPos.x));
    spawnPos.z = Math.max(-lim, Math.min(lim, spawnPos.z));

    // Tạo wall (dùng cùng texture nếu có thể — dùng màu đơn giản)
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 });
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(CFG.wallSpawn.size, CFG.wallSpawn.height, CFG.wallSpawn.size),
      mat
    );
    wall.position.copy(spawnPos);
    wall.castShadow = true;
    wall.receiveShadow = true;
    G.scene.add(wall);

    // Đăng ký vào mảng colliders để player va chạm
    // Game dùng mảng `colliders` (local), nhưng ta có thể push qua window.__GAME__
    // Nếu không expose được, ta phải tìm cách khác.
    if (G.colliders && Array.isArray(G.colliders)) {
      G.colliders.push(new THREE.Box3().setFromObject(wall));
    } else if (G.state && G.state.colliders) {
      G.state.colliders.push(new THREE.Box3().setFromObject(wall));
    } else {
      // fallback: thử tìm trong scene
      console.warn('[CHEAT] Không tìm thấy mảng colliders — wall sẽ không cản player!');
    }

    wallCount++;

    // Hiệu ứng pop
    wall.scale.set(0.2, 0.2, 0.2);
    let sc = 0.2;
    const anim = setInterval(() => {
      sc += 0.25;
      if (sc >= 1) { wall.scale.set(1, 1, 1); clearInterval(anim); }
      else wall.scale.set(sc, sc, sc);
    }, 20);
  }

  // ============================================================
  // ESP GỌN
  // ============================================================
  function doESP() {
    espLayer.innerHTML = '';
    if (!CFG.esp.enabled || !G) return;

    const w = innerWidth, h = innerHeight;
    const cx = w / 2, cy = h / 2;
    const camPos = worldPos();
    const camDir = worldDir();

    // Crosshair
    const ch = document.createElement('div');
    Object.assign(ch.style, {
      position: 'absolute', left: (cx - 10) + 'px', top: (cy - 1) + 'px',
      width: '20px', height: '2px', background: 'rgba(255,255,255,.6)'
    });
    espLayer.appendChild(ch);
    const cv = document.createElement('div');
    Object.assign(cv.style, {
      position: 'absolute', left: (cx - 1) + 'px', top: (cy - 10) + 'px',
      width: '2px', height: '20px', background: 'rgba(255,255,255,.6)'
    });
    espLayer.appendChild(cv);

    for (const en of G.enemies) {
      if (!en.userData || en.userData.health <= 0) continue;
      const type = en.userData.type;
      const sz = type.size || [1, 1.8, 0.6];
      const dist = camPos.distanceTo(en.position);
      if (dist > CFG.esp.maxDist) continue;

      const toEn = en.position.clone().sub(camPos);
      if (toEn.dot(camDir) <= 0) continue;

      const feet = en.position.clone(); feet.y = 0.1;
      const head = en.position.clone(); head.y = sz[1] * 0.95;
      const feetP = screenPos(feet);
      const headP = screenPos(head);
      if (!feetP || !headP) continue;

      const top = Math.min(feetP.y, headP.y);
      const bot = Math.max(feetP.y, headP.y);
      const bh = bot - top;
      if (bh < 3 || bh > h * 2) continue;
      const bw = Math.max(8, bh * 0.45);
      const bl = headP.x - bw / 2;

      const color = type.boss ? CFG.esp.bossColor : CFG.esp.color;
      const hpPct = Math.max(0, Math.min(1, en.userData.health / en.userData.maxHealth));

      // Box
      if (CFG.esp.showBox) {
        const box = document.createElement('div');
        Object.assign(box.style, {
          position: 'absolute',
          left: bl + 'px', top: top + 'px',
          width: bw + 'px', height: bh + 'px',
          border: `2px solid ${color}`,
          boxShadow: `0 0 8px ${color}, inset 0 0 6px ${color}33`,
          boxSizing: 'border-box', borderRadius: '2px'
        });
        espLayer.appendChild(box);

        // HP bar dọc
        if (CFG.esp.showHealth) {
          const hpBg = document.createElement('div');
          Object.assign(hpBg.style, {
            position: 'absolute',
            left: (bl - 6) + 'px', top: top + 'px',
            width: '3px', height: bh + 'px',
            background: 'rgba(0,0,0,.6)'
          });
          espLayer.appendChild(hpBg);
          const hpFill = document.createElement('div');
          const col = hpPct > 0.5 ? '#00ff44' : hpPct > 0.25 ? '#ffcc00' : '#ff2222';
          Object.assign(hpFill.style, {
            position: 'absolute',
            left: (bl - 6) + 'px',
            top: (top + bh * (1 - hpPct)) + 'px',
            width: '3px', height: (bh * hpPct) + 'px',
            background: col, boxShadow: `0 0 4px ${col}`
          });
          espLayer.appendChild(hpFill);
        }
      }

      // Line tâm → enemy
      if (CFG.esp.showLine) {
        const mx = headP.x, my = (top + bot) / 2;
        const dx = mx - cx, dy = my - cy;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        const ln = document.createElement('div');
        Object.assign(ln.style, {
          position: 'absolute', left: cx + 'px', top: cy + 'px',
          width: len + 'px', height: '1px',
          background: color, opacity: '.5',
          transformOrigin: '0 0', transform: `rotate(${ang}deg)`
        });
        espLayer.appendChild(ln);
      }

      // Name + distance
      const parts = [];
      if (CFG.esp.showName) parts.push(type.name);
      if (CFG.esp.showDistance) parts.push(`${Math.round(dist)}m`);
      if (parts.length) {
        const lbl = document.createElement('div');
        Object.assign(lbl.style, {
          position: 'absolute', left: bl + 'px', top: (top - 15) + 'px',
          width: bw + 'px', textAlign: 'center',
          fontFamily: 'Consolas, monospace', fontSize: '11px',
          fontWeight: 'bold', color: type.boss ? '#ff8800' : '#fff',
          textShadow: '1px 1px 2px #000, 0 0 4px #000',
          whiteSpace: 'nowrap', overflow: 'hidden'
        });
        lbl.textContent = parts.join(' | ');
        espLayer.appendChild(lbl);
      }
    }
  }

  // ============================================================
  // FLY MODE
  // ============================================================
  function doFly(dt) {
    if (!CFG.fly.enabled || !G) return;
    const k = G.state.keys;
    const speed = CFG.fly.speed * (k['ShiftLeft'] ? CFG.fly.fastMult : 1) * dt;

    let dy = 0;
    if (k[CFG.fly.upKey]) dy += speed;
    if (k[CFG.fly.downKey]) dy -= speed;

    if (dy !== 0) {
      G.playerYaw.position.y += dy;
      if (G.playerYaw.position.y < 1.7) G.playerYaw.position.y = 1.7;
      if (G.playerYaw.position.y > 100) G.playerYaw.position.y = 100;
    }
    G.state.velocityY = 0;
  }

  // ============================================================
  // KEYBINDS
  // ============================================================
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case CFG.aim.key: CFG.aim.enabled = !CFG.aim.enabled; break;
      case CFG.silent.key: CFG.silent.enabled = !CFG.silent.enabled; break;
      case CFG.magic.key: CFG.magic.enabled = !CFG.magic.enabled; break;
      case CFG.rapid.key: CFG.rapid.enabled = !CFG.rapid.enabled; break;
      case CFG.infAmmo.key: CFG.infAmmo.enabled = !CFG.infAmmo.enabled; break;
      case 'KeyV':
        CFG.esp.enabled = !CFG.esp.enabled;
        if (!CFG.esp.enabled) espLayer.innerHTML = '';
        break;
      case CFG.fly.key: CFG.fly.enabled = !CFG.fly.enabled; break;
      case CFG.wallSpawn.key: spawnWall(); return; // không update status mỗi lần spawn
      case 'KeyB': CFG.aim.fov = CFG.aim.fov >= 800 ? 100 : CFG.aim.fov + 100; break;
      case 'KeyO': CFG.esp.showLine = !CFG.esp.showLine; break;
    }
    updateStatus();
  });

  // ============================================================
  // LOOP
  // ============================================================
  let lastT = performance.now();
  function loop() {
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (G) {
      ensureSilentPatch();
      ensureMagicPatch();
      try { doAim(); } catch (e) { }
      try { doESP(); } catch (e) { }
      try { doFly(dt); } catch (e) { }
      try { doRapid(); } catch (e) { }
      try { doInfAmmo(); } catch (e) { }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ============================================================
  // STATUS
  // ============================================================
  function updateStatus() {
    const cl = (b, t) => `<span style="color:${b ? '#0f0' : '#666'}">${t}</span>`;
    statusEl.innerHTML =
      `<b style="color:#0f0">[CHEAT]</b> ${G ? 'HOOK' : 'chờ'} | ` +
      cl(CFG.aim.enabled, 'AIM[X]') + ' ' +
      cl(CFG.silent.enabled, 'SILENT[Z]') + ' ' +
      cl(CFG.magic.enabled, 'MAGIC[M]') + ' ' +
      cl(CFG.rapid.enabled, 'RAPID[G]') + ' ' +
      cl(CFG.infAmmo.enabled, 'INFAMMO[H]') + ' ' +
      cl(CFG.esp.enabled, 'ESP[V]') + ' ' +
      cl(CFG.fly.enabled, 'FLY[F]') +
      `<br><span style="font-size:10px;color:#aaa">` +
      `T=Wall  B=FOV  O=Line | Enemies: ${G ? G.enemies.length : 0} | Walls: ${wallCount}` +
      `</span>`;
  }
  setInterval(updateStatus, 400);
})();