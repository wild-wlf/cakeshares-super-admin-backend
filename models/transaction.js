module.exports = mongo => {
  return {
    schema: {
      userId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
      },
      walletId: {
        type: mongo.Schema.Types.ObjectId,
        ref: 'Wallet',
        required: true,
      },
      amount: {
        type: mongo.Types.Decimal128,
        required: true,
      },
      transactionType: {
        type: String,
        enum: ['top_up', 'spend', 'earn', 'card_topup', 'bank_topup', 'payout'],
        required: true,
      },
      spendType: {
        type: String,
        required: function () {
          return this.transactionType === 'spend';
        },
      },
    },
    collection: 'transaction',
  };
};
