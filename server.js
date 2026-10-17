const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const WORLD = { width: 2200, height: 1600 };
const players = new Map();
const resources = [];
const zombies = [];
let nextId = 1;

function rand(min, max) { return Math.random() * (max - min) + min; }
function makeResource() {
  const type = Math.random() < 0.58 ? "wood" : "food";
  return { id: "r" + nextId++, type, x: rand(50, WORLD.width - 50), y: rand(50, WORLD.height - 50) };
}
function makeZombie() {
  return { id: "z" + nextId++, x: rand(80, WORLD.width - 80), y: rand(80, WORLD.height - 80), hp: 40, speed: rand(42, 58) };
}
for (let i = 0; i < 100; i++) resources.push(makeResource());
for (let i = 0; i < 18; i++) zombies.push(makeZombie());

function publicPlayer(p) {
  return { id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp, hunger: p.hunger, wood: p.wood, food: p.food, color: p.color };
}
io.on("connection", socket => {
  const colors = ["#69db7c", "#74c0fc", "#ffd43b", "#da77f2", "#ff8787", "#ffa94d"];
  const p = {
    id: socket.id, name: "Игрок " + String(players.size + 1),
    x: rand(150, WORLD.width - 150), y: rand(150, WORLD.height - 150),
    hp: 100, hunger: 100, wood: 0, food: 0,
    color: colors[Math.floor(Math.random() * colors.length)],
    lastAttack: 0, lastMove: Date.now()
  };
  players.set(socket.id, p);
  socket.emit("init", { id: p.id, world: WORLD });
  socket.on("move", data => {
    const player = players.get(socket.id);
    if (!player || !data) return;
    const dx = Math.max(-1, Math.min(1, Number(data.dx) || 0));
    const dy = Math.max(-1, Math.min(1, Number(data.dy) || 0));
    const now = Date.now();
    const dt = Math.min((now - player.lastMove) / 1000, 0.1);
    player.lastMove = now;
    const len = Math.hypot(dx, dy) || 1;
    player.x = Math.max(18, Math.min(WORLD.width - 18, player.x + dx / len * 230 * dt));
    player.y = Math.max(18, Math.min(WORLD.height - 18, player.y + dy / len * 230 * dt));
  });
  socket.on("attack", () => {
    const player = players.get(socket.id);
    if (!player || Date.now() - player.lastAttack < 450 || player.hp <= 0) return;
    player.lastAttack = Date.now();
    const target = zombies
      .map(z => ({ z, d: Math.hypot(z.x - player.x, z.y - player.y) }))
      .filter(v => v.d < 78)
      .sort((a,b) => a.d - b.d)[0];
    if (target) {
      target.z.hp -= 25;
      if (target.z.hp <= 0) {
        const idx = zombies.findIndex(z => z.id === target.z.id);
        if (idx >= 0) zombies.splice(idx, 1);
        if (Math.random() < 0.6) resources.push({ id: "r" + nextId++, type: "food", x: target.z.x, y: target.z.y });
      }
    }
  });
  socket.on("collect", () => {
    const player = players.get(socket.id);
    if (!player || player.hp <= 0) return;
    const idx = resources.findIndex(r => Math.hypot(r.x - player.x, r.y - player.y) < 42);
    if (idx >= 0) {
      const [r] = resources.splice(idx, 1);
      if (r.type === "wood") player.wood += 1;
      else player.food += 1;
    }
  });
  socket.on("eat", () => {
    const player = players.get(socket.id);
    if (player && player.food > 0 && player.hp > 0) {
      player.food--; player.hunger = Math.min(100, player.hunger + 28);
      player.hp = Math.min(100, player.hp + 8);
    }
  });
  socket.on("build", () => {
    const player = players.get(socket.id);
    if (!player || player.wood < 3 || player.hp <= 0) return;
    player.wood -= 3;
    // A simple barricade is placed near the player and broadcast as a resource-like structure.
    structures.push({ id: "b" + nextId++, x: player.x + rand(-30, 30), y: player.y + rand(-30, 30), owner: player.id });
  });
  socket.on("disconnect", () => players.delete(socket.id));
});

const structures = [];
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;

  for (const p of players.values()) {
    if (p.hp > 0) {
      p.hunger = Math.max(0, p.hunger - dt * 1.15);
      if (p.hunger <= 0) p.hp = Math.max(0, p.hp - dt * 3);
      if (p.hp <= 0) continue;
      let nearest = null, best = Infinity;
      for (const z of zombies) {
        const d = Math.hypot(p.x - z.x, p.y - z.y);
        if (d < best) { best = d; nearest = z; }
      }
      if (nearest && best < 330) {
        const dx = p.x - nearest.x, dy = p.y - nearest.y;
        const len = Math.hypot(dx, dy) || 1;
        nearest.x += dx / len * nearest.speed * dt;
        nearest.y += dy / len * nearest.speed * dt;
        if (best < 27) p.hp = Math.max(0, p.hp - dt * 16);
      }
    }
  }
  while (zombies.length < 18) zombies.push(makeZombie());
  while (resources.length < 100) resources.push(makeResource());
  io.emit("state", {
    players: [...players.values()].map(publicPlayer),
    resources, zombies, structures
  });
}, 50);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Игра запущена: http://localhost:${PORT}`));
