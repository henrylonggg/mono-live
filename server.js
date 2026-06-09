const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const FREE_PARKING_MIN = 100;
const MAX_PLAYERS = 6;

const DEEDS = [
  { name: 'Mediterranean Ave', group: 'Brown', color: '#7b3f00', price: 60, rent: [2,10,30,90,160,250], house: 50, mortgage: 30 },
  { name: 'Baltic Ave', group: 'Brown', color: '#7b3f00', price: 60, rent: [4,20,60,180,320,450], house: 50, mortgage: 30 },
  { name: 'Reading Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Oriental Ave', group: 'Light Blue', color: '#87ceeb', price: 100, rent: [6,30,90,270,400,550], house: 50, mortgage: 50 },
  { name: 'Vermont Ave', group: 'Light Blue', color: '#87ceeb', price: 100, rent: [6,30,90,270,400,550], house: 50, mortgage: 50 },
  { name: 'Connecticut Ave', group: 'Light Blue', color: '#87ceeb', price: 120, rent: [8,40,100,300,450,600], house: 50, mortgage: 60 },
  { name: 'St. Charles Place', group: 'Pink', color: '#d946ef', price: 140, rent: [10,50,150,450,625,750], house: 100, mortgage: 70 },
  { name: 'Electric Company', group: 'Utility', type: 'utility', color: '#60a5fa', price: 150, mortgage: 75 },
  { name: 'States Ave', group: 'Pink', color: '#d946ef', price: 140, rent: [10,50,150,450,625,750], house: 100, mortgage: 70 },
  { name: 'Virginia Ave', group: 'Pink', color: '#d946ef', price: 160, rent: [12,60,180,500,700,900], house: 100, mortgage: 80 },
  { name: 'Pennsylvania Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'St. James Place', group: 'Orange', color: '#f97316', price: 180, rent: [14,70,200,550,750,950], house: 100, mortgage: 90 },
  { name: 'Tennessee Ave', group: 'Orange', color: '#f97316', price: 180, rent: [14,70,200,550,750,950], house: 100, mortgage: 90 },
  { name: 'New York Ave', group: 'Orange', color: '#f97316', price: 200, rent: [16,80,220,600,800,1000], house: 100, mortgage: 100 },
  { name: 'Kentucky Ave', group: 'Red', color: '#dc2626', price: 220, rent: [18,90,250,700,875,1050], house: 150, mortgage: 110 },
  { name: 'Indiana Ave', group: 'Red', color: '#dc2626', price: 220, rent: [18,90,250,700,875,1050], house: 150, mortgage: 110 },
  { name: 'Illinois Ave', group: 'Red', color: '#dc2626', price: 240, rent: [20,100,300,750,925,1100], house: 150, mortgage: 120 },
  { name: 'B&O Railroad', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Atlantic Ave', group: 'Yellow', color: '#facc15', price: 260, rent: [22,110,330,800,975,1150], house: 150, mortgage: 130 },
  { name: 'Ventnor Ave', group: 'Yellow', color: '#facc15', price: 260, rent: [22,110,330,800,975,1150], house: 150, mortgage: 130 },
  { name: 'Water Works', group: 'Utility', type: 'utility', color: '#60a5fa', price: 150, mortgage: 75 },
  { name: 'Marvin Gardens', group: 'Yellow', color: '#facc15', price: 280, rent: [24,120,360,850,1025,1200], house: 150, mortgage: 140 },
  { name: 'Pacific Ave', group: 'Green', color: '#16a34a', price: 300, rent: [26,130,390,900,1100,1275], house: 200, mortgage: 150 },
  { name: 'North Carolina Ave', group: 'Green', color: '#16a34a', price: 300, rent: [26,130,390,900,1100,1275], house: 200, mortgage: 150 },
  { name: 'Pennsylvania Ave', group: 'Green', color: '#16a34a', price: 320, rent: [28,150,450,1000,1200,1400], house: 200, mortgage: 160 },
  { name: 'Short Line', group: 'Railroad', type: 'railroad', color: '#111111', price: 200, mortgage: 100 },
  { name: 'Park Place', group: 'Dark Blue', color: '#1d4ed8', price: 350, rent: [35,175,500,1100,1300,1500], house: 200, mortgage: 175 },
  { name: 'Boardwalk', group: 'Dark Blue', color: '#1d4ed8', price: 400, rent: [50,200,600,1400,1700,2000], house: 200, mortgage: 200 }
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function money(n) {
  return `$${Number(n || 0).toLocaleString()}`;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function addLog(room, text) {
  room.log.unshift({ time: now(), text });
  room.log = room.log.slice(0, 200);
}

function publicRoom(room) {
  return JSON.parse(JSON.stringify(room));
}

function emitRoom(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit('room:update', publicRoom(room));
}

function createRoomState(leader) {
  const code = roomCode();
  const room = {
    code,
    bankerId: leader.id,
    startingMoney: 1500,
    freeParking: FREE_PARKING_MIN,
    players: [leader],
    properties: DEEDS.map(() => ({ ownerId: null, houses: 0, mortgaged: false })),
    trades: [],
    log: []
  };
  addLog(room, `${leader.name} created the room and became banker.`);
  return room;
}

function findRoomAndPlayer(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return {};
  const player = room.players.find(p => p.id === socket.data.playerId);
  return { room, player };
}

function requireBanker(socket, room) {
  return socket.data.playerId && room.bankerId === socket.data.playerId;
}

function ownsFullColorSet(room, playerId, group) {
  if (['Railroad', 'Utility'].includes(group)) return false;
  const groupIndexes = DEEDS.map((d, i) => d.group === group ? i : null).filter(i => i !== null);
  return groupIndexes.length > 0 && groupIndexes.every(i => room.properties[i].ownerId === playerId && !room.properties[i].mortgaged);
}

function calculateRent(room, deedIndex, utilityAmount) {
  const deed = DEEDS[deedIndex];
  const prop = room.properties[deedIndex];
  if (!prop.ownerId || prop.mortgaged) return 0;
  if (deed.rent) return deed.rent[prop.houses || 0];
  if (deed.type === 'railroad') {
    const count = room.properties.filter((p, i) => p.ownerId === prop.ownerId && DEEDS[i].type === 'railroad').length;
    return [25, 50, 100, 200][Math.max(0, count - 1)];
  }
  if (deed.type === 'utility') return Math.max(0, Number(utilityAmount || 0));
  return 0;
}

io.on('connection', socket => {
  socket.on('room:create', ({ name, color }) => {
    const leader = { id: uid(), name: String(name || 'Banker').slice(0, 16), color: color || '#c62828', balance: 1500 };
    const room = createRoomState(leader);
    rooms.set(room.code, room);
    socket.data.roomCode = room.code;
    socket.data.playerId = leader.id;
    socket.join(room.code);
    socket.emit('player:identity', { playerId: leader.id, roomCode: room.code });
    emitRoom(room.code);
  });

  socket.on('room:join', ({ code, name, color }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return socket.emit('error:message', 'Room not found.');
    if (room.players.length >= MAX_PLAYERS) return socket.emit('error:message', 'This room already has 6 players.');
    const player = { id: uid(), name: String(name || 'Player').slice(0, 16), color: color || '#0f7a3b', balance: room.startingMoney };
    room.players.push(player);
    addLog(room, `${player.name} joined with ${money(player.balance)}.`);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    socket.join(room.code);
    socket.emit('player:identity', { playerId: player.id, roomCode: room.code });
    emitRoom(room.code);
  });

  socket.on('room:rejoin', ({ code, playerId }) => {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room || !room.players.some(p => p.id === playerId)) return;
    socket.data.roomCode = room.code;
    socket.data.playerId = playerId;
    socket.join(room.code);
    socket.emit('player:identity', { playerId, roomCode: room.code });
    emitRoom(room.code);
  });

  socket.on('player:payRent', ({ deedIndex, utilityAmount }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const prop = room.properties[deedIndex];
    const deed = DEEDS[deedIndex];
    if (!prop || !prop.ownerId) return socket.emit('error:message', 'That property is unowned.');
    if (prop.ownerId === player.id) return socket.emit('error:message', 'You own this property.');
    if (prop.mortgaged) return socket.emit('error:message', 'This property is mortgaged. No rent due.');
    const owner = room.players.find(p => p.id === prop.ownerId);
    if (!owner) return;
    const rent = calculateRent(room, deedIndex, utilityAmount);
    if (rent <= 0) return socket.emit('error:message', 'Rent must be above $0.');
    if (player.balance < rent) return socket.emit('error:message', 'Not enough cash. Mortgage/sell first.');
    player.balance -= rent;
    owner.balance += rent;
    addLog(room, `${player.name} paid ${owner.name} ${money(rent)} rent for ${deed.name}.`);
    emitRoom(room.code);
  });

  socket.on('player:payPlayer', ({ toId, amount }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const to = room.players.find(p => p.id === toId);
    amount = Number(amount);
    if (!to || to.id === player.id) return;
    if (!amount || amount <= 0) return socket.emit('error:message', 'Enter a valid amount.');
    if (player.balance < amount) return socket.emit('error:message', 'Not enough cash.');
    player.balance -= amount;
    to.balance += amount;
    addLog(room, `${player.name} paid ${to.name} ${money(amount)}.`);
    emitRoom(room.code);
  });

  socket.on('banker:giveMoney', ({ playerId, amount, reason }) => {
    const { room } = findRoomAndPlayer(socket);
    if (!room || !requireBanker(socket, room)) return socket.emit('error:message', 'Only the banker can give money.');
    const player = room.players.find(p => p.id === playerId);
    amount = Number(amount);
    if (!player || !amount || amount <= 0) return;
    player.balance += amount;
    addLog(room, `Banker gave ${player.name} ${money(amount)} for ${reason || 'bank adjustment'}.`);
    emitRoom(room.code);
  });

  socket.on('banker:removeMoney', ({ playerId, amount, reason }) => {
    const { room } = findRoomAndPlayer(socket);
    if (!room || !requireBanker(socket, room)) return socket.emit('error:message', 'Only the banker can remove money.');
    const player = room.players.find(p => p.id === playerId);
    amount = Number(amount);
    if (!player || !amount || amount <= 0) return;
    player.balance = Math.max(0, player.balance - amount);
    addLog(room, `Banker removed ${money(amount)} from ${player.name} for ${reason || 'bank adjustment'}.`);
    emitRoom(room.code);
  });

  socket.on('banker:setStartingMoney', ({ amount }) => {
    const { room } = findRoomAndPlayer(socket);
    if (!room || !requireBanker(socket, room)) return socket.emit('error:message', 'Only the banker can set starting money.');
    amount = Number(amount);
    if (!amount || amount <= 0) return;
    room.startingMoney = amount;
    room.players.forEach(p => { p.balance = amount; });
    addLog(room, `Banker set every player to ${money(amount)}.`);
    emitRoom(room.code);
  });

  socket.on('banker:assignProperty', ({ deedIndex, playerId, chargePlayer }) => {
    const { room } = findRoomAndPlayer(socket);
    if (!room || !requireBanker(socket, room)) return socket.emit('error:message', 'Only the banker can assign properties.');
    const deed = DEEDS[deedIndex];
    const prop = room.properties[deedIndex];
    const player = room.players.find(p => p.id === playerId);
    if (!deed || !prop || !player) return;
    if (prop.ownerId) return socket.emit('error:message', 'That property is already owned.');
    if (chargePlayer && player.balance < deed.price) return socket.emit('error:message', `${player.name} does not have enough cash.`);
    if (chargePlayer) player.balance -= deed.price;
    prop.ownerId = player.id;
    addLog(room, `Banker assigned ${deed.name} to ${player.name}${chargePlayer ? ` for ${money(deed.price)}` : ''}.`);
    emitRoom(room.code);
  });

  socket.on('property:addHouse', ({ deedIndex }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const deed = DEEDS[deedIndex];
    const prop = room.properties[deedIndex];
    if (!deed?.rent || !prop) return;
    if (prop.ownerId !== player.id && !requireBanker(socket, room)) return socket.emit('error:message', 'Only the owner or banker can add houses.');
    const owner = room.players.find(p => p.id === prop.ownerId);
    if (!owner) return;
    if (!ownsFullColorSet(room, owner.id, deed.group)) return socket.emit('error:message', `You need the full ${deed.group} color set before buying houses.`);
    if (prop.mortgaged) return socket.emit('error:message', 'Cannot build on a mortgaged property.');
    if (prop.houses >= 5) return socket.emit('error:message', 'This property already has a hotel.');
    if (owner.balance < deed.house) return socket.emit('error:message', 'Not enough cash.');
    owner.balance -= deed.house;
    prop.houses += 1;
    addLog(room, `${owner.name} bought ${prop.houses === 5 ? 'a hotel' : 'a house'} on ${deed.name} for ${money(deed.house)}.`);
    emitRoom(room.code);
  });

  socket.on('property:sellHouse', ({ deedIndex }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const deed = DEEDS[deedIndex];
    const prop = room.properties[deedIndex];
    if (!deed?.rent || !prop) return;
    if (prop.ownerId !== player.id && !requireBanker(socket, room)) return socket.emit('error:message', 'Only the owner or banker can sell houses.');
    const owner = room.players.find(p => p.id === prop.ownerId);
    if (!owner || prop.houses <= 0) return;
    const sale = Math.floor(deed.house / 2);
    prop.houses -= 1;
    owner.balance += sale;
    addLog(room, `${owner.name} sold a house/hotel from ${deed.name} for ${money(sale)}.`);
    emitRoom(room.code);
  });

  socket.on('property:toggleMortgage', ({ deedIndex }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const deed = DEEDS[deedIndex];
    const prop = room.properties[deedIndex];
    if (!deed || !prop) return;
    if (prop.ownerId !== player.id && !requireBanker(socket, room)) return socket.emit('error:message', 'Only the owner or banker can mortgage.');
    const owner = room.players.find(p => p.id === prop.ownerId);
    if (!owner) return;
    if (deed.rent && prop.houses > 0) return socket.emit('error:message', 'Sell houses before mortgaging.');
    if (!prop.mortgaged) {
      prop.mortgaged = true;
      owner.balance += deed.mortgage;
      addLog(room, `${owner.name} mortgaged ${deed.name} for ${money(deed.mortgage)}.`);
    } else {
      const cost = Math.ceil(deed.mortgage * 1.1);
      if (owner.balance < cost) return socket.emit('error:message', 'Not enough cash to unmortgage.');
      owner.balance -= cost;
      prop.mortgaged = false;
      addLog(room, `${owner.name} unmortgaged ${deed.name} for ${money(cost)}.`);
    }
    emitRoom(room.code);
  });

  socket.on('trade:create', ({ toId, giveMoney, wantMoney, giveProps, wantProps }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const to = room.players.find(p => p.id === toId);
    giveMoney = Number(giveMoney || 0);
    wantMoney = Number(wantMoney || 0);
    giveProps = Array.isArray(giveProps) ? giveProps.map(Number) : [];
    wantProps = Array.isArray(wantProps) ? wantProps.map(Number) : [];
    if (!to || to.id === player.id) return;
    if (player.balance < giveMoney || to.balance < wantMoney) return socket.emit('error:message', 'One side does not have enough cash.');
    if (!giveMoney && !wantMoney && !giveProps.length && !wantProps.length) return socket.emit('error:message', 'Trade cannot be empty.');
    for (const i of giveProps) if (room.properties[i]?.ownerId !== player.id) return socket.emit('error:message', 'You do not own all properties offered.');
    for (const i of wantProps) if (room.properties[i]?.ownerId !== to.id) return socket.emit('error:message', 'They do not own all properties requested.');
    room.trades.unshift({ id: uid(), fromId: player.id, toId, giveMoney, wantMoney, giveProps, wantProps, status: 'pending' });
    addLog(room, `${player.name} proposed a trade to ${to.name}.`);
    emitRoom(room.code);
  });

  socket.on('trade:accept', ({ tradeId }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const trade = room.trades.find(t => t.id === tradeId && t.status === 'pending');
    if (!trade) return;
    if (trade.toId !== player.id && !requireBanker(socket, room)) return socket.emit('error:message', 'Only the receiving player or banker can accept.');
    const from = room.players.find(p => p.id === trade.fromId);
    const to = room.players.find(p => p.id === trade.toId);
    if (!from || !to || from.balance < trade.giveMoney || to.balance < trade.wantMoney) return socket.emit('error:message', 'Trade is no longer valid.');
    for (const i of trade.giveProps) if (room.properties[i]?.ownerId !== from.id) return socket.emit('error:message', 'Offered properties changed.');
    for (const i of trade.wantProps) if (room.properties[i]?.ownerId !== to.id) return socket.emit('error:message', 'Requested properties changed.');
    from.balance -= trade.giveMoney;
    to.balance += trade.giveMoney;
    to.balance -= trade.wantMoney;
    from.balance += trade.wantMoney;
    trade.giveProps.forEach(i => { room.properties[i].ownerId = to.id; room.properties[i].houses = 0; });
    trade.wantProps.forEach(i => { room.properties[i].ownerId = from.id; room.properties[i].houses = 0; });
    trade.status = 'accepted';
    addLog(room, `${to.name} accepted ${from.name}'s trade.`);
    emitRoom(room.code);
  });

  socket.on('trade:decline', ({ tradeId }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const trade = room.trades.find(t => t.id === tradeId && t.status === 'pending');
    if (!trade) return;
    if (trade.toId !== player.id && !requireBanker(socket, room)) return socket.emit('error:message', 'Only the receiving player or banker can decline.');
    trade.status = 'declined';
    addLog(room, `${player.name} declined a trade.`);
    emitRoom(room.code);
  });

  socket.on('freeParking:collect', () => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    const amount = Math.max(room.freeParking, FREE_PARKING_MIN);
    player.balance += amount;
    room.freeParking = FREE_PARKING_MIN;
    addLog(room, `${player.name} collected ${money(amount)} from Free Parking.`);
    emitRoom(room.code);
  });

  socket.on('freeParking:pay', ({ amount }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    amount = Number(amount);
    if (!amount || amount <= 0 || player.balance < amount) return;
    player.balance -= amount;
    room.freeParking += amount;
    addLog(room, `${player.name} paid ${money(amount)} into Free Parking.`);
    emitRoom(room.code);
  });

  socket.on('bank:pay', ({ amount }) => {
    const { room, player } = findRoomAndPlayer(socket);
    if (!room || !player) return;
    amount = Number(amount);
    if (!amount || amount <= 0 || player.balance < amount) return;
    player.balance -= amount;
    addLog(room, `${player.name} paid the bank ${money(amount)}.`);
    emitRoom(room.code);
  });
});

server.listen(PORT, () => console.log(`Monopoly Live Bank running on port ${PORT}`));
