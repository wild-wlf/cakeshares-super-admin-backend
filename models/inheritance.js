module.exports = mongo => {
  return {
    schema: {
      userId: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      name: { type: String },
      email: { type: String },
      passportNumber: { type: String },
      country: { type: String },
    },
    collection: 'inheritance',
  };
};
