module.exports = mongo => {
  return {
    schema: {
      userId: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      amountEx: { type: mongo.Types.Decimal128, default: 0.0 },
      amountIn: { type: mongo.Types.Decimal128, default: 0.0 },
      status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected', 'completed'] },
      requestDate: { type: Date },
      approveDate: { type: Date },
      approvedBy: { type: mongo.Schema.Types.ObjectId, ref: 'admin' },
    },
    collection: 'payout',
  };
};
