module.exports = mongo => {
  return {
    schema: {
      type: {
        type: String,
        default: 'admin',
        uppercase: true,
      },
      description: {
        type: String,
        default: 'Role for a Super Admin',
      },
      permissions: { type: [mongo.Schema.Types.ObjectId], ref: 'permissions' },
    },
    collection: 'roles',
  };
};
