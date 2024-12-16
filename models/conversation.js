module.exports = mongo => {
  return {
    schema: {
      participants: [{ _id: { type: mongo.Schema.Types.ObjectId, refPath: 'participants.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } }],
      initBy: { _id: { type: mongo.Schema.Types.ObjectId, refPath: 'initBy.model_type', index: true }, model_type: { type: String, required: true, enum: ['user', 'admin'] } },
      messages: [{ type: mongo.Schema.Types.ObjectId, ref: 'message', index: true }],
      type: {
        type: String,
      },
      channelName: {
        type: String,
      },
      productName: { type: String },
    },
    collection: 'conversation',
  };
};
