const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', socket => {
  socket.on('message', msg => {
    const data = JSON.parse(msg);
    if (data.type === 'join') {
      socket.room = data.room;
      rooms[data.room] = rooms[data.room] || [];
      rooms[data.room].push(socket);
      rooms[data.room].forEach(s => {
        if (s !== socket) s.send(JSON.stringify({ type: 'new-peer' }));
      });
    }
    if (data.type === 'signal') {
      rooms[socket.room].forEach(s => {
        if (s !== socket) s.send(JSON.stringify({ type: 'signal', data: data.data }));
      });
    }
  });

  socket.on('close', () => {
    if (rooms[socket.room]) {
      rooms[socket.room] = rooms[socket.room].filter(s => s !== socket);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket sunucusu çalışıyor: ${PORT}`);
});
