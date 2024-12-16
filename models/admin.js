module.exports = mongo => {
  return {
    schema: {
      fullName: {
        type: String,
        required: [true, 'Full Name is Required!'],
      },
      email: {
        type: String,
        unique: true,
        required: [true, 'Email is Required!'],
      },
      profilePicture: { type: String, default: '' },
      password: { type: String, required: [true, 'Password is Required!'] },
      permissions: { type: Array, default: [] },
      roles: [{ type: mongo.Schema.Types.ObjectId, ref: 'roles' }],
      status: { type: String, enum: ['Pending', 'Active', 'Deactive', 'Rejected', 'Suspended'], default: 'Pending' },
    },
    collection: 'admin',
  };
};
