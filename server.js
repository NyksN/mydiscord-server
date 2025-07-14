const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("OK"));
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
let screenBroadcasters = {}; // { channelName: [{ id, username }] }

function getUsers(channel) {
    return Object.values(users)
        .filter(u => u.channel === channel)
        .map(u => u.username);
}

function broadcastVoiceUsers(channel) {
    const inChannel = Object.entries(users)
        .filter(([_, u]) => u.channel === channel)
        .map(([id, u]) => ({ id, username: u.username }));
    io.to(channel).emit("voice-users", inChannel);
}

function broadcastScreenBroadcasters(channel) {
    const broadcasters = screenBroadcasters[channel] || [];
    io.to(channel).emit("screen-broadcasters", broadcasters);
}

io.on("connection", (socket) => {
    console.log("Bağlandı:", socket.id);

    socket.on("join", (username, channel) => {
        users[socket.id] = { username, channel };
        socket.join(channel);
        socket.emit("chat-history", channels[channel]);
        io.to(channel).emit("user-list", getUsers(channel));
        broadcastScreenBroadcasters(channel); // yayındaki kullanıcılar yeni gelene de gözüksün
    });

    socket.on("switch-channel", (newChannel) => {
        const prev = users[socket.id]?.channel;
        if (prev) socket.leave(prev);
        users[socket.id].channel = newChannel;
        socket.join(newChannel);
        socket.emit("chat-history", channels[newChannel]);
        io.to(newChannel).emit("user-list", getUsers(newChannel));
        if (prev) io.to(prev).emit("user-list", getUsers(prev));
        broadcastScreenBroadcasters(newChannel); // kanal değişiminde yayıncıları gönder
    });

    socket.on("send-message", (msg) => {
        const user = users[socket.id];
        if (!user) return;
        const message = { user: user.username, text: msg, ts: Date.now() };
        channels[user.channel].push(message);
        io.to(user.channel).emit("new-message", message);
    });

    // Yayın (ekran paylaşımı) başlatma
    socket.on("start-screen-share", () => {
        const user = users[socket.id];
        if (!user) return;
        const channel = user.channel;
        if (!screenBroadcasters[channel]) screenBroadcasters[channel] = [];
        // Eğer o kullanıcı zaten listede yoksa ekle
        if (!screenBroadcasters[channel].find(u => u.id === socket.id)) {
            screenBroadcasters[channel].push({ id: socket.id, username: user.username });
        }
        broadcastScreenBroadcasters(channel);
    });

    // Yayın bitirme
    socket.on("stop-screen-share", () => {
        const user = users[socket.id];
        if (!user) return;
        const channel = user.channel;
        if (screenBroadcasters[channel]) {
            screenBroadcasters[channel] = screenBroadcasters[channel].filter(u => u.id !== socket.id);
            broadcastScreenBroadcasters(channel);
        }
    });

    // WebRTC sinyalleşme (yayın için)
    socket.on("webrtc-signal-screen", ({ to, data }) => {
        io.to(to).emit("webrtc-signal-screen", { from: socket.id, data });
    });

    // Sesli oda: WebRTC sinyalleşme
    socket.on("webrtc-signal", ({ to, data }) => {
        io.to(to).emit("webrtc-signal", { from: socket.id, data });
    });

    socket.on("get-users-in-voice", () => {
        const channel = users[socket.id]?.channel;
        broadcastVoiceUsers(channel);
    });

    socket.on("disconnect", () => {
        const user = users[socket.id];
        if (user) {
            io.to(user.channel).emit("user-list", getUsers(user.channel));
            const channel = user.channel;
            delete users[socket.id];
            broadcastVoiceUsers(channel);

            // Eğer yayıncılar listesinde varsa çıkar ve güncelle
            if (screenBroadcasters[channel]) {
                screenBroadcasters[channel] = screenBroadcasters[channel].filter(u => u.id !== socket.id);
                broadcastScreenBroadcasters(channel);
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log("Sunucu " + PORT + " portunda çalışıyor!");
});
