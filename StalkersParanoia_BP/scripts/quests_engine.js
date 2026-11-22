import { world, system } from "@minecraft/server";
import { Abyss, Bus, alive, blockAt, cleanName, isNight, later, players, pget, saveState } from "./realtime_timeline.js";
import { sayCold, sayWorld } from "./world_voice.js";
import { questCopy, showNote } from "./story_lore.js";

function doneSet() {
  if (!Abyss.quests.done) Abyss.quests.done = [];
  return new Set(Abyss.quests.done);
}

export function isDone(id) {
  return doneSet().has(id);
}

export function markDone(id, name) {
  const set = doneSet();
  if (set.has(id)) return false;
  set.add(id);
  Abyss.quests.done = [...set];
  saveState();
  const list = questCopy();
  const item = list.find((q) => q.id === id);
  sayWorld(`Протокол отмечает: ${item ? item.text : id}${name ? " — " + cleanName(name) : ""}.`);
  announceNext();
  return true;
}

function nextQuest() {
  return questCopy().find((q) => !isDone(q.id));
}

function announceNext() {
  const q = nextQuest();
  if (!q) {
    sayCold("Строки протокола кончились. Осталась только печать.");
    return;
  }
  if (Abyss.quests.announced === q.id) return;
  Abyss.quests.announced = q.id;
  saveState();
  sayCold("Дальше. " + q.text);
  if (q.id === "note_01" || q.id === "note_02") {
    const idx = q.id === "note_01" ? 0 : 1;
    const qid = q.id;
    later(40, () => {
      for (const p of players().filter(alive)) {
        try { p.runCommand("give @s abyss:survivor_note 1"); } catch (e) {}
        showNote(p, idx);
      }
      markDone(qid);
    });
  }
  if (q.id === "silence") sayCold("Встаньте и не двигайтесь. Пятьдесят секунд. Я проверяю, живые ли вы.");
}

const silence = new Map();
const ritual = new Map();
let descended = new Set();

function moved(player) {
  const prev = silence.get(player.id) || { x: player.location.x, z: player.location.z, t: 0 };
  const dx = player.location.x - prev.x;
  const dz = player.location.z - prev.z;
  const step = Math.hypot(dx, dz);
  return { prev, step };
}

function nearLog(player) {
  const dim = player.dimension;
  for (let y = -1; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        const b = blockAt(dim, player.location.x + x, player.location.y + y, player.location.z + z);
        if (b && (b.typeId.includes("_log") || b.typeId.endsWith("_log") || b.typeId.includes("log"))) return true;
      }
    }
  }
  return false;
}

function friendNear(player) {
  return players().some((p) => p.id !== player.id && alive(p) && Math.hypot(p.location.x - player.location.x, p.location.z - player.location.z) < 6);
}

export function initQuests() {
  later(80, () => announceNext());
  Bus.on("bed_denied", (e) => markDone("first_night", e.name));
  Bus.on("game_day", (gd) => { if (gd >= 1) markDone("first_night"); });
  Bus.on("hand_lunged", (e) => markDone("the_hand", e.name));
  Bus.on("retro_on", () => markDone("alpha_dawn"));
  Bus.on("cave_screamed", (e) => markDone("the_descent", e.name));
  Bus.on("possession_end", (e) => markDone("parasite", e.name));
  Bus.on("window_cracked", (e) => markDone("the_window", e.name));
  Bus.on("catastrophe", (kind) => {
    if (kind === "eclipse") markDone("eclipse");
    if (kind === "choir") markDone("the_choir");
  });
  Bus.on("catastrophe_end", (kind) => {
    if (kind === "eclipse") markDone("eclipse");
    if (kind === "choir") markDone("the_choir");
  });
  Bus.on("rift_return", (e) => markDone("the_rift", e.name));
  Bus.on("shards", () => {
    if ((Abyss.flags.shardsGiven || 0) >= 7) markDone("shards");
  });
  Bus.on("ritual_done", (e) => markDone("ritual", e.name));
  Bus.on("silence_done", (e) => markDone("silence", e.name));
  Bus.on("architect_dead", () => markDone("the_architect"));
  Bus.on("second", () => {
    const active = Abyss.quests.announced;
    for (const p of players().filter(alive)) {
      if (p.location.y < 45) descended.add(p.id);
      if (descended.has(p.id) && p.location.y > 60) markDone("the_descent", p.name);
      if (active === "silence" || isDone("note_02")) {
        if (active === "silence") {
          const m = moved(p);
          if (m.step > 0.12) {
            if (m.prev.t > 5) try { p.sendMessage("§8[МИР]: Ты шевельнулся."); } catch (e) {}
            silence.set(p.id, { x: p.location.x, z: p.location.z, t: 0 });
          } else {
            const t = m.prev.t + 1;
            silence.set(p.id, { x: p.location.x, z: p.location.z, t });
            try { p.onScreenDisplay.setActionBar(`§7Тишина: ${t}/50`); } catch (e) {}
            if (t >= 50) {
              Bus.emit("silence_done", { name: p.name });
              silence.set(p.id, { x: p.location.x, z: p.location.z, t: 0 });
            }
          }
        }
      }
      if (active === "ritual" && isNight() && nearLog(p)) {
        const sneaking = !!p.isSneaking;
        const company = friendNear(p) || !!Abyss.inRealm[p.name] || players().some((o) => Abyss.inRealm[o.name]);
        if (sneaking && (company || players().length === 1)) {
          const n = (ritual.get(p.id) || 0) + 1;
          ritual.set(p.id, n);
          try { p.onScreenDisplay.setActionBar(`§7Ритуал у дерева: ${n}/10`); } catch (e) {}
          if (n >= 10) {
            ritual.set(p.id, 0);
            for (const o of players()) {
              if (Abyss.inRealm[o.name]) {
                try { o.sendMessage("§8[МИР]: Тебя зовут обратно по имени."); } catch (e) {}
              }
            }
            const taken = Object.keys(Abyss.inRealm);
            sayCold(taken.length ? `${cleanName(p.name)} вытягивает ${taken.join(", ")} из дерева.` : `${cleanName(p.name)} стоит у дерева, и мир делает вид, что друг всё это время был рядом.`);
            try { p.runCommand("clear @s abyss:void_shard 0 1"); } catch (e) {}
            Bus.emit("ritual_done", { name: p.name });
          }
        } else ritual.set(p.id, 0);
      }
      if (!isDone("note_01") && pget(p, "abyss_read_0", 0) === 1) markDone("note_01", p.name);
      if (!isDone("note_02") && pget(p, "abyss_read_1", 0) === 1) markDone("note_02", p.name);
    }
    if ((Abyss.flags.shardsGiven || 0) >= 7) markDone("shards");
  });
  try {
    world.afterEvents.itemUse.subscribe((ev) => {
      if (ev.itemStack?.typeId !== "abyss:survivor_note") return;
      const player = ev.source;
      system.run(() => {
        const idx = isDone("note_01") ? 1 : 0;
        showNote(player, idx).then(() => {
          try { player.setDynamicProperty(idx === 0 ? "abyss_read_0" : "abyss_read_1", 1); } catch (e) {}
          markDone(idx === 0 ? "note_01" : "note_02", player.name);
          if (idx === 1) later(10, () => showNote(player, 2));
        });
      });
    });
  } catch (e) { console.warn("[abyss note] " + e); }
}
