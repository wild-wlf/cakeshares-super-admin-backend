const mongoose = require('mongoose');
const { CONVERSATION } = global;

module.exports = async (userId, socket, action) => {
  const channels = await CONVERSATION.find({
    'participants._id': {
      $in: [new mongoose.Types.ObjectId(`${userId}`)],
    },
  });

  if (channels?.length > 0) {
    channels.forEach(channel => {
      if (action === 'join') {
        socket.join(channel.channelName);
      }

      if (action === 'leave') {
        socket.leave(channel.channelName);
      }
    });
  }
};
