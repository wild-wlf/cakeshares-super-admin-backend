module.exports = mongo => {
  return {
    schema: {
      recipientId: {
        type: mongo.Schema.Types.ObjectId,
        required: true,
      },
      // recipientType: {
      //   type: String,
      //   enum: ['buyer', 'seller', 'admin'],
      //   required: true,
      // },
      actionType: {
        type: String,
        // enum: ['user_created', 'product_created', 'product_bought', 'user_approved', 'kyc', 'product_approved', 'message',"balance_added"],
        required: true,
      },
      message: {
        type: String,
      },
      title: { type: String },
      isRead: {
        type: Boolean,
        default: false,
      },
    },
    collection: 'notification',
  };
};
