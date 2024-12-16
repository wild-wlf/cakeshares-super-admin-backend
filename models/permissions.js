module.exports = () => {
    return {
      schema: {
        route: { type: String, index: true },
        description: { type: String },
        can: { type: String, unique: true, lowercase: true },
        parent: { type: [String] },
      },
      collection: 'permissions',
    };
  };
  