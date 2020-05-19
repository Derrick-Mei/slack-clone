const express = require("express");
const app = express();
const socketio = require("socket.io");

// Objects of the Rooms and Namespaces
let namespaces = require("./data/namespaces");

// express is used to serve public files
app.use(express.static(__dirname + "/public"));
const expressServer = app.listen(process.env.PORT || 9000);
// have express listen to port 9000 and have io listen to express server
const io = socketio(expressServer);

io.on("connection", (socket) => {
  // build an array to send back with the img and endpoint for each NS
  let nsData = namespaces.map((ns) => {
    return {
      img: ns.img,
      endpoint: ns.endpoint,
    };
  });
  // socket (from cb) is used over io (from socketio) as we're sending data back
  //    to socket/client that connected and not all users
  socket.emit("nsList", nsData);
});

// loop through each namespace and listen for a connection
namespaces.forEach((namespace) => {
  io.of(namespace.endpoint).on("connection", (nsSocket) => {
    const username = nsSocket.handshake.query.username;
    // when a socket connects, send the rooms
    nsSocket.emit("nsRoomLoad", namespace.rooms);

    // update number of users in a room by joining and leaving a room
    nsSocket.on("joinRoom", (roomToJoin, numberOfUsersCallback) => {
      const roomToLeave = Object.keys(nsSocket.rooms)[1];
      nsSocket.leave(roomToLeave);
      updateUsersInRoom(namespace, roomToLeave);
      nsSocket.join(roomToJoin);

      // find room object
      const nsRoom = namespace.rooms.find((room) => {
        return room.roomTitle === roomToJoin;
      });
      // send history of messages to client
      nsSocket.emit("historyCatchUp", nsRoom.history);
      updateUsersInRoom(namespace, roomToJoin);
    });

    // when socket receives new message
    nsSocket.on("newMessageToServer", (msg) => {
      // craft msg with date, username, etc
      const fullMsg = {
        text: msg.text,
        time: Date.now(),
        username: username,
        avatar: "https://via.placeholder.com/30",
      };

      // the user will be in the 2nd room in nsSocket.rooms
      // this is because the socket ALWAYS joins its own room on connection
      const roomTitle = Object.keys(nsSocket.rooms)[1];
      const nsRoom = namespace.rooms.find((room) => {
        return room.roomTitle === roomTitle;
      });
      // add message to history
      nsRoom.addMessage(fullMsg);

      // send message to that namespace's room
      io.of(namespace.endpoint).to(roomTitle).emit("messageToClients", fullMsg);
    });
  });
})

function updateUsersInRoom(namespace, roomToJoin) {
  // Send back the number of users in this room to ALL sockets connected to this room
  io.of(namespace.endpoint)
    .in(roomToJoin)
    // in this namespace of this room, you can use clients method to
    // get client array aka number of clients
    .clients((error, clients) => {
      io.of(namespace.endpoint)
        .in(roomToJoin)
        // send update members event to all clients
        .emit("updateMembers", clients.length);
    });
}
