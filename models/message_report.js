module.exports = mongo => {
  return {
    schema: {
      messageId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'message',
        required: true,
      },
      conversationId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'conversation',
        required: true,
      },
      reportedBy: {
        _id: { type: mongo.Schema.Types.ObjectId, refPath: 'reportedBy.model_type', index: true },
        model_type: { type: String, required: true, enum: ['user', 'admin'] },
      },
      reason: {
        type: String,
        enum: ['inappropriate language', 'harassment or abuse', 'hate speech', 'spam', 'other'],
        required: true,
      },
      details: {
        type: String,
        default: '',
      },
      messageContext: [
        {
          content: String,
          email: String,
        },
      ],
      status: {
        type: String,
        enum: ['pending', 'reviewed', 'action taken'],
        default: 'pending',
      },
      actionTaken: {
        type: String,
        enum: ['none', 'warning', 'temporary_suspension', 'permanent_ban', 'message_removed'],
        default: 'none',
      },
      actionTakenBy: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'admin',
      },
      actionDetails: {
        type: String,
        default: '',
      },
    },
    collection: 'message_report',
  };
};
