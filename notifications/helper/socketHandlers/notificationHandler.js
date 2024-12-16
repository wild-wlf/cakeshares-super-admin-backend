const { createNotification, sendSocketNotification } = require('../index');
const serverStore = require('./socketStore');
const notificationHandler = async (conversation, receiverData, content, inGroupsChat, data, receivers) => {
    try {
    let filteredReceivers;
    const io = serverStore.getSocketServerInstance();

    if (data.type === 'stake' || data.type === 'community') {
      if (inGroupsChat.length === 0) {
        filteredReceivers = receivers;
      } else {
        filteredReceivers = receivers?.filter(receiver => !inGroupsChat?.includes(receiver?._id.toString()));
      }

      for (const receiver of filteredReceivers) {
        console.log(`Creating notification for receiver: ${receiver.fullName}`, receiver.type);
        const isReceiverActive = serverStore.getActiveUsers(receiver._id.toString());

        let obj = {
          recipientId: receiver._id,
          // recipientType: receiver.type === 'Buyer' ? 'buyer' : receiver.type === 'Seller' ? 'seller' : 'admin',
          actionType: conversation.type,
          title: getTitleForConversationType(conversation.type),
          message: [data?.pool ? `A Poll is Created in the Chat ${data?.productName} !` : `A Message is Created in the Chat ${data?.content} !`],
        };

        await createAndEmitNotification(obj, isReceiverActive, receiver.type, io);
      }
    } else {
      const isReceiverActive = serverStore.getActiveUsers(receiverData._id.toString());
      let obj = {
        recipientId: receiverData?._id.toString(),
        recipientType: receiverData?.type === 'Seller' ? 'seller' : 'buyer',
        actionType: conversation?.type,
        title: getTitleForConversationType(conversation?.type),
        // message: [content],
        message: [`You have received a message in Private Chat ${receiverData?.type === 'Buyer' ? `from ${receiverData?.fullName || receiverData?.username}` : ''}. Content: ${content}`],
      };

      await createAndEmitNotification(obj, isReceiverActive, receiverData.type, io);
    }
  } catch (error) {
    //   console.error('Error in notificationHandler:', error);
  }
};

const getTitleForConversationType = type => {
  switch (type) {
    case 'PERSONAL_CHAT':
      return 'Personal message';
    case 'COM_CHAT':
      return 'Community message';
    case 'STAKE_CHAT':
      return 'Investor message';
    default:
      return '';
  }
};

const createAndEmitNotification = async (obj, isReceiverActive, receiverType, io) => {
  try {
    await createNotification([obj?.recipientId], obj, [], {
      [`${receiverType ? receiverType.toLowerCase() : 'admin'}Notification`]: true,
    });

    if (isReceiverActive) {
      switch (receiverType) {
        case 'Buyer':
          io.emit('buyerNotification');
          break;
        case 'Seller':
          io.emit('sellerNotification');
          break;
        default:
          io.emit('adminNotification');
      }
    }
  } catch (error) {
    console.error('Error creating or emitting notification:', error);
  }
};

module.exports = notificationHandler;
