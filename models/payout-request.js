module.exports = mongo => {
  return {
    schema: {
      userId: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      product: { type: mongo.Schema.Types.ObjectId, ref: 'product', required: true },
      investmentAmount: { type: Number, required: true },
      return: { type: Number, default: 0 },
      fundingRatio: { type: Number, default: 0 },
      annualCostEst: { type: Number, default: 0 },
    },
    collection: 'payout-request',
  };
};
