const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 8;
const STARTING_MONEY = 1500;
const FREE_PARKING_MIN = 100;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const socketPlayers = new Map();

const DEEDS = [
  { name: 'Mediterranean Avenue', group: 'Brown', color: '#7b3f00', price: 60, rent: [2, 10, 30, 90, 160, 250], house: 50, mortgage: 30 },
  { name: 'Baltic Avenue', group: 'Brown', color: '#7b3f00', price: 60, rent: [4, 20, 60, 180, 320, 450], house: 50, mortgage: 30 },
  { name: 'Reading Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Oriental Avenue', group: 'Light Blue', color: '#87ceeb', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Vermont Avenue', group: 'Light Blue', color: '#87ceeb', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Connecticut Avenue', group: 'Light Blue', color: '#87ceeb', price: 120, rent: [8, 40, 100, 300, 450, 600], house: 50, mortgage: 60 },
  { name: 'St. Charles Place', group: 'Pink', color: '#d946ef', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Electric Company', group: 'Utility', type: 'utility', color: '#60a5fa', price: 150, mortgage: 75 },
  { name: 'States Avenue', group: 'Pink', color: '#d946ef', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Virginia Avenue', group: 'Pink', color: '#d946ef', price: 160, rent: [12, 60, 180, 500, 700, 900], house: 100, mortgage: 80 },
  { name: 'Pennsylvania Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'St. James Place', group: 'Orange', color: '#f97316', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'Tennessee Avenue', group: 'Orange', color: '#f97316', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'New York Avenue', group: 'Orange', color: '#f97316', price: 200, rent: [16, 80, 220, 600, 800, 1000], house: 100, mortgage: 100 },
  { name: 'Kentucky Avenue', group: 'Red', color: '#dc2626', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'Indiana Avenue', group: 'Red', color: '#dc2626', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'Illinois Avenue', group: 'Red', color: '#dc2626', price: 240, rent: [20, 100, 300, 750, 925, 1100], house: 150, mortgage: 120 },
  { name: 'B&O Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Atlantic Avenue', group: 'Yellow', color: '#facc15', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'Ventnor Avenue', group: 'Yellow', color: '#facc15', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'Water Works', group: 'Utility', type: 'utility', color: '#60a5fa', price: 150, mortgage: 75 },
  { name: 'Marvin Gardens', group: 'Yellow', color: '#facc15', price: 280, rent: [24, 120, 360, 850, 1025, 1200], house: 150, mortgage: 140 },
  { name: 'Pacific Avenue', group: 'Green', color: '#16a34a', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'North Carolina Avenue', group: 'Green', color: '#16a34a', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'Pennsylvania Avenue', group: 'Green', color: '#16a34a', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200, mortgage: 160 },
  { name: 'Short Line', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Park Place', group: 'Dark Blue', color: '#1d4ed8', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200, mortgage: 175 },
  { name: 'Boardwalk', group: 'Dark Blue', color: '#1d4ed8', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200, mortgage: 200 }
];

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function uid() { return Math.random().toString(36).slice(2, 10); }
function cleanName(name, fallback) { return String(name || fallback || 'Player').trim().slice(0, 18) || fallback || 'Player'; }
function cleanAmount(amount) { return Math.max(0, Math.floor(Number(amount) || 0)); }
function money(n) { return '$' + Number(n || 0).toLocaleString(); }

function makePlayer({ name, color, isBanker = false }) {
  return {
    id: uid(), name: cleanName(name, isBanker ? 'Banker' : 'Player'), color: color || (isBanker ? '#c62828' : '#0f7a3b'),
    isBanker, balance: STARTING_MONEY, paymentsMade: 0, paymentsReceived: 0, connected: true
  };
}
function initialRoom(leader) {
  return {
    code: roomCode(), createdAt: Date.now(), currentTurnIndex: 0, freeParking: FREE_PARKING_MIN,
    players: [leader],
    properties: DEEDS.map(() => ({ ownerId: null, houses: 0, mortgaged: false })),
    purchaseRequests: [],
    freeParkingRequests: [],
    tradeOffers: [],
    lastAction: { title: 'Room created', text: `${leader.name} is the banker. Players can request title deeds.` },
    settings: { startingMoney: STARTING_MONEY, freeParkingMinimum: FREE_PARKING_MIN },
    log: [{ time: new Date().toLocaleTimeString(), text: `${leader.name} created the Monopoly room.` }]
  };
}
function addLog(room, text) { room.log.unshift({ time: new Date().toLocaleTimeString(), text }); room.log = room.log.slice(0, 200); }
function emitRoom(code) { const room = rooms.get(code); if (room) io.to(code).emit('state', { ...room, deeds: DEEDS }); }
function getContext(socket) { const ctx = socketPlayers.get(socket.id); const room = ctx ? rooms.get(ctx.roomCode) : null; const player = room?.players.find(p => p.id === ctx.playerId); return { ctx, room, player }; }
function currentPlayer(room) { return room.players[room.currentTurnIndex] || room.players[0]; }
function requireBanker(player, cb) { if (!player?.isBanker) { cb?.({ ok: false, error: 'Only the banker can do that.' }); return false; } return true; }
function ownerOf(room, index) { return room.players.find(p => p.id === room.properties[index]?.ownerId); }
function propertyIndexesByGroup(group) { return DEEDS.map((d, i) => d.group === group && !d.type ? i : null).filter(i => i !== null); }
function ownsFullColorSet(room, playerId, index) {
  const deed = DEEDS[index];
  if (!deed || deed.type) return false;
  return propertyIndexesByGroup(deed.group).every(i => room.properties[i].ownerId === playerId);
}
function countOwnedType(room, playerId, type) { return room.properties.filter((p, i) => p.ownerId === playerId && DEEDS[i].type === type).length; }
function calculateRent(room, index) {
  const deed = DEEDS[index]; const prop = room.properties[index];
  if (!deed || !prop || prop.mortgaged) return 0;
  if (deed.rent) return deed.rent[prop.houses || 0];
  if (deed.type === 'railroad') return [25, 50, 100, 200][Math.max(0, countOwnedType(room, prop.ownerId, 'railroad') - 1)];
  if (deed.type === 'utility') return countOwnedType(room, prop.ownerId, 'utility') >= 2 ? 70 : 28;
  return 0;
}

function cleanPropertyIndexes(value) {
  const arr = Array.isArray(value) ? value : [];
  return [...new Set(arr.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < DEEDS.length))];
}
function validateTradeSide(room, ownerId, indexes) {
  return indexes.every(i => room.properties[i]?.ownerId === ownerId);
}
function activeTradeFor(room, fromId, toId) {
  return room.tradeOffers?.find(t => t.status === 'pending' && t.fromId === fromId && t.toId === toId);
}
function nextTurn(room) {
  if (!room.players.length) return;
  room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
  const p = currentPlayer(room);
  room.lastAction = { title: `${p.name}'s turn`, text: 'Use title deeds to buy, request approval, or pay rent.' };
  addLog(room, `Turn moved to ${p.name}.`);
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name, color }, cb) => {
    const leader = makePlayer({ name, color, isBanker: true }); const room = initialRoom(leader);
    rooms.set(room.code, room); socket.join(room.code); socketPlayers.set(socket.id, { roomCode: room.code, playerId: leader.id });
    cb?.({ ok: true, roomCode: room.code, playerId: leader.id }); emitRoom(room.code);
  });
  socket.on('joinRoom', ({ roomCode, name, color }, cb) => {
    const code = String(roomCode || '').trim().toUpperCase(); const room = rooms.get(code);
    if (!room) return cb?.({ ok: false, error: 'Room not found.' });
    if (room.players.length >= MAX_PLAYERS) return cb?.({ ok: false, error: `Room already has ${MAX_PLAYERS} players.` });
    const player = makePlayer({ name, color, isBanker: false }); player.balance = room.settings.startingMoney || STARTING_MONEY;
    room.players.push(player); addLog(room, `${player.name} joined with ${money(player.balance)}.`);
    socket.join(room.code); socketPlayers.set(socket.id, { roomCode: room.code, playerId: player.id });
    cb?.({ ok: true, roomCode: room.code, playerId: player.id }); emitRoom(room.code);
  });
  socket.on('rejoin', ({ roomCode, playerId }, cb) => {
    const room = rooms.get(roomCode); const player = room?.players.find(p => p.id === playerId);
    if (!room || !player) return cb?.({ ok: false });
    player.connected = true; socket.join(roomCode); socketPlayers.set(socket.id, { roomCode, playerId }); cb?.({ ok: true }); emitRoom(roomCode);
  });

  socket.on('requestPurchase', ({ propertyIndex }, cb) => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const index = Number(propertyIndex); const deed = DEEDS[index]; const prop = room.properties[index];
    if (!deed || !prop) return cb?.({ ok: false, error: 'Property not found.' });
    if (prop.ownerId) return cb?.({ ok: false, error: 'That title deed is already owned.' });
    if (player.balance < deed.price) return cb?.({ ok: false, error: 'You do not have enough money.' });
    const existing = room.purchaseRequests.find(r => r.status === 'pending' && r.propertyIndex === index && r.playerId === player.id);
    if (existing) return cb?.({ ok: false, error: 'You already requested this property.' });
    room.purchaseRequests.unshift({ id: uid(), playerId: player.id, propertyIndex: index, status: 'pending', createdAt: Date.now() });
    room.lastAction = { title: 'Purchase approval needed', text: `${player.name} requested to buy ${deed.name} for ${money(deed.price)}.` };
    addLog(room, `${player.name} requested banker approval to buy ${deed.name}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('approvePurchase', ({ requestId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;
    const req = room.purchaseRequests.find(r => r.id === requestId); if (!req || req.status !== 'pending') return cb?.({ ok: false, error: 'Request not found.' });
    const buyer = room.players.find(p => p.id === req.playerId); const deed = DEEDS[req.propertyIndex]; const prop = room.properties[req.propertyIndex];
    if (!buyer || !deed || !prop) return cb?.({ ok: false, error: 'Request is invalid.' });
    if (prop.ownerId) { req.status = 'denied'; return cb?.({ ok: false, error: 'Property is already owned.' }); }
    if (buyer.balance < deed.price) return cb?.({ ok: false, error: `${buyer.name} does not have enough money anymore.` });
    buyer.balance -= deed.price; prop.ownerId = buyer.id; req.status = 'approved';
    room.lastAction = { title: 'Purchase approved', text: `${buyer.name} bought ${deed.name} for ${money(deed.price)}.` };
    addLog(room, `Banker approved ${buyer.name}'s purchase of ${deed.name} for ${money(deed.price)}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('denyPurchase', ({ requestId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;
    const req = room.purchaseRequests.find(r => r.id === requestId); if (!req || req.status !== 'pending') return cb?.({ ok: false, error: 'Request not found.' });
    const buyer = room.players.find(p => p.id === req.playerId); const deed = DEEDS[req.propertyIndex]; req.status = 'denied';
    addLog(room, `Banker denied ${buyer?.name || 'a player'}'s request for ${deed?.name || 'a property'}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('payRent', ({ propertyIndex }, cb) => {
    const { ctx, room, player: payer } = getContext(socket); if (!room || !payer) return cb?.({ ok: false, error: 'Not in a room.' });
    const index = Number(propertyIndex); const deed = DEEDS[index]; const prop = room.properties[index]; const owner = ownerOf(room, index);
    if (!deed || !prop || !owner) return cb?.({ ok: false, error: 'This deed is not owned.' });
    if (owner.id === payer.id) return cb?.({ ok: false, error: 'You own this property.' });
    const rent = calculateRent(room, index); if (!rent) return cb?.({ ok: false, error: 'No rent is due.' });
    if (payer.balance < rent) return cb?.({ ok: false, error: 'You do not have enough money to pay this rent.' });
    payer.balance -= rent; owner.balance += rent; payer.paymentsMade += rent; owner.paymentsReceived += rent;
    room.lastAction = { title: 'Rent paid', text: `${payer.name} paid ${owner.name} ${money(rent)} for ${deed.name}.` };
    addLog(room, `${payer.name} paid ${owner.name} ${money(rent)} rent for ${deed.name}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('payPlayer', ({ toId, amount, note }, cb) => {
    const { ctx, room, player: payer } = getContext(socket); if (!room || !payer) return cb?.({ ok: false, error: 'Not in a room.' });
    const recipient = room.players.find(p => p.id === toId); const n = cleanAmount(amount); const cleanNote = String(note || '').trim().slice(0, 60);
    if (!recipient || recipient.id === payer.id) return cb?.({ ok: false, error: 'Choose another player.' });
    if (!n) return cb?.({ ok: false, error: 'Enter a valid amount.' });
    if (payer.balance < n) return cb?.({ ok: false, error: 'Not enough money.' });
    payer.balance -= n; recipient.balance += n; payer.paymentsMade += n; recipient.paymentsReceived += n;
    room.lastAction = { title: `${payer.name} paid ${recipient.name}`, text: `${payer.name} paid ${money(n)}${cleanNote ? ` for ${cleanNote}` : ''}.` };
    addLog(room, `${payer.name} paid ${recipient.name} ${money(n)}${cleanNote ? ` — ${cleanNote}` : ''}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('payBank', ({ amount, note }, cb) => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const n = cleanAmount(amount); const cleanNote = String(note || '').trim().slice(0, 60);
    if (!n) return cb?.({ ok: false, error: 'Enter a valid amount.' }); if (player.balance < n) return cb?.({ ok: false, error: 'Not enough money.' });
    player.balance -= n; addLog(room, `${player.name} paid the bank ${money(n)}${cleanNote ? ` — ${cleanNote}` : ''}.`);
    room.lastAction = { title: 'Bank paid', text: `${player.name} paid ${money(n)} to the bank.` };
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('payFreeParking', ({ amount }, cb) => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const n = cleanAmount(amount); if (!n) return cb?.({ ok: false, error: 'Enter a valid amount.' }); if (player.balance < n) return cb?.({ ok: false, error: 'Not enough money.' });
    player.balance -= n; room.freeParking += n; room.lastAction = { title: 'Free Parking grew', text: `${player.name} added ${money(n)} to Free Parking.` };
    addLog(room, `${player.name} paid ${money(n)} into Free Parking.`); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('requestFreeParking', cb => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const existing = room.freeParkingRequests?.find(r => r.status === 'pending' && r.playerId === player.id);
    if (existing) return cb?.({ ok: false, error: 'You already requested Free Parking approval.' });
    room.freeParkingRequests = room.freeParkingRequests || [];
    const amount = Math.max(room.freeParking || 0, room.settings.freeParkingMinimum || FREE_PARKING_MIN);
    room.freeParkingRequests.unshift({ id: uid(), playerId: player.id, amount, status: 'pending', createdAt: Date.now() });
    room.lastAction = { title: 'Free Parking approval needed', text: `${player.name} requested to collect ${money(amount)} from Free Parking.` };
    addLog(room, `${player.name} requested banker approval to collect ${money(amount)} from Free Parking.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('approveFreeParking', ({ requestId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;
    room.freeParkingRequests = room.freeParkingRequests || [];
    const req = room.freeParkingRequests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return cb?.({ ok: false, error: 'Free Parking request not found.' });
    const winner = room.players.find(p => p.id === req.playerId);
    if (!winner) return cb?.({ ok: false, error: 'Player not found.' });
    const amount = Math.max(room.freeParking || 0, room.settings.freeParkingMinimum || FREE_PARKING_MIN);
    winner.balance += amount;
    room.freeParking = room.settings.freeParkingMinimum || FREE_PARKING_MIN;
    req.status = 'approved';
    room.lastAction = { title: 'Free Parking approved', text: `${winner.name} collected ${money(amount)} from Free Parking.` };
    addLog(room, `Banker approved ${winner.name}'s Free Parking collection of ${money(amount)}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('denyFreeParking', ({ requestId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket);
    if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;
    room.freeParkingRequests = room.freeParkingRequests || [];
    const req = room.freeParkingRequests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return cb?.({ ok: false, error: 'Free Parking request not found.' });
    const requester = room.players.find(p => p.id === req.playerId);
    req.status = 'denied';
    addLog(room, `Banker denied ${requester?.name || 'a player'}'s Free Parking request.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('payTaxOrJail', ({ amount, reason }, cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const n = cleanAmount(amount);
    const cleanReason = String(reason || 'Tax/Jail').trim().slice(0, 60);
    if (!n) return cb?.({ ok: false, error: 'Enter a valid amount.' });
    if (player.balance < n) return cb?.({ ok: false, error: 'Not enough money.' });
    player.balance -= n;
    room.freeParking += n;
    room.lastAction = { title: `${cleanReason} paid`, text: `${player.name} paid ${money(n)} into Free Parking.` };
    addLog(room, `${player.name} paid ${money(n)} for ${cleanReason}. Money went into Free Parking.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });


  socket.on('createTradeOffer', ({ toId, giveMoney, receiveMoney, giveProperties, receiveProperties, analyzerScore, analyzerLabel }, cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    room.tradeOffers = room.tradeOffers || [];
    const target = room.players.find(p => p.id === toId);
    const gm = cleanAmount(giveMoney);
    const rm = cleanAmount(receiveMoney);
    const give = cleanPropertyIndexes(giveProperties);
    const receive = cleanPropertyIndexes(receiveProperties);
    if (!target || target.id === player.id) return cb?.({ ok: false, error: 'Choose another player to trade with.' });
    if (!gm && !rm && !give.length && !receive.length) return cb?.({ ok: false, error: 'Add money or title deeds to the trade.' });
    if (player.balance < gm) return cb?.({ ok: false, error: 'You do not have enough money for your offer.' });
    if (target.balance < rm) return cb?.({ ok: false, error: `${target.name} does not have enough money for that request.` });
    if (!validateTradeSide(room, player.id, give)) return cb?.({ ok: false, error: 'You can only offer title deeds you own.' });
    if (!validateTradeSide(room, target.id, receive)) return cb?.({ ok: false, error: `You can only request title deeds ${target.name} owns.` });
    if (activeTradeFor(room, player.id, target.id)) return cb?.({ ok: false, error: `You already have a pending trade with ${target.name}.` });
    const offer = {
      id: uid(), fromId: player.id, toId: target.id,
      giveMoney: gm, receiveMoney: rm, giveProperties: give, receiveProperties: receive,
      analyzerScore: Math.max(0, Math.min(100, Math.round(Number(analyzerScore) || 50))),
      analyzerLabel: String(analyzerLabel || 'Neutral').slice(0, 20),
      status: 'pending', createdAt: Date.now()
    };
    room.tradeOffers.unshift(offer);
    room.lastAction = { title: 'Trade offer sent', text: `${player.name} sent ${target.name} a trade offer.` };
    addLog(room, `${player.name} offered a trade to ${target.name}. Analyzer: ${offer.analyzerScore}/100 ${offer.analyzerLabel}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('acceptTradeOffer', ({ tradeId }, cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    room.tradeOffers = room.tradeOffers || [];
    const trade = room.tradeOffers.find(t => t.id === tradeId);
    if (!trade || trade.status !== 'pending') return cb?.({ ok: false, error: 'Trade offer not found.' });
    if (trade.toId !== player.id) return cb?.({ ok: false, error: 'Only the receiving player can accept this trade.' });
    const from = room.players.find(p => p.id === trade.fromId);
    const to = room.players.find(p => p.id === trade.toId);
    if (!from || !to) return cb?.({ ok: false, error: 'Trade player not found.' });
    if (from.balance < trade.giveMoney) return cb?.({ ok: false, error: `${from.name} no longer has enough money.` });
    if (to.balance < trade.receiveMoney) return cb?.({ ok: false, error: `You no longer have enough money.` });
    if (!validateTradeSide(room, from.id, trade.giveProperties)) return cb?.({ ok: false, error: `${from.name} no longer owns one of the offered deeds.` });
    if (!validateTradeSide(room, to.id, trade.receiveProperties)) return cb?.({ ok: false, error: `You no longer own one of the requested deeds.` });

    from.balance = from.balance - trade.giveMoney + trade.receiveMoney;
    to.balance = to.balance - trade.receiveMoney + trade.giveMoney;
    trade.giveProperties.forEach(i => { room.properties[i].ownerId = to.id; room.properties[i].houses = 0; });
    trade.receiveProperties.forEach(i => { room.properties[i].ownerId = from.id; room.properties[i].houses = 0; });
    trade.status = 'accepted';
    room.tradeOffers.forEach(t => {
      if (t.status === 'pending' && t.id !== trade.id) {
        const touched = [...trade.giveProperties, ...trade.receiveProperties];
        if (touched.some(i => t.giveProperties.includes(i) || t.receiveProperties.includes(i))) t.status = 'expired';
      }
    });
    room.lastAction = { title: 'Trade accepted', text: `${to.name} accepted ${from.name}'s trade offer.` };
    addLog(room, `${to.name} accepted a trade with ${from.name}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('denyTradeOffer', ({ tradeId }, cb) => {
    const { ctx, room, player } = getContext(socket);
    if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    room.tradeOffers = room.tradeOffers || [];
    const trade = room.tradeOffers.find(t => t.id === tradeId);
    if (!trade || trade.status !== 'pending') return cb?.({ ok: false, error: 'Trade offer not found.' });
    if (trade.toId !== player.id && trade.fromId !== player.id && !player.isBanker) return cb?.({ ok: false, error: 'You cannot change this trade.' });
    trade.status = trade.toId === player.id ? 'denied' : 'cancelled';
    addLog(room, `${player.name} ${trade.status} a trade offer.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('endTurn', cb => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const current = currentPlayer(room); if (current.id !== player.id && !player.isBanker) return cb?.({ ok: false, error: 'Only the current player or banker can end the turn.' });
    nextTurn(room); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('addHouse', ({ propertyIndex }, cb) => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const index = Number(propertyIndex); const deed = DEEDS[index]; const prop = room.properties[index]; const owner = ownerOf(room, index);
    if (!deed?.rent || !prop || !owner) return cb?.({ ok: false, error: 'Only owned color properties can have houses.' });
    if (owner.id !== player.id && !player.isBanker) return cb?.({ ok: false, error: 'Only the owner or banker can add houses.' });
    if (!ownsFullColorSet(room, owner.id, index)) return cb?.({ ok: false, error: 'You need the full color set before buying houses.' });
    if (prop.houses >= 5) return cb?.({ ok: false, error: 'This property already has a hotel.' });
    if (owner.balance < deed.house) return cb?.({ ok: false, error: 'Owner does not have enough money.' });
    owner.balance -= deed.house; prop.houses++;
    addLog(room, `${owner.name} bought ${prop.houses === 5 ? 'a hotel' : 'a house'} on ${deed.name} for ${money(deed.house)}.`);
    emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('sellHouse', ({ propertyIndex }, cb) => {
    const { ctx, room, player } = getContext(socket); if (!room || !player) return cb?.({ ok: false, error: 'Not in a room.' });
    const index = Number(propertyIndex); const deed = DEEDS[index]; const prop = room.properties[index]; const owner = ownerOf(room, index);
    if (!deed?.rent || !prop || !owner || prop.houses <= 0) return cb?.({ ok: false, error: 'No house/hotel to sell.' });
    if (owner.id !== player.id && !player.isBanker) return cb?.({ ok: false, error: 'Only the owner or banker can sell houses.' });
    const refund = Math.floor(deed.house / 2); prop.houses--; owner.balance += refund;
    addLog(room, `${owner.name} sold a house/hotel from ${deed.name} for ${money(refund)}.`); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('bankerAdjustMoney', ({ playerId, amount, mode }, cb) => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' });
    if (!requireBanker(banker, cb)) return;
    const target = room.players.find(p => p.id === playerId); const n = cleanAmount(amount); if (!target || !n) return cb?.({ ok: false, error: 'Choose a player and valid amount.' });
    if (mode === 'remove') { target.balance = Math.max(0, target.balance - n); addLog(room, `Banker removed ${money(n)} from ${target.name}.`); }
    else { target.balance += n; addLog(room, `Banker gave ${target.name} ${money(n)}.`); }
    room.lastAction = { title: 'Banker adjustment', text: `${target.name}'s balance was adjusted.` }; emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('bankerSetStartingMoney', ({ amount }, cb) => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' }); if (!requireBanker(banker, cb)) return;
    const n = cleanAmount(amount); if (!n) return cb?.({ ok: false, error: 'Enter a valid amount.' }); room.settings.startingMoney = n; room.players.forEach(p => p.balance = n);
    addLog(room, `Banker set every player to ${money(n)}.`); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('bankerResetRoom', cb => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' }); if (!requireBanker(banker, cb)) return;
    room.players.forEach(p => { p.balance = room.settings.startingMoney || STARTING_MONEY; p.paymentsMade = 0; p.paymentsReceived = 0; });
    room.properties = DEEDS.map(() => ({ ownerId: null, houses: 0, mortgaged: false })); room.purchaseRequests = []; room.freeParkingRequests = []; room.tradeOffers = []; room.freeParking = FREE_PARKING_MIN; room.currentTurnIndex = 0;
    addLog(room, 'Banker reset the whole room.'); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('bankerSetTurn', ({ playerId }, cb) => {
    const { ctx, room, player: banker } = getContext(socket); if (!room || !banker) return cb?.({ ok: false, error: 'Not in a room.' }); if (!requireBanker(banker, cb)) return;
    const index = room.players.findIndex(p => p.id === playerId); if (index < 0) return cb?.({ ok: false, error: 'Player not found.' });
    room.currentTurnIndex = index; room.lastAction = { title: `${room.players[index].name}'s turn`, text: 'Banker changed the turn.' }; addLog(room, `Banker set the turn to ${room.players[index].name}.`); emitRoom(ctx.roomCode); cb?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const ctx = socketPlayers.get(socket.id); if (!ctx) return;
    const room = rooms.get(ctx.roomCode); const player = room?.players.find(p => p.id === ctx.playerId); if (player) player.connected = false;
    socketPlayers.delete(socket.id); if (room) emitRoom(ctx.roomCode);
  });
});

server.listen(PORT, () => console.log(`Monopoly Live running on port ${PORT}`));
