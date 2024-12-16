module.exports = mongo => {
  return {
    schema: {
      product: { type: mongo.Schema.Types.ObjectId, ref: 'product', required: true },
      startTime: { type: Date, required: true },
      endTime: { type: Date, required: true },
      amount: { type: Number, required: true },
    },
    collection: 'product_advertisement',
  };
};
