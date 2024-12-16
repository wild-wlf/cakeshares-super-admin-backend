const { removeConnectedUser } = require('./socketStore.js');

const disconnectHandler = async socket => {
  removeConnectedUser(socket.id);
};

module.exports = { disconnectHandler };
