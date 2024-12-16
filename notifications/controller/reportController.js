const { MESSAGE, MESSAGE_REPORT, USER, ADMIN, USER_JWT, ADMIN_JWT } = global;
const mongoose = require('mongoose');
const { filterQuery, pagination, createNotification } = require('../helper');
const { getSocketServerInstance, getSocketIdByUserId, getOnlineUsers, removeConnectedUser } = require('../helper/socketHandlers/socketStore');
const { disconnectHandler } = require('../helper/socketHandlers/disconnectHandler');
const toggleRooms = require('../helper/socketHandlers/toggleRooms');

exports.reportMessage = async (req, res) => {
  const { messageId, conversationId, reportedBy, reason, details } = req.body;
  const name = req.owner?.username || req.owner?.fullName;

  const reportedMessage = await MESSAGE.findById(messageId).select('content author').populate({ path: 'author._id', select: 'email' }).lean();

  if (!reportedMessage) {
    return res.status(404).json({ error: 'Reported message not found' });
  }

  const previousMessages = await MESSAGE.find({
    conversationId: conversationId,
    _id: { $lt: new mongoose.Types.ObjectId(messageId) },
  })
    .limit(10)
    .select('content author')
    .populate({ path: 'author._id', select: 'email' })
    .lean();

  const messageContext = [...previousMessages, reportedMessage].map(msg => ({
    content: msg.content,
    email: msg.author && msg.author._id ? msg.author._id.email : null,
  }));

  await MESSAGE_REPORT.create({
    messageId,
    conversationId,
    reportedBy,
    reason,
    details,
    messageContext,
  });

  const notificationData = {
    actionType: 'message_reported',
    title: 'New Message Reported',
    message: [`A message has been reported for ${reason} by ${name}. Reported Message: ${reportedMessage?.content}`],
  };

  await createNotification([], notificationData, ['SUPER_ADMIN'], {
    adminNotification: true,
  });

  res.status(200).json({ message: 'Report created successfully', success: true });
};
exports.getAllReportedMessages = async (req, res) => {
  // eslint-disable-next-line prefer-const
  let { page, itemsPerPage, startDate, endDate, searchText } = {
    ...req.query,
    ...filterQuery(req),
  };
  let query = {};

  if (searchText) {
    query.$or = [{ fullName: { $regex: new RegExp(searchText, 'i') } }, { username: { $regex: new RegExp(searchText, 'i') } }, { email: { $regex: new RegExp(searchText, 'i') } }];
  }

  const totalItems = await MESSAGE_REPORT.countDocuments(query);
  if (req.query.getAll === 'true') {
    page = 1;
    itemsPerPage = totalItems;
  }

  let messageReports = await MESSAGE_REPORT.find(query)
    .populate({ path: 'reportedBy._id', select: 'username fullName email -_id' })
    .populate({
      path: 'messageId',
      model: MESSAGE,
      select: 'author content _id',
      populate: {
        path: 'author._id',
        select: 'username fullName email',
      },
    })
    .skip((page - 1) * itemsPerPage)
    .limit(itemsPerPage)
    .sort({ updated_at: -1 })
    .lean();
  messageReports = messageReports.map(({ reportedBy, messageId, ...rest }) => {
    return { reportedBy: reportedBy._id, messageId: { _id: messageId._id, author: messageId.author._id, content: messageId.content }, ...rest };
  });

  return res.status(200).json({
    success: true,
    message: 'Messages report Retrieved Successfully!',
    ...pagination(messageReports, +page, totalItems, +itemsPerPage),
  });
};

exports.getAllMessages = async (req, res) => {
  let { page = 1, itemsPerPage = 10, conversationId } = req.query;

  if (!conversationId) {
    return res.status(400).json({ error: 'conversationId is required' });
  }

  const totalItems = await MESSAGE.countDocuments({ conversationId });
  let messages = await MESSAGE.find({ conversationId })
    .populate({ path: 'author._id' })
    .limit(itemsPerPage)
    .sort({ updated_at: -1 })
    .skip((page - 1) * itemsPerPage)
    .lean();

  messages = messages.map(({ author, ...rest }) => {
    return { author: { _id: author?._id, model_type: author?.model_type, content: author?.content }, ...rest };
  });

  return res.status(200).json(pagination(messages, page, totalItems, itemsPerPage));
};

exports.deleteMessage = async (req, res) => {
  const { id } = req.params;
  const isMessageExists = await MESSAGE.findOne({ _id: id }).populate({ path: 'author._id', model: USER, select: 'type' });

  if (!isMessageExists) {
    return res.status(404).json({ success: false, message: 'Message Id is Missing or Invalid!' });
  }

  const reportedMessage = await MESSAGE_REPORT.findOne({ messageId: id }).populate({ path: 'messageId', model: MESSAGE, select: 'content' });

  await MESSAGE.findByIdAndDelete(id);

  const notificationData = {
    actionType: `message_deleted`,
    title: `Message Deleted!`,
    message: [
      `One of your messages has been deleted for ${
        reportedMessage?.details
          ? reportedMessage.details
          : reportedMessage?.reason
            ? reportedMessage.reason
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
            : 'an unspecified reason'
      }. Content: ${reportedMessage?.messageId?.content || 'Content not available.'}`,
    ],
  };

  await createNotification([isMessageExists?.author?._id?._id], notificationData, [], {
    [`${isMessageExists.author._id.type.toLowerCase()}Notification`]: true,
  });

  return res.status(200).json({ success: true, message: 'Message Deleted Successfully!' });
};

exports.blockUser = async (req, res) => {
  const adminId = req.owner?._id;
  const { id } = req.params;
  const { reportMessageId, messageUserType } = req.body;

  if (!reportMessageId) {
    return res.status(400).json({ success: false, message: 'Report message ID is required.' });
  }

  const userModel = messageUserType === 'user' ? USER : ADMIN;
  const existingUser = await userModel.findById(id);

  if (!existingUser) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  existingUser.status = 'Suspended';
  await existingUser.save();

  if (messageUserType === 'user') {
    await USER_JWT.updateOne({ user_id: id }, { $unset: { token: '' } });
  } else {
    await ADMIN_JWT.updateOne({ admin_id: id }, { $unset: { token: '' } });
  }

  const existingReport = await MESSAGE_REPORT.findById(reportMessageId);

  if (!existingReport) {
    return res.status(404).json({ success: false, message: 'Report message not found.' });
  }

  existingReport.actionTaken = 'temporary_suspension';
  existingReport.actionTakenBy = adminId;
  await existingReport.save();

  const io = getSocketServerInstance();
  let socketId = getSocketIdByUserId(id);
  if (socketId) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      await io.to(socketId).emit('logout-user', {
        title: 'Session Expired',
        message: 'You have been logged out due to a suspension. Please contact support if you believe this is a mistake.',
      });

      await socket.disconnect(true);
      removeConnectedUser(socketId);
      await toggleRooms(id, socket, 'leave');
    }
  }

  return res.status(200).json({ success: true, message: 'User blocked successfully!' });
};

exports.requestMessage = async (req, res) => {
  const { details } = req.body;
  const name = req.owner?.username || req.owner?.fullName;

  const notificationData = {
    actionType: 'unblock_request',
    title: 'Account Unblock Request Received',
    message: [`You have received a request to unblock an account from ${name}. Here are the details of the request: ${details}`],
  };

  await createNotification([], notificationData, ['SUPER_ADMIN'], {
    adminNotification: true,
  });

  res.status(200).json({ message: 'Report created successfully', success: true });
};
