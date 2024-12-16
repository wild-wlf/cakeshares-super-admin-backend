const notificationHandler = require('./notificationHandler');
const serverStore = require('./socketStore');
const { CONVERSATION, MESSAGE } = global;

const updateChatHistory = async (conversationId, messageId, content, inChat) => {
  const tempMessage = await MESSAGE.findById(messageId).populate({ path: 'author._id', select: 'fullName username profilePicture' }).populate({ path: 'receiver._id', select: 'fullName username profilePicture type' }).lean();

  tempMessage.author = tempMessage.author._id;
  tempMessage.receiver = tempMessage.receiver._id;

  const conversation = await CONVERSATION.findOne({
    _id: conversationId,
    type: 'PERSONAL_CHAT',
  })
    .populate([
      {
        path: 'initBy._id',
      },
      {
        path: 'participants._id',
      },
      {
        path: 'type',
      },
    ])
    .select('-messages')
    .lean();

  conversation.initBy = conversation.initBy._id;
  conversation.participants = conversation.participants.map(_ => _._id);
  if (conversation) {
    const io = serverStore.getSocketServerInstance();
    conversation.participants.forEach(participant => {
      const activeConnections = serverStore.getActiveConnections(participant?._id.toString());
      activeConnections.forEach(socketId => {
        io.to(socketId).emit('direct-chat-history', {
          message: tempMessage,
          participants: conversation.participants.map(part => part?._id),
          conversationId: conversation?._id,
        });
      });
    });
  }
  if (!inChat) {
    let receiverData = tempMessage.receiver;
    await notificationHandler(conversation, receiverData, content, '', '', '');
  }
};

const sendSeenReceipt = async data => {
  const { message } = data;

  const currentMessage = await MESSAGE.findById(message?._id)
    .populate({ path: 'author._id', select: 'fullName username profilePicture' })
    .populate({ path: 'receiver._id', select: 'fullName username profilePicture' })
    .populate({ path: 'receivers._id', select: 'fullName username profilePicture' })
    .lean();

  currentMessage.author = currentMessage.author._id;
  currentMessage.receiver = currentMessage.receiver._id;

  if (currentMessage?.readBy?.length > 0) {
    currentMessage.readBy = currentMessage.readBy.map(_ => _._id);
  }

  if (currentMessage?.receivers?.length > 0) {
    currentMessage.receivers = currentMessage.receivers.map(_ => _._id);
  }

  const io = serverStore.getSocketServerInstance();
  const authorList = serverStore.getActiveConnections(currentMessage?.author?._id?.toString());

  authorList.forEach(authorId => {
    io.to(authorId).emit('seen-message-response', currentMessage);
  });
};

const updateSeenReceipt = async data => {
  const { conversationId, user, message, type } = data;

  await MESSAGE.findOneAndUpdate(
    { _id: message?._id?.toString(), conversationId: conversationId?.toString() },
    {
      $push: { readBy: { _id: user, model_type: type } },
    },
  );

  await sendSeenReceipt(data);
};

module.exports = {
  updateChatHistory,
  updateSeenReceipt,
};
