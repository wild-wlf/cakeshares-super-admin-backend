const { createNotification } = require('../helper');

const { PRODUCT, WALLET, PRODUCT_ADVERTISEMENT, TRANSACTION } = global;

module.exports = {
  advertiseProduct: async (req, res) => {
    const advertisementData = req.body;
    const user = req.user;

    const advertisedDuration = (new Date(advertisementData?.endTime) - new Date(advertisementData?.startTime)) / (1000 * 60 * 60 * 24);

    const { product, userId, amount } = advertisementData;
    await PRODUCT_ADVERTISEMENT.create(advertisementData);
    const updatedWallet = await WALLET.findOneAndUpdate({ userId }, { $inc: { totalAmount: -amount } });
    await TRANSACTION.create({ userId: userId, walletId: updatedWallet._id, amount, transactionType: 'spend', spendType: 'advertisement' });

    const prod = await PRODUCT.findOne({ _id: product });

    const notificationData = {
      actionType: 'product_advertised',
      title: 'Product Advertised Successfully',
      message: [`Your product "${prod.productName}" has been successfully advertised for ${advertisedDuration} day(s).`, `The product "${prod.productName}" by "${user.fullName || user.username}" has been successfully advertised for ${advertisedDuration} day(s).`],
    };

    await createNotification([userId], notificationData, ['SUPER_ADMIN'], {
      sellerNotification: true,
      adminNotification: true,
    });

    return res.status(201).json({ success: true, message: 'Product Advertised Successfully!' });
  },
};
