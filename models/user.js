module.exports = mongo => {
  return {
    schema: {
      username: {
        type: String,
        unique: true,
        required: true,
      },
      email: {
        type: String,
        unique: true,
        required: true,
      },
      dob: { type: Date },
      fullName: { type: String, default: '' },
      password: { type: String, required: true },
      profilePicture: { type: String, default: '' },
      bannerImage: { type: String, default: '' },
      country: { type: String, default: '' },

      type: { type: String, enum: ['Buyer', 'Seller'], required: true },
      sellerType: {
        type: String,
        enum: ['Individual', 'Company'],
        required: function () {
          return this.type === 'Seller';
        },
      },
      isIndividualSeller: {
        type: Boolean,
        default: function () {
          return this.type === 'Seller' && this.sellerType === 'Individual';
        },
      },
      isVerified: { type: Boolean, default: false },
      status: { type: String, enum: ['Pending', 'Active', 'Deactive', 'Rejected', 'Suspended'], default: 'Pending' },
      registrationStatus: { type: String, enum: ['Pending', 'Completed'], default: 'Pending' },

      kycLevel: { type: Number, max: 3, default: 0 },
      isKycRequested: { type: Boolean, default: false },
      kycRequestLevel: { type: Number, max: 3, default: null },
      kyc: { type: mongo.Schema.Types.ObjectId, ref: 'kyc' },

      bank: { type: mongo.Schema.Types.ObjectId, ref: 'bank' },
      role: { type: mongo.Schema.Types.ObjectId, ref: 'roles' },

      verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      declineReason: { type: String, trim: true },

      isPayoutRequest: { type: Boolean, default: false },

      stripeCustomerId: { type: String },
    },
    collection: 'user',
  };
};
