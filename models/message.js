module.exports = mongo => {
  return {
    schema: {
      author: { _id: { type: mongo.Schema.Types.ObjectId, refPath: 'author.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } },
      content: { type: String },
      type: { type: String },
      reaction: { type: String, default: '' },
      reactions: [{ reaction: { type: String }, senderId: { _id: { type: mongo.Schema.Types.ObjectId, refPath: 'reactions.senderId.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } }, _id: false }],
      receiver: {
        _id: { type: mongo.Schema.Types.ObjectId, refPath: 'receiver.model_type', index: true },
        model_type: {
          type: String,
          required: function () {
            return this.type === 'DIRECT_MESSAGE';
          },
          enum: ['user', 'admin'],
        },
      },
      receivers: [{ _id: { type: mongo.Schema.Types.ObjectId, refPath: 'receivers.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } }],
      readBy: [{ _id: { type: mongo.Schema.Types.ObjectId, refPath: 'readBy.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } }],
      conversationId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'conversation',
        index: true,
        required: true,
      },
      pool: {
        question: { type: String },
        options: [
          {
            option: { type: String },
            users: [
              {
                _id: { type: mongo.Schema.Types.ObjectId, refPath: 'pool.options.users.model_type', index: true },
                model_type: { type: String, required: true, enum: ['user', 'admin'] },
                isAnonymous: { type: Boolean, default: false },
              },
            ],
          },
        ],
        allow_multiple: { type: Boolean },
      },
      isPool: { type: Boolean },
    },
    collection: 'message',
  };
};
