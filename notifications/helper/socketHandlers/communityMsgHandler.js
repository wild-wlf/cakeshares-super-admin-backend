const { CONVERSATION, MESSAGE, ADMIN, ROLE } = global;
const serverStore = require('./socketStore');
const { removeSpaces } = require('../index');
const notificationHandler = require('./notificationHandler');

const getAdmins = async () => {
  const role_id = await ROLE.findOne({ type: 'SUPER_ADMIN' }).select('_id');

  let admins = await ADMIN.find({ roles: { $in: [role_id._id] } }).select('_id');
  admins = admins.map(_ => ({ _id: _?._id?.toString(), model_type: 'admin' }));

  return admins;
};

exports.updateComMsgHistory = async (data, socket, inGroupsChat) => {
  const { productName, productId, author, content, productOwnerId, conversationId, pool, type, user_type } = data;
  let conversation;
  const io = serverStore.getSocketServerInstance();

  if (conversationId && conversationId !== '') {
    conversation = await CONVERSATION.findById(conversationId);
  }

  if (!conversationId) {
    const channelName = `${type === 'community' ? 'com' : 'stake'}_${removeSpaces(productName)}_${productId}`;
    conversation = await CONVERSATION.findOne({ channelName, type: type === 'community' ? 'COM_CHAT' : 'STAKE_CHAT' });

    socket.join(channelName);

    if (!conversation) {
      const admins = await getAdmins();
      conversation = await CONVERSATION.create({
        channelName,
        type: type === 'community' ? 'COM_CHAT' : 'STAKE_CHAT',
        participants: [{ _id: productOwnerId, model_type: 'user' }, { _id: author, model_type: 'user' }, ...admins],
        initBy: { _id: author, model_type: 'user' },
        productName,
      });

      [productOwnerId, ...admins.map(_ => _._id)].forEach(member => {
        const activeConnections = serverStore.getActiveConnections(member);

        activeConnections?.forEach(socketId => {
          io.to(socketId).emit('join-channel-room', { room_id: channelName });
        });
      });
    }

    if (!conversation?.participants?.find(_ => _?._id?.toString() === author?.toString())) {
      conversation?.participants?.push({ _id: author, model_type: user_type });
    }
  }

  const msg = {
    author: { _id: author, model_type: user_type },
    type: `${type === 'community' ? 'COM' : 'STAKE'}_CHAT_MESSAGE`,
    receivers: conversation?.participants?.filter(_ => _?._id?.toString() !== author?.toString()),
    conversationId: conversation?._id,
  };

  if (content && content !== '') {
    msg.content = content;
  }

  if (pool && pool?.question && pool?.options?.length > 0) {
    msg.pool = pool;
    msg.isPool = true;
  }

  const message = await MESSAGE.create(msg);

  conversation.messages.push(message?._id);
  await conversation.save();

  const currentMessage = await MESSAGE.findById(message?._id).populate({ path: 'author._id', select: 'username fullName profilePicture type' }).populate({ path: 'receivers._id', select: 'username fullName profilePicture type' }).lean();

  currentMessage.author = currentMessage.author._id;
  currentMessage.receivers = currentMessage.receivers.map(_ => _._id);

  let receivers = currentMessage.receivers;
  await notificationHandler(conversation, '', '', inGroupsChat, data, receivers);

  io.to(conversation?.channelName).emit('com-message-history', { channelName: conversation?.channelName, message: currentMessage, participants: conversation?.participants?.map(_ => _._id), conversationId: conversation?._id });
};

const sendSeenReceipt = async data => {
  const { messageId } = data;

  const currentMessage = await MESSAGE.findById(messageId)
    .populate({
      path: 'author._id',
    })
    .populate({
      path: 'receivers._id',
    })
    .populate({
      path: 'conversationId',
      model: CONVERSATION,
      select: 'channelName',
    })
    .lean();

  currentMessage.author = currentMessage.author._id;
  currentMessage.receivers = currentMessage.receivers.map(_ => _._id);

  const io = serverStore.getSocketServerInstance();

  io.to(currentMessage?.conversationId?.channelName).emit('seen-message-response', currentMessage);
};

exports.updateComSeenMsg = async data => {
  const { conversationId, user, messageId, type } = data;

  await MESSAGE.findOneAndUpdate(
    { _id: messageId?.toString(), conversationId: conversationId?.toString(), 'readBy._id': { $nin: [user] } },
    {
      $push: { readBy: { _id: user, model_type: type } },
    },
  );

  await sendSeenReceipt(data);
};

exports.castPoolVote = async data => {
  const { option_id, msg_id, user_id, checked, allow_multiple, type, isAnonymous } = data;

  const action = checked ? '$addToSet' : '$pull';

  if (!allow_multiple) {
    await MESSAGE.findByIdAndUpdate(msg_id, { $pull: { 'pool.options.$[].users': { _id: user_id } } });
  }

  await MESSAGE.findOneAndUpdate({ _id: msg_id, 'pool.options._id': option_id }, { [action]: { 'pool.options.$.users': { _id: user_id, model_type: type, isAnonymous } } });

  const currentMessage = await MESSAGE.findById(msg_id)
    .select({ pool: 1 })
    .populate({
      path: 'conversationId',
      model: CONVERSATION,
      select: 'channelName',
    })
    .populate({
      path: 'pool.options.users._id',
      select: 'username email fullName profilePicture type',
    })
    .lean();

  const io = serverStore.getSocketServerInstance();

  io.to(currentMessage?.conversationId?.channelName).emit('pool-response', currentMessage);
};

exports.clearPoolVotes = async data => {
  const { msg_id, user_id } = data;

  await MESSAGE.findByIdAndUpdate(msg_id, { $pull: { 'pool.options.$[].users': { _id: user_id } } });

  const currentMessage = await MESSAGE.findById(msg_id)
    .select({ pool: 1 })
    .populate({
      path: 'conversationId',
      model: CONVERSATION,
      select: 'channelName',
    })
    .lean();

  currentMessage.pool.options = currentMessage.pool.options.map(({ users, ...rest }) => {
    return { ...rest, users: users?.map(_ => _?._id) };
  });

  const io = serverStore.getSocketServerInstance();

  io.to(currentMessage?.conversationId?.channelName).emit('pool-response', currentMessage);
};
