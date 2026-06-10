const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 12;
const DEFAULT_FREE_DRINKS = 3;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const socketPlayers = new Map();

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function cleanName(name, fallback) {
  return String(name || fallback || 'Player').trim().slice(0, 18) || fallback || 'Player';
}

function cleanAmount(amount) {
  return Math.max(0, Math.floor(Number(amount) || 0));
}

function makePlayer({ name, color, isBanker = false }) {
  return {
    id: uid(),
    name: cleanName(name, isBanker ? 'Bartender' : 'Player'),
    color: color || (isBanker ? '#c62828' : '#0f7a3b'),
    isBanker,
    sipsTaken: 0,
    sipsToGive: 0,
    sipsGiven: 0,
    sipsReceived: 0,
    paymentsMade: 0,
    paymentsReceived: 0,
    connected: true
  };
}

function initialRoom(leader) {
  return {
    code: roomCode(),
    createdAt: Date.now(),
    currentTurnIndex: 0,
    freeDrinks: DEFAULT_FREE_DRINKS,
    players: [leader],
    lastAction: {
      title: 'Room created',
      text: `${leader.name} is the bartender. Start paying sips when the game begins.`
    },
    settings: {
      freeDrinksMinimum: DEFAULT_FREE_DRINKS
    },
    log: [
      {
        time: new Date().toLocaleTimeString(),
        text: `${leader.name} created the Beeropoly room.`
      }
    ]
  };
}

function addLog(room, text) {
  room.log.unshift({ time: new Date().toLocaleTimeString(), text });
  room.log = room.log.slice(0, 200);
}

function emitRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit('state', room);
}

function getContext(socket) {
  const ctx = socketPlayers.get(socket.id);
  if (!ctx) return {};
  const room = rooms.get(ctx.roomCode);
  const player = room?.players.find(p => p.id === ctx.playerId);
  return { ctx, room, player };
}

function currentPlayer(room) {
  return room.players[room.currentTurnIndex] || room.players[0];
}

function nextTurn(room) {
  if (!room.players.length) return;
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  const p = currentPlayer(room);
  room.lastAction = { title: `${p.name}'s turn`, text: 'Use the Pay tab when someone owes sips.' };
  addLog(room, `Turn moved to ${p.name}.`);
}

