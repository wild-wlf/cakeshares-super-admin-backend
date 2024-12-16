const { Server } = require('socket.io');
const { setSocketServerInstance, getOnlineUsers } = require('./socketHandlers/socketStore.js');
const { socketAuth } = require('./socketHandlers/socketAuth.js');
const { disconnectHandler } = require('./socketHandlers/disconnectHandler.js');
const { newConnectionHandler } = require('./socketHandlers/newConnectionHandler.js');
const directMessageHandler = require('./socketHandlers/directMessageHandler.js');
const { updateSeenReceipt } = require('./socketHandlers/updateChats.js');
const { updateComMsgHistory, updateComSeenMsg, castPoolVote, clearPoolVotes } = require('./socketHandlers/communityMsgHandler.js');
const toggleRooms = require('./socketHandlers/toggleRooms.js');
const { privateReaction, groupReaction } = require('./socketHandlers/chatReactionHandler.js');

const registerSocketServer = (server, allowedOrigins) => {
  const io = new Server(server, {
    path: '/websocket',
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH'],
    },
  });

  let activeChats = {};

  let groupChats = {};

  setSocketServerInstance(io);

  io.use((socket, next) => {
    socketAuth(socket, next);
  });

  const emitOnlineUsers = () => {
    const onlineUsers = getOnlineUsers();
    io.emit('online-users', { onlineUsers });
  };

  io.on('connection', socket => {
    console.log('A client connected:', socket.id);
    newConnectionHandler(socket, io);
    emitOnlineUsers();
    toggleRooms(socket?.user?.id, socket, 'join');

    // One-to-one chat
    socket.on('startChat', data => {
      console.log('startChat');
      const { author, receiver } = data;
      activeChats[author] = receiver;
      //activeChats[receiver] = author;
    });

    socket.on('endChat', data => {
      const { author, receiver } = data;
      if (activeChats[author] === receiver) {
        delete activeChats[author];
      }
    });

    socket.on('direct-message', data => {
      const { author, receiver } = data;
      const recipientChatPartner = activeChats[receiver];

      let inChat = false;
      if (recipientChatPartner !== author) {
        console.log('Send notification');
        inChat = false;
      } else {
        console.log('Both users are in the chat');
        inChat = true;
      }

      directMessageHandler(data, inChat);
    });

    socket.on('group-reaction', data => {
      groupReaction(data);
    });

    socket.on('private-reaction', data => {
      privateReaction(data);
    });

    socket.on('get-seen-message', data => {
      updateSeenReceipt(data);
    });

    socket.on('send-com-msg', data => {
      const { channelName, author } = data;

      let inGroupsChat = [];
      if (channelName) {
        const group = groupChats[channelName];
        if (group && group instanceof Set) {
          const groupUsers = Array.from(group);
          inGroupsChat = groupUsers?.filter(id => id !== author);
          console.log('Receivers in the group chat:', inGroupsChat, group);
        }
      }

      updateComMsgHistory(data, socket, inGroupsChat);
    });

    // Handle user joining a group chat
    socket.on('joinGroupChat', ({ userId, groupId }) => {
      console.log('join chat', userId, groupId);
      if (!groupChats[groupId]) {
        groupChats[groupId] = new Set();
      }
      groupChats[groupId].add(userId);
    });

    // Handle user leaving a group chat
    socket.on('leaveGroupChat', ({ userId, groupId }) => {
      console.log('lev chat', userId, groupId);
      if (groupChats[groupId]) {
        groupChats[groupId].delete(userId);
        if (groupChats[groupId].size === 0) {
          delete groupChats[groupId];
        }
      }
    });

    socket.on('send-com-seen-msg', data => {
      updateComSeenMsg(data, socket);
    });

    socket.on('cast-pool-vote', data => {
      castPoolVote(data, socket);
    });

    socket.on('clear-pool-votes', data => {
      clearPoolVotes(data, socket);
    });

    socket.on('joinRoom', data => {
      socket.join(data?.room_id);
    });

    socket.on('disconnect', reason => {
      console.log('A client disconnected:', socket.id, 'Reason:', reason);
      disconnectHandler(socket);
      toggleRooms(socket.user?.id, socket, 'leave');

      //one to one chat
      for (const [author, receiver] of Object.entries(activeChats)) {
        if (author === socket.id || receiver === socket.id) {
          delete activeChats[author];
          delete activeChats[receiver];
        }
      }

      // Remove user from groupChats for group chats
      for (const groupId in groupChats) {
        if (groupChats.hasOwnProperty(groupId)) {
          if (groupChats[groupId].has(socket.user?.id)) {
            groupChats[groupId].delete(socket.user?.id);
            if (groupChats[groupId].size === 0) {
              delete groupChats[groupId];
            }
          }
        }
      }
    });
  });

  setInterval(() => {
    emitOnlineUsers();
  }, 1000 * 8);
};

module.exports = { registerSocketServer };
