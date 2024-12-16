const { CONVERSATION, MESSAGE } = global;
const chatUpdates = require('./updateChats');

const directMessageHandler = async (data,inChat) => {
  try {
    const { receiver, content, author } = data;

    let conversation = await CONVERSATION.findOne({
      participants: {
        $all: [
          { _id: author, model_type: 'user' },
          { _id: receiver, model_type: 'user' },
        ],
      },
      type: 'PERSONAL_CHAT',
    });

    if (!conversation) {
      conversation = await CONVERSATION.create({
        participants: [
          { _id: author, model_type: 'user' },
          { _id: receiver, model_type: 'user' },
        ],
        initBy: { _id: author, model_type: 'user' },
        type: 'PERSONAL_CHAT',
      });
    }

    const message = await MESSAGE.create({
      content,
      author: { _id: author, model_type: 'user' },
      type: 'DIRECT_MESSAGE',
      receiver: { _id: receiver, model_type: 'user' },
      conversationId: conversation?._id,
    });

    conversation.messages.push(message?._id);

    await conversation.save();
    chatUpdates.updateChatHistory(conversation._id.toString(), message?._id, content,inChat);
  } catch (err) {
    console.log(err);
  }
};

module.exports = directMessageHandler;
