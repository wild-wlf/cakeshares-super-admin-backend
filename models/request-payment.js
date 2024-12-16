module.exports = mongo => {
  return {
    schema: {
      userId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
      },
      adminId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'admin',
        required: true,
      },
      amount: {
        type: String,
        default: 0.0,
      },
      paymentProofDocument: {
        type: String,
      },
      type: {
        type: String,
        enum: ['add_to_wallet', 'invest', 'earn'],
        required: true,
      },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        required: true,
        default: 'pending',
      },
    },
    collection: 'request-payment',
  };
};
