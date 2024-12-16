const connectedUsers = new Map();
let io = null;

const setSocketServerInstance = ioInstance => {
  io = ioInstance;
};

const getSocketServerInstance = () => io;

const addNewConnectedUser = ({ socketId, userId, type }) => {
  for (const [key, value] of connectedUsers.entries()) {
    if (value.id === userId) {
      connectedUsers.delete(key);
      break;
    }
  }
  connectedUsers.set(socketId, { id: userId, type });
};

const removeConnectedUser = socketId => {
  if (connectedUsers.has(socketId)) {
    connectedUsers.delete(socketId);
  }
};

const getOnlineUsers = () => {
  const onlineUsers = [];

  connectedUsers.forEach(value => {
    onlineUsers.push({ id: value?.id, type: value.type });
  });
  return onlineUsers;
};

const getActiveConnections = userId => {
  const activeConnections = [];

  connectedUsers.forEach((key, value) => {
    if (key.id === userId) {
      activeConnections.push(value);
    }
  });

  return activeConnections;
};

const getActiveUsers = userId => {
  let socketId = null;
  connectedUsers.forEach(value => {
    if (value.id === userId) {
      socketId = value;
    }
  });
  return socketId;
};

const getSocketIdByUserId = (userId) => {
  let socketId = null;
  connectedUsers.forEach((value, key) => {
    if (value.id === userId) {
      socketId = key; 
    }
  });
  return socketId;
};

module.exports = {
  setSocketServerInstance,
  getSocketServerInstance,
  addNewConnectedUser,
  removeConnectedUser,
  getOnlineUsers,
  getActiveConnections,
  getActiveUsers,
  getSocketIdByUserId
};
