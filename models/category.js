module.exports = mongo => {
  return {
    schema: {
      name: { type: String, required: true, unique: true, trim: true },
      icon: { type: String },
      description: { type: String, trim: true },
      bgColor: { type: String },
      textColor: { type: String },
    },
    collection: 'category',
  };
};
