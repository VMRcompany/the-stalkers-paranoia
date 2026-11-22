import { system } from "@minecraft/server";
import { Bus, alive, gameDayNumber, intensity, later, players, realDay, shake } from "./realtime_timeline.js";
import { playAll, caveScream } from "./audio_director.js";
import { pushSpecial, clearSpecial } from "./fog_director.js";
import { sayCold } from "./world_voice.js";

let running = false;

export function forceSkyEyes() {
  if (running) return;
  const list = players().filter(alive);
  if (!list.length) return;
  running = true;
  pushSpecial("abyss:sky_eyes_fog");
  playAll("abyss.sky_eyes", 1, 1);
  sayCold("Не поднимайте голову.");
  const spawned = [];
  for (const p of list) {
    const base = p.location;
    for (let gx = -2; gx <= 2; gx++) {
      for (let gz = -2; gz <= 2; gz++) {
        if (Math.abs(gx) + Math.abs(gz) > 4) continue;
        const loc = { x: base.x + gx * 7, y: base.y + 22, z: base.z + gz * 7 };
        try {
          const eye = p.dimension.spawnEntity("abyss:sky_eye", loc);
          spawned.push(eye);
        } catch (e) {}
      }
    }
  }
  later(20 * 5, () => {
    for (const eye of spawned) {
      try { if (eye && eye.isValid) eye.remove(); } catch (e) {}
    }
    for (const p of players().filter(alive)) {
      let pitch = 0;
      try { pitch = p.getRotation().x; } catch (e) {}
      if (pitch < -25) {
        caveScream(p);
        shake(p, 0.5, 0.5);
        try {
          p.addEffect("blindness", 40, { amplifier: 1, showParticles: false });
          p.onScreenDisplay.setTitle("§fОНО ТОЖЕ СМОТРИТ", { stayDuration: 12, fadeInDuration: 0, fadeOutDuration: 6 });
        } catch (e) {}
      }
    }
    clearSpecial();
    running = false;
    Bus.emit("sky_eyes_done", {});
  });
}

export function initSkyEyes() {
  let acc = 0;
  system.runInterval(() => {
    if (gameDayNumber() < 3 && realDay() < 3) return;
    acc += 1;
    const need = Math.max(2, 8 - intensity());
    if (acc < need || running) return;
    acc = 0;
    if (Math.random() < 0.55) forceSkyEyes();
  }, 20 * 45);
}
