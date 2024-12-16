module.exports = () => {
  return {
    schema: {
      bankName: { type: String },
      iban: { type: String },
      swiftBicNumber: { type: String },
      userId: { type: String },
    },
    collection: 'bank',
  };
};
