module.exports = mongo => {
  return {
    schema: {
      userId: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      isBusiness: { type: Boolean, default: false },
      passportImageFront: { type: String },
      passportImageBack: { type: String },
      residenceProofImage: { type: String },
      personalImage: { type: String },
      ownerDetails: {
        businessName: String,
        businessEmail: String,
        ownerFullName: String,
        ownerPhoneNumber: String,
      },
      bankDetails: {
        bankName: String,
        accountHolder: String,
        accountNumber: String,
      },
      taxNumber :{ type: String },
      
      companyDocumentImage: { type: String },
      verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      declineReason: { type: String, trim: true },
    },
    collection: 'kyc',
  };
};
