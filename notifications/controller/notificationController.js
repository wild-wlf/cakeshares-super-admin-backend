const { NOTIFICATION, CONVERSATION, MESSAGE, USER } = global;
const { pagination, filterParticipants, filterProducts } = require('../helper');
const { getSocketServerInstance } = require('../helper/socketHandlers/socketStore');
const mongoose = require('mongoose');

exports.createNotification = async (req, res) => {
  const { recipientId, recipientType, actionType, message } = req.body;

  if (!recipientId && !recipientType && !actionType && !message) {
    return res.status(400).json({ success: false, message: 'Payload Error' });
  }

  await NOTIFICATION.create({ recipientId, recipientType, actionType, message });

  return res.status(200).json({ success: true, message: 'Notification Created' });
};

exports.getAllNotifications = async (req, res) => {
  const { page = 1, itemsPerPage = 20 } = req.query;

  const recipientId = req.owner._id;

  if (!recipientId) {
    return res.status(400).json({ success: false, message: 'Payload Error' });
  }

  const totalItems = await NOTIFICATION.countDocuments({ recipientId });
  const notifications = await NOTIFICATION.find({ recipientId }).sort({ created_at: -1 });

  const record = pagination(notifications, page, totalItems, itemsPerPage);

  return res.status(200).json({ success: true, message: 'Notifications', data: { ...record } });
};

exports.readAllNotification = async (req, res) => {
  const recipientId = req.owner._id;

  if (!recipientId) {
    return res.status(400).json({ success: false, message: 'Payload Error' });
  }

  await NOTIFICATION.updateMany({ recipientId }, { $set: { isRead: true } });

  return res.status(200).json({ success: true, message: 'Notifications' });
};

exports.sendSocketNotification = async (req, res) => {
  const io = getSocketServerInstance();

  io.emit(req.body.event, req.body.data);

  return res.status(200).json({ success: true, message: 'Notification Send' });
};

exports.getAllConversations = async (req, res) => {
  let { page = 1, itemsPerPage = 10, type, searchText } = req.query;
  const { _id } = req.owner;
  page = parseInt(page);
  itemsPerPage = parseInt(itemsPerPage);
  const msgType = type === 'PERSONAL_CHAT' ? 'DIRECT_MESSAGE' : type === 'COM_CHAT' ? 'COM_CHAT_MESSAGE' : type === 'STAKE_CHAT' ? 'STAKE_CHAT_MESSAGE' : '';

  const query = {
    $and: [
      {
        participants: {
          $elemMatch: { _id: new mongoose.Types.ObjectId(_id) },
        },
        type,
      },
    ],
  };

  searchText = searchText && searchText !== 'undefined' && searchText !== 'null' ? searchText : '';
  let searchedParticipants = [],
    searchedProducts = [];

  if (searchText) {
    searchedParticipants = await filterParticipants(searchText);
    searchedProducts = await filterProducts(searchText);

    if (searchedParticipants.length > 0 || searchedProducts?.length > 0) {
      query.$and.push({
        $or: [
          {
            participants: {
              $elemMatch: { _id: { $in: searchedParticipants } },
            },
          },
          {
            channelName: {
              $regex: new RegExp(searchedProducts.join('|'), 'i'),
            },
          },
        ],
      });
    } else {
      query.$and.push({ _id: { $eq: null } });
    }
  }

  const result = await CONVERSATION.aggregate([
    {
      $match: query,
    },
    // look for participants in the user collection
    {
      $lookup: {
        from: 'user',
        let: { participants: '$participants' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$participants._id'] },
            },
          },
          {
            $project: {
              fullName: 1,
              profilePicture: 1,
              _id: 1,
              username: 1,
              email: 1,
              type: 1,
            },
          },
        ],
        as: 'userParticipants',
      },
    },
    // look for participants in the admin collection
    {
      $lookup: {
        from: 'admin',
        let: { participants: '$participants' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$participants._id'] },
            },
          },
          {
            $project: {
              fullName: 1,
              profilePicture: 1,
              _id: 1,
              email: 1,
              type: 1,
            },
          },
        ],
        as: 'adminParticipants',
      },
    },
    {
      $addFields: {
        participants: { $concatArrays: ['$userParticipants', '$adminParticipants'] },
      },
    },
    // Lookup last message for each conversation
    {
      $lookup: {
        from: 'message',
        let: { conversationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$conversationId', '$$conversationId'] }, { $eq: ['$type', msgType] }],
              },
            },
          },
          { $sort: { created_at: -1 } },
          { $limit: 1 },
        ],
        as: 'lastMessage',
      },
    },
    {
      $addFields: {
        lastMessage: { $arrayElemAt: ['$lastMessage', 0] },
      },
    },
    // Lookup unread messages for each conversation
    {
      $lookup: {
        from: 'message',
        let: { conversationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$conversationId', '$$conversationId'] },
                  { $not: { $in: [new mongoose.Types.ObjectId(_id), '$readBy._id'] } },
                  { $eq: ['$type', msgType] },
                  type === 'PERSONAL_CHAT' ? { $eq: ['$receiver._id', new mongoose.Types.ObjectId(_id)] } : { $in: [new mongoose.Types.ObjectId(_id), '$receivers._id'] },
                ],
              },
            },
          },
          {
            $count: 'unreadCount',
          },
        ],
        as: 'unreadMessages',
      },
    },
    // Add unreadCount field to each conversation
    {
      $addFields: {
        unreadCount: {
          $ifNull: [{ $arrayElemAt: ['$unreadMessages.unreadCount', 0] }, 0],
        },
      },
    },
    // Project only the required fields
    {
      $project: {
        _id: 1,
        participants: 1,
        initBy: 1,
        created_at: 1,
        updated_at: 1,
        unreadCount: 1,
        lastMessage: 1,
        productName: 1,
        __v: 1,
      },
    },
    // Sort conversations in descending order based on updated_at field
    { $sort: { updated_at: -1 } },
    // Pagination
    {
      $facet: {
        conversations: [{ $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage }],
      },
    },
  ]);

  const conversations = result[0]?.conversations;

  const totalItems = await CONVERSATION.countDocuments({
    'participants._id': {
      $in: [_id],
    },
    type,
  });

  return res.status(200).json(pagination(conversations, page, totalItems, itemsPerPage));
};

