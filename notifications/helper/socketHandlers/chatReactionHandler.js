const { MESSAGE } = global;
const serverStore = require('./socketStore');

const privateReaction = async data => {
  try {
    const { reaction, messageId, receiverId, senderId } = data;
    await MESSAGE.findOneAndUpdate({ _id: messageId }, { $set: { reaction } });
    const io = serverStore.getSocketServerInstance();

    const findSender = serverStore.getActiveConnections(senderId);
    io.to(findSender[0]).emit('reaction-added', {
      reaction,
      messageId,
    });

    const findAuthor = serverStore.getActiveConnections(receiverId);
    io.to(findAuthor[0]).emit('reaction-added', {
      reaction,
      messageId,
    });
  } catch (error) {
    console.log(error);
  }
};

const groupReaction = async data => {
  try {
    const { reaction, messageId, senderId, channelName } = data;

    const reactionAvailable = await MESSAGE.findOne({ _id: messageId, 'reactions.senderId._id': senderId._id });
    let message;
    if (reactionAvailable) {
      message = await MESSAGE.findOneAndUpdate({ _id: messageId, 'reactions.senderId._id': senderId._id }, { $set: { 'reactions.$.reaction': reaction } }, { new: true });
    } else {
      message = await MESSAGE.findOneAndUpdate({ _id: messageId }, { $push: { reactions: { reaction, senderId } } }, { new: true });
    }
    const io = serverStore.getSocketServerInstance();

    io.to(channelName).emit('added-group-reaction', { reactions: message.reactions, messageId });
  } catch (error) {
    console.log(error);
  }
};

module.exports = { privateReaction, groupReaction };
