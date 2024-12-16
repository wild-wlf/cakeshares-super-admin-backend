const { verifyToken } = require('../../middleware');

const socketAuth = async (socket, next) => {
  try {
    const token = socket?.handshake?.auth?.token;
    const type = socket?.handshake?.auth?.type;

    if (!token) {
      const socketError = new Error('NOT_AUTHORIZED: Token is missing');
      return next(socketError);
    }

    const userData = await verifyToken(token);
    
    if (!userData) {
      const socketError = new Error('NOT_AUTHORIZED: Invalid token');
      return next(socketError);
    }

    userData.type = type;
    socket.user = userData;
  } catch (error) {
    const socketError = new Error('NOT_AUTHORIZED: Authentication failed');
    return next(socketError);
  }
  
  next();
};

module.exports = { socketAuth };