exports.getUnreadMessagesCount = async (req, res) => {
  const { _id } = req.owner; // User ID

  const result = await CONVERSATION.aggregate([
    {
      $match: {
        participants: {
          $elemMatch: { _id: new mongoose.Types.ObjectId(_id) },
        },
      },
    },
    {
      $lookup: {
        from: 'message',
        let: { conversationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$conversationId', '$$conversationId'] },
                  { $not: { $in: [new mongoose.Types.ObjectId(_id), '$readBy._id'] } },
                  {
                    $or: [{ $eq: ['$type', 'DIRECT_MESSAGE'] }, { $eq: ['$type', 'COM_CHAT_MESSAGE'] }, { $eq: ['$type', 'STAKE_CHAT_MESSAGE'] }],
                  },
                  {
                    $or: [{ $and: [{ $eq: ['$type', 'DIRECT_MESSAGE'] }, { $eq: ['$receiver._id', new mongoose.Types.ObjectId(_id)] }] }, { $and: [{ $ne: ['$type', 'DIRECT_MESSAGE'] }, { $in: [new mongoose.Types.ObjectId(_id), '$receivers._id'] }] }],
                  },
                ],
              },
            },
          },
          {
            $count: 'unreadCount',
          },
        ],
        as: 'unreadMessages',
      },
    },
    {
      $addFields: {
        hasUnreadMessages: {
          $gt: [{ $arrayElemAt: ['$unreadMessages.unreadCount', 0] }, 0],
        },
      },
    },
    {
      $project: {
        _id: 0,
        conversationType: '$type',
        hasUnreadMessages: 1,
      },
    },
    {
      $group: {
        _id: '$conversationType',
        hasUnreadMessages: { $max: '$hasUnreadMessages' },
      },
    },
  ]);

  const response = {
    COM_CHAT: false,
    STAKE_CHAT: false,
    PERSONAL_CHAT: false,
  };

  result.forEach(({ _id: conversationType, hasUnreadMessages }) => {
    if (response.hasOwnProperty(conversationType)) {
      response[conversationType] = hasUnreadMessages;
    }
  });

  return res.status(200).json(response);
};

