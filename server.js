const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

let channels = {
    "Genel": [],
    "Müzik": [],
    "Oyun": [],
};
let users = {};

io.on("connection", (socket) => {
    console.log("Baðlandý:", socket.id);

    socket.on("join", (username, channel) => {
        users[socket.id] = { username, channel };
        socket.join(channel);
        socket.emit("chat-history", channels[channel]);
        io.to(channel).emit("user-list", getUsers(channel));
    });

    socket.on("switch-channel", (newChannel) => {
        const prev = users[socket.id]?.channel;
        if (prev) socket.leave(prev);
        users[socket.id].channel = newChannel;
        socket.join(newChannel);
        socket.emit("chat-history", channels[newChannel]);
        io.to(newChannel).emit("user-list", getUsers(newChannel));
        if (prev) io.to(prev).emit("user-list", getUsers(prev));
    });

    socket.on("send-message", (msg) => {
        const user = users[socket.id];
        if (!user) return;
        const message = { user: user.username, text: msg, ts: Date.now() };
        channels[user.channel].push(message);
        io.to(user.channel).emit("new-message", message);
    });

    // Sesli oda: WebRTC sinyalleþme
    socket.on("webrtc-signal", ({ to, data }) => {
        io.to(to).emit("webrtc-signal", { from: socket.id, data });
    });
    socket.on("webrtc-signal-screen", ({ to, data }) => {
        io.to(to).emit("webrtc-signal-screen", { from: socket.id, data });
    });

    socket.on("get-users-in-voice", () => {
        const channel = users[socket.id]?.channel;
        const inChannel = Object.entries(users)
            .filter(([_, u]) => u.channel === channel)
            .map(([id, u]) => ({ id, username: u.username }));
        socket.emit("voice-users", inChannel);
    });

    socket.on("disconnect", () => {
        const user = users[socket.id];
        if (user) {
            io.to(user.channel).emit("user-list", getUsers(user.channel));
            delete users[socket.id];
        }
    });
});

function getUsers(channel) {
    return Object.values(users)
        .filter(u => u.channel === channel)
        .map(u => u.username);
}

server.listen(3001, () => {
    console.log("Sunucu 3001 portunda çalýþýyor!");
});
