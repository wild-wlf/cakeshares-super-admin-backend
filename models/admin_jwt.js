module.exports = mongo => {
    return {
      schema: {
        admin_id: { type: mongo.Schema.Types.ObjectId, ref: 'admin', required: true },
        token: { type: String },
        iat: { type: Date },
        exp: { type: Date },
      },
      collection: 'admin_jwt',
    };
  };
  