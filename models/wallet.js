module.exports = mongo => {
  return {
    schema: {
      userId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
      },
      totalAmount: {
        type: mongo.Types.Decimal128,
        default: 0.0,
      },
    },
    collection: 'wallet',
  };
};
