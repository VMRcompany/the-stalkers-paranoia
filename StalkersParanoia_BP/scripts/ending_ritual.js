import { world } from "@minecraft/server";
import { Abyss, Bus, alive, later, players, saveState } from "./realtime_timeline.js";
import { sayCold, sayWorld } from "./world_voice.js";
import { loopNamed, playAll, stopLoop } from "./audio_director.js";
import { pushSpecial, clearSpecial, setFogStage } from "./fog_director.js";
import { forceSkyEyes } from "./sky_eyes.js";
import { spawnArchitect } from "./bosses_ai.js";
import { ensureRealm, openRift, REALMS } from "./void_rifts.js";
import { cleanName } from "./realtime_timeline.js";

const groupSilence = { t: 0 };

function countShards() {
  let n = 0;
  for (const p of players().filter(alive)) {
    try {
      const inv = (p.getComponent("minecraft:inventory") || p.getComponent("inventory"))?.container;
      if (!inv) continue;
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        if (it && it.typeId === "abyss:void_shard") n += it.amount;
      }
    } catch (e) {}
  }
  return n;
}

function inCitadel(p) {
  return p.location.x > 37000 && p.location.x < 39000 && p.location.z > 29000 && p.location.z < 31000;
}

export function startStage(n) {
  Abyss.finaleStage = n;
  saveState();
  const names = players().filter(alive).map((p) => cleanName(p.name)).join(", ") || "вы";
  if (n === 1) {
    sayWorld(`Пятый день. ${names}, протокол вскрыт. Я больше не притворяюсь погодой.`);
    setFogStage(10);
    pushSpecial("abyss:sky_eyes_fog");
    loopNamed("dread");
    forceSkyEyes();
    later(20 * 70, () => { if (Abyss.finaleStage === 1) startStage(2); });
  } else if (n === 2) {
    stopLoop("dread");
    sayCold("Идите в разлом цитадели. Пять секунд темноты — и чертёж станет полом.");
    const p = players().filter(alive)[0];
    if (p) {
      ensureRealm("citadel");
      openRift(p.dimension, { x: p.location.x + 3, y: p.location.y, z: p.location.z }, "citadel", 20 * 600);
    }
  } else if (n === 3) {
    groupSilence.t = 0;
    sayCold("В цитадели — абсолютная тишина. Все, кто онлайн, стоят 50 секунд. Один шаг обнуляет всех.");
  } else if (n === 4) {
    sayCold("Архитектор выходит из чертежа. Четыре фазы. До последней его нельзя убить.");
    playAll("abyss.ultimate_terror_mashup", 1, 1);
    const p = players().filter((pl) => alive(pl) && inCitadel(pl))[0] || players().filter(alive)[0];
    if (p) {
      try { p.teleport({ x: REALMS.citadel.x + 2, y: REALMS.citadel.y + 1, z: REALMS.citadel.z + 2 }); } catch (e) {}
      spawnArchitect(p);
    }
  } else if (n === 5) {
    clearSpecial();
    sayCold("Он стёрт. Печать хочет семь осколков в ваших руках и чтобы вы стояли на чёрном круге.");
  }
}

function seal() {
  if (Abyss.flags.sealed) return;
  Abyss.flags.sealed = true;
  Abyss.finaleStage = 5;
  saveState();
  for (const p of players()) {
    try { p.runCommand("clear @s abyss:void_shard"); } catch (e) {}
    try { p.addEffect("regeneration", 200, { amplifier: 1, showParticles: true }); } catch (e) {}
  }
  setFogStage(2);
  clearSpecial();
  try { world.setTimeOfDay(1000); } catch (e) {}
  try { world.sendMessage("§eHerobrine left the game"); } catch (e) {}
  try { world.sendMessage("§eNotch left the game"); } catch (e) {}
  const first = players().filter(alive)[0];
  const name = first ? cleanName(first.name) : "друг";
  sayWorld(`Привет, ${name}... Это самое обычное выживание. Стройте дом, добывайте ресурсы, отдыхайте. Но знайте — в итоге всё здесь станет совсем необычным...`);
  sayCold("Печать легла. Если голос снова тёплый — не верьте ему во второй раз.");
  Bus.emit("sealed", {});
}

export function forceFinale() {
  Abyss.flags.sealed = false;
  startStage(1);
}

export function initEnding() {
  Bus.on("real_day", (day) => {
    if (day >= 5 && !Abyss.flags.sealed && Abyss.finaleStage < 1) startStage(1);
  });
  Bus.on("rift_enter", (e) => {
    if (Abyss.finaleStage === 2 && e.key === "citadel") startStage(3);
  });
  Bus.on("architect_dead", () => {
    if (Abyss.finaleStage === 4) later(40, () => startStage(5));
  });
  Bus.on("second", () => {
    if (Abyss.flags.sealed) return;
    if (Abyss.finaleStage === 2 && players().some((p) => alive(p) && inCitadel(p))) startStage(3);
    if (Abyss.finaleStage === 3) {
      const inside = players().filter((p) => alive(p) && inCitadel(p));
      const all = players().filter(alive);
      if (!all.length || inside.length !== all.length) {
        groupSilence.t = 0;
        return;
      }
      let moved = false;
      for (const p of all) {
        const key = "fin_" + p.id;
        const prev = groupSilence[key] || { x: p.location.x, z: p.location.z };
        if (Math.hypot(p.location.x - prev.x, p.location.z - prev.z) > 0.12) moved = true;
        groupSilence[key] = { x: p.location.x, z: p.location.z };
      }
      if (moved) {
        if (groupSilence.t > 3) sayCold("Кто-то шагнул. Тишина сброшена.");
        groupSilence.t = 0;
      } else {
        groupSilence.t += 1;
        for (const p of all) {
          try { p.onScreenDisplay.setActionBar(`§7Общая тишина: ${groupSilence.t}/50`); } catch (e) {}
        }
        if (groupSilence.t >= 50) startStage(4);
      }
    }
    if (Abyss.finaleStage === 5) {
      const n = countShards();
      const earned = Abyss.flags.shardsGiven || 0;
      if (n >= 7) seal();
      else if ((Abyss.flags.sealNag || 0) % 25 === 0) {
        sayCold(`Печать считает осколки в руках: ${n}/7. Добыто за мир: ${earned}.`);
      }
      Abyss.flags.sealNag = (Abyss.flags.sealNag || 0) + 1;
    }
  });
}