function requireBanker(player, cb) {
  if (!player?.isBanker) {
    cb?.({ ok: false, error: 'Only the bartender can do that.' });
    return false;
  }
  return true;
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name, color }, cb) => {
    const leader = makePlayer({ name, color, isBanker: true });
    const room = initialRoom(leader);
    rooms.set(room.code, room);

    socket.join(room.code);
    socketPlayers.set(socket.id, { roomCode: room.code, playerId: leader.id });

    cb?.({ ok: true, roomCode: room.code, playerId: leader.id });
    emitRoom(room.code);
  });

  socket.on('joinRoom', ({ roomCode, name, color }, cb) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'Room not found.' });
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: `Room already has ${MAX_PLAYERS} players.` });

    const player = makePlayer({ name, color, isBanker: false });
    room.players.push(player);
    addLog(room, `${player.name} joined Beeropoly.`);

    socket.join(room.code);
    socketPlayers.set(socket.id, { roomCode: room.code, playerId: player.id });

    cb?.({ ok: true, roomCode: room.code, playerId: player.id });
    emitRoom(room.code);
  });

  socket.on('rejoin', ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode);
    const player = room?.players.find(p => p.id === playerId);
    if (!room || !player) return cb?.({ ok: false });

    player.connected = true;
    socket.join(roomCode);
    socketPlayers.set(socket.id, { roomCode, playerId });

    cb?.({ ok: true, roomCode, playerId });
    emitRoom(roomCode);
  });

  socket.on('payPlayer', ({ toId, amount, note }, cb) => {
    const { ctx, room, player: payer } = getContext(socket);
    if (!room || !payer) return cb?.({ ok: false, error: 'Not in a room.' });

    const recipient = room.players.find(p => p.id === toId);
    const n = cleanAmount(amount);
    const cleanNote = String(note || '').trim().slice(0, 60);

    if (!recipient || recipient.id === payer.id) return cb?.({ ok: false, error: 'Choose another player.' });
    if (!n) return cb?.({ ok: false, error: 'Enter a valid sip amount.' });

    payer.sipsTaken += n;
    payer.paymentsMade += n;
    recipient.sipsReceived += n;
    recipient.paymentsReceived += n;

    room.lastAction = {
      title: `${payer.name} paid ${recipient.name}`,
      text: `${payer.name} owes ${n} sip${n === 1 ? '' : 's'}${cleanNote ? ` for ${cleanNote}` : ''}.`
    };

    addLog(room, `${payer.name} paid ${recipient.name} ${n} sip${n === 1 ? '' : 's'}${cleanNote ? ` — ${cleanNote}` : ''}.`);
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('giveOutSips', ({ toId, amount, note }, cb) => {
    const { ctx, room, player: giver } = getContext(socket);
    if (!room || !giver) return cb?.({ ok: false, error: 'Not in a room.' });

    const receiver = room.players.find(p => p.id === toId);
    const n = cleanAmount(amount);
    const cleanNote = String(note || '').trim().slice(0, 60);

    if (!receiver || receiver.id === giver.id) return cb?.({ ok: false, error: 'Choose another player.' });
    if (!n) return cb?.({ ok: false, error: 'Enter a valid sip amount.' });
    if ((giver.sipsToGive || 0) < n) return cb?.({ ok: false, error: 'You do not have that many give-out sips.' });

    giver.sipsToGive -= n;
    giver.sipsGiven += n;
    receiver.sipsTaken += n;

    room.lastAction = {
      title: `${giver.name} gave out sips`,
      text: `${receiver.name} takes ${n} sip${n === 1 ? '' : 's'}${cleanNote ? ` for ${cleanNote}` : ''}.`
    };

    addLog(room, `${giver.name} gave ${receiver.name} ${n} sip${n === 1 ? '' : 's'}${cleanNote ? ` — ${cleanNote}` : ''}.`);
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('addToFreeDrinks', ({ amount }, cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });

    const n = cleanAmount(amount);
    if (!n) return cb?.({ ok: false, error: 'Enter a valid sip amount.' });

    player.sipsTaken += n;
    room.freeDrinks += n;
    room.lastAction = { title: 'Free Drinks grew', text: `${player.name} added ${n} sip${n === 1 ? '' : 's'} to Free Drinks.` };
    addLog(room, `${player.name} added ${n} sip${n === 1 ? '' : 's'} to Free Drinks.`);

    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('collectFreeDrinks', (cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });

    const amount = Math.max(room.freeDrinks || 0, room.settings.freeDrinksMinimum || DEFAULT_FREE_DRINKS);
    player.sipsToGive += amount;
    room.freeDrinks = room.settings.freeDrinksMinimum || DEFAULT_FREE_DRINKS;
    room.lastAction = { title: 'Free Drinks collected', text: `${player.name} gets ${amount} sips to give out.` };
    addLog(room, `${player.name} collected Free Drinks and gets ${amount} sip${amount === 1 ? '' : 's'} to give out.`);

    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('endTurn', (cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });

    const current = currentPlayer(room);
    if (current.id !== player.id && !player.isBanker) {
      return cb?.({ ok: false, error: 'Only the current player or bartender can end the turn.' });
    }

    nextTurn(room);
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('bankerAdjustSips', ({ playerId, amount, mode }, cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;

    const target = room.players.find(p => p.id === playerId);
    const n = cleanAmount(amount);
    if (!target || !n) return cb?.({ ok: false, error: 'Choose a player and valid amount.' });

    if (mode === 'give') {
      target.sipsToGive += n;
      addLog(room, `Bartender gave ${target.name} ${n} sip${n === 1 ? '' : 's'} to give out.`);
    } else if (mode === 'remove') {
      target.sipsTaken = Math.max(0, target.sipsTaken - n);
      addLog(room, `Bartender removed ${n} sip${n === 1 ? '' : 's'} from ${target.name}.`);
    } else {
      target.sipsTaken += n;
      addLog(room, `Bartender assigned ${n} sip${n === 1 ? '' : 's'} to ${target.name}.`);
    }

    room.lastAction = { title: 'Bartender adjustment', text: `${target.name}'s sip count was adjusted.` };
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('bankerResetPlayer', ({ playerId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;

    const target = room.players.find(p => p.id === playerId);
    if (!target) return cb?.({ ok: false, error: 'Player not found.' });

    target.sipsTaken = 0;
    target.sipsToGive = 0;
    target.sipsGiven = 0;
    target.sipsReceived = 0;
    target.paymentsMade = 0;
    target.paymentsReceived = 0;

    addLog(room, `Bartender reset ${target.name}'s stats.`);
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('bankerResetRoom', (cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;

    room.players.forEach(p => {
      p.sipsTaken = 0;
      p.sipsToGive = 0;
      p.sipsGiven = 0;
      p.sipsReceived = 0;
      p.paymentsMade = 0;
      p.paymentsReceived = 0;
    });
    room.freeDrinks = room.settings.freeDrinksMinimum || DEFAULT_FREE_DRINKS;
    room.currentTurnIndex = 0;
    room.lastAction = { title: 'Room reset', text: 'All sip stats were reset by the bartender.' };
    addLog(room, 'Bartender reset the room.');

    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('bankerSetTurn', ({ playerId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;

    const index = room.players.findIndex(p => p.id === playerId);
    if (index < 0) return cb?.({ ok: false, error: 'Player not found.' });

    room.currentTurnIndex = index;
    room.lastAction = { title: `${room.players[index].name}'s turn`, text: 'Bartender changed the turn.' };
    addLog(room, `Bartender set the turn to ${room.players[index].name}.`);
    emitRoom(ctx.roomCode);
    cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const ctx = socketPlayers.get(socket.id);
    if (!ctx) return;

    const room = rooms.get(ctx.roomCode);
    const player = room?.players.find(p => p.id === ctx.playerId);
    if (player) player.connected = false;

    socketPlayers.delete(socket.id);
    if (room) emitRoom(ctx.roomCode);
  });
});

server.listen(PORT, () => console.log(`Beeropoly running on port ${PORT}`));
