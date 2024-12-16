module.exports = mongo => {
  return {
    schema: {
      user_id: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      token: { type: String },
      iat: { type: Date },
      exp: { type: Date },
    },
    collection: 'user_jwt',
  };
};
