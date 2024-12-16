const { addNewConnectedUser } = require('./socketStore.js');

const newConnectionHandler = async socket => {
  const user = socket.user;
  addNewConnectedUser({
    socketId: socket.id,
    userId: user?.id,
    type: user?.type,
  });
};

module.exports = { newConnectionHandler };
