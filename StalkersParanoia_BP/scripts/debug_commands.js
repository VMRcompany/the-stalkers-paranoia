import { world, system } from "@minecraft/server";
import { playerById, setRealDay, statusLines } from "./realtime_timeline.js";
import { possessRandom } from "./player_possession.js";
import { summonHandNear } from "./underbed_hand.js";
import { summonHerobrine, summonNotch } from "./herobrine_notch.js";
import { forceGlitch } from "./world_glitches.js";
import { forceSkyEyes } from "./sky_eyes.js";
import { forceCaveSequence } from "./cave_vengeance.js";
import { forceCatastrophe } from "./daily_catastrophes.js";
import { forceCrack } from "./window_cracks.js";
import { forceRetro } from "./retro_textures.js";
import { setFogStage } from "./fog_director.js";
import { forceRift } from "./void_rifts.js";
import { spawnBoss } from "./bosses_ai.js";
import { playNamed, playFor } from "./audio_director.js";
import { forceFinale } from "./ending_ritual.js";

function reply(player, text) {
  try { player.sendMessage(text); } catch (e) {}
}

export function handleAbyss(player, message) {
  const parts = message.trim().split(/\s+/);
  const cmd = (parts[1] || "help").toLowerCase();
  const arg = (parts[2] || "").toLowerCase();
  if (cmd === "status") {
    reply(player, statusLines().join("\n"));
    return;
  }
  if (cmd === "setday") {
    const n = parseInt(parts[2], 10);
    if (!(n >= 1 && n <= 5)) { reply(player, "§7!abyss setday <1-5>"); return; }
    setRealDay(n);
    reply(player, `§7Реальный день установлен: ${n}. Это сдвигает онлайн-таймер, не календарь Windows.`);
    return;
  }
  if (cmd === "possess") { possessRandom(15); reply(player, "§7Одержимость запущена."); return; }
  if (cmd === "hand") { summonHandNear(player); reply(player, "§7Рука лезет из-под ног."); return; }
  if (cmd === "herobrine") { summonHerobrine(player); return; }
  if (cmd === "notch") { summonNotch(player); return; }
  if (cmd === "glitch") { forceGlitch(player); reply(player, "§7Пол под вами забыл себя."); return; }
  if (cmd === "skyeyes") { forceSkyEyes(); return; }
  if (cmd === "cavescreamer") { forceCaveSequence(player); return; }
  if (cmd === "catastrophe") { forceCatastrophe(arg); return; }
  if (cmd === "crackwindow") { forceCrack(player); return; }
  if (cmd === "retro") { forceRetro(); return; }
  if (cmd === "fog") {
    if (arg === "off") setFogStage(0);
    else setFogStage(parseInt(arg, 10));
    reply(player, "§7Туман: " + (arg || "?"));
    return;
  }
  if (cmd === "rift") { forceRift(player); return; }
  if (cmd === "boss") {
    const kind = ["colossus", "harvester", "echo", "architect"].includes(arg) ? arg : "colossus";
    spawnBoss(kind, player);
    reply(player, "§7Босс: " + kind);
    return;
  }
  if (cmd === "music") {
    const name = ["dread", "daisy", "mashup", "crystal", "lavender", "computers", "help"].includes(arg) ? arg : "dread";
    playNamed(arg === "crystal" ? player : null, name);
    reply(player, "§7Музыка: " + name);
    return;
  }
  if (cmd === "crystal") {
    playFor(player, "horror.crystal_faded_child", 1, 1);
    reply(player, "§7Crystal of Faded Child играет только у тебя.");
    return;
  }
  if (cmd === "final") { forceFinale(); reply(player, "§7Финал открыт с первого этапа."); return; }
  reply(player, [
    "§7!abyss status | setday <1-5> | possess | hand | herobrine | notch",
    "§7!abyss glitch | skyeyes | cavescreamer | catastrophe | crackwindow | retro",
    "§7!abyss fog <1-10|off> | rift | boss <colossus|harvester|echo|architect>",
    "§7!abyss music <dread|daisy|mashup|crystal|lavender|computers|help> | crystal | final",
  ].join("\n"));
}

export function initDebug() {
  try {
    world.beforeEvents.chatSend.subscribe((event) => {
      const msg = event.message || "";
      if (!msg.toLowerCase().startsWith("!abyss")) return;
      event.cancel = true;
      const id = event.sender?.id;
      const text = msg;
      system.run(() => {
        const player = playerById(id);
        if (!player) return;
        try { handleAbyss(player, text); } catch (e) { reply(player, "§c" + e); }
      });
    });
  } catch (e) {
    console.warn("[abyss] chatSend недоступен: " + e);
  }
}