// get direct chat messages
exports.getConversationMessages = async (req, res) => {
  let { page = 1, itemsPerPage = 10 } = req.query;
  let { author, receiver, conversationId } = req.query;
  const { _id } = req.owner;
  page = parseInt(page);
  itemsPerPage = parseInt(itemsPerPage);

  if (!author && !receiver && !conversationId) {
    throw {
      code: 404,
      success: false,
      message: 'none of the ids are given',
    };
  }

  if (!conversationId) {
    conversationId = await CONVERSATION.findOne({
      participants: {
        $all: [
          { _id: author, model_type: 'user' },
          { _id: receiver, model_type: 'user' },
        ],
      },
      type: 'PERSONAL_CHAT',
    });

    conversationId = conversationId?._id?.toString();
  }

  await MESSAGE.updateMany(
    { conversationId, 'receiver._id': _id.toString(), type: 'DIRECT_MESSAGE', 'readBy._id': { $nin: [_id] } },
    {
      $push: { readBy: { _id, model_type: 'user' } },
    },
  );

  let messages = await MESSAGE.find({ conversationId, type: 'DIRECT_MESSAGE' })
    .populate({
      path: 'author._id',
      select: 'username email fullName profilePicture',
    })
    .populate({
      path: 'receiver',
      select: 'username email fullName profilePicture',
    })
    .sort([['created_at', -1]])
    .skip((page - 1) * itemsPerPage)
    .limit(itemsPerPage)
    .lean();

  const totalItems = await MESSAGE.countDocuments({ conversationId, type: 'DIRECT_MESSAGE' });

  if (messages?.length > 0) {
    messages = messages.map(({ author, receiver, ...rest }) => {
      return { ...rest, author: author._id, receiver: receiver._id };
    });
    messages = messages?.reverse();
  }

  return res.status(200).json(pagination(messages, page, totalItems, itemsPerPage));
};

// community chat controllers
exports.getCommunityConversationMessages = async (req, res) => {
  let { page = 1, itemsPerPage = 10, conversationId, channelName, type } = req.query;

  const { _id } = req.owner;
  const { isAdmin, isUser } = req;

  page = parseInt(page);
  itemsPerPage = parseInt(itemsPerPage);

  const conType = type === 'community' ? 'COM_CHAT' : 'STAKE_CHAT';
  const msgType = `${type === 'community' ? 'COM' : 'STAKE'}_CHAT_MESSAGE`;

  if (!conversationId) {
    conversationId = await CONVERSATION.findOne({
      channelName,
      type: conType,
    });

    conversationId = conversationId?._id?.toString();
  }

  await MESSAGE.updateMany(
    { conversationId, 'receivers._id': { $in: [_id] }, type: msgType, 'readBy._id': { $nin: [_id] } },
    {
      $push: { readBy: { _id, model_type: isAdmin ? 'admin' : isUser ? 'user' : '' } },
    },
  );

  let messages = await MESSAGE.find({ conversationId, type: msgType })
    .populate({
      path: 'author._id',
      select: 'username email fullName profilePicture type',
    })
    .populate({
      path: 'receivers._id',
      select: 'username email fullName profilePicture type',
    })
    .populate({
      path: 'pool.options.users._id',
      select: 'username email fullName profilePicture type',
    })
    .populate({
      path: 'conversationId',
      model: CONVERSATION,
      select: 'channelName',
    })
    .sort([['created_at', -1]])
    .skip((page - 1) * itemsPerPage)
    .limit(itemsPerPage)
    .lean();

  const totalItems = await MESSAGE.countDocuments({ conversationId, type: msgType });

  if (messages?.length > 0) {
    messages = messages.map(({ author, receivers, ...rest }) => {
      return { ...rest, author: author._id, receivers: receivers?.map(_ => _._id) };
    });
    messages = messages?.reverse();
  }

  return res.status(200).json(pagination(messages, page, totalItems, itemsPerPage));
};

exports.getMessageReactions = async (req, res) => {
  const { messageId } = req.query;

  let reactionData = await MESSAGE.findById(messageId).populate({
    path: 'reactions.senderId._id',
    select: 'username email fullName profilePicture type -_id',
  });

  return res.status(200).json({ reactionData: reactionData?.reactions });
};
