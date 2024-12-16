module.exports = mongo => {
  return {
    schema: {
      userId: { type: mongo.Schema.Types.ObjectId, ref: 'user', required: true },
      productId: { type: mongo.Schema.Types.ObjectId, ref: 'product', required: true },
      productName: { type: String, required: true, trim: true },
      investmentType: { type: mongo.Schema.Types.ObjectId, ref: 'category', required: true },
      addressDetails: {
        street_address: { type: String },
        city: { type: String },
        state: { type: String },
        postal_code: { type: String },
        country: { type: String },
        latlng: { lat: Number, lng: Number },
      },
      mapCheck: { type: Boolean, default: true },
      address: { type: String, trim: true },
      deadline: { type: Date, required: true },
      kycLevel: { type: Number, max: 3, default: 0 },
      description: { type: String, trim: true },
      investmentReason: { type: String, trim: true },
      media: { type: [String] },
      amenities: {
        type: [String],
        validate: {
          validator: v => v.length <= 10,
          message: 'Amenities cannot be more than 10',
        },
      },
      minimumBackers: { type: Number, default: 1, required: true },
      maximumBackers: { type: Number, required: true },
      assetValue: { type: Number, required: true },
      minimumInvestment: { type: Number, required: true },
      isInfiniteBackers: { type: Boolean, default: false },
      returnRatio: { type: Number, default: 0 },
      annualCost: { type: Number, default: 0 },
    },
    collection: 'product_edit_request',
  };
};
