const { createNotification, uploadImages } = require('../helper');

const { USER, WALLET, PRODUCT, INVESTMENT, TRANSACTION, REQUEST_PAYMENT } = global;

module.exports = {
  addBalance: async (req, res) => {
    const { userId, balanceAmount } = req.body;

    const user = await USER.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not Found!' });
    }

    const admin_permissions = req.admin.permissions;

    if (admin_permissions.includes('admin.approve_wallet')) {
      const { _id } = await WALLET.findOneAndUpdate({ userId }, { $inc: { totalAmount: balanceAmount } }, { upsert: true, new: true });

      await TRANSACTION.create({ userId: userId, walletId: _id, amount: balanceAmount, transactionType: 'top_up' });

      const notificationData = {
        actionType: 'balance_added',
        title: 'Amount Added!',
        message: [`An amount of ${balanceAmount} has been added to your wallet!`],
      };

      await createNotification([userId], notificationData, [], {
        [`${user.type}Notification`]: true,
      });

      return res.status(200).json({ code: 200, success: true, message: 'Balance Updated Successfully!' });
    } else {
      const request_payment = await REQUEST_PAYMENT.findOne({ userId, status: 'pending' });

      if (request_payment) {
        return res.status(200).json({ success: true, message: 'Already funds exists needs approval' });
      } else {
        let paymentProofDocument;
        if (req.file) {
          const currentTime = Date.now();
          const { locations } = await uploadImages(req.file, `requestPayment/${currentTime}`);
          paymentProofDocument = locations.paymentProofDocument[0];
        }
        await REQUEST_PAYMENT.create({ userId, adminId: req.admin._id, amount: balanceAmount, paymentProofDocument, type: 'add_to_wallet', status: 'pending' });
        return res.status(200).json({ success: true, message: 'Funds added needs approval before use' });
      }
    }
  },

  initiateInvestment: async (req, res) => {
    const { userId, productId, boughtAmount, sellerId } = req.body;
    if (!userId || !productId || !boughtAmount) return res.status(404).json({ success: false, message: 'Invalid Data!' });

    const product = await PRODUCT.findOne({ _id: productId });
    if (!(product?.currentBackers < product?.maximumBackers) && !product?.isInfiniteBackers) {
      return res.status(400).json({ success: false, message: 'Backers Limit Reached!' });
    }

    const updatedProduct = await PRODUCT.findOneAndUpdate(
      { _id: productId },
      {
        $inc: {
          currentBackers: 1,
          valueRaised: boughtAmount,
        },
      },
      { new: true },
    );
    const { _id } = await WALLET.findOneAndUpdate({ userId }, { $inc: { totalAmount: -boughtAmount } }, { upsert: true, new: true });
    const invest = await INVESTMENT.create({ userId, product: productId, investmentAmount: boughtAmount });
    await TRANSACTION.create({ userId: userId, walletId: _id, amount: boughtAmount, transactionType: 'spend', spendType: 'shares_purchase' });

    if (sellerId) {
      const { _id } = await WALLET.findOneAndUpdate({ userId: sellerId }, { $inc: { totalAmount: boughtAmount } }, { upsert: true, new: true });
      await TRANSACTION.create({ userId: sellerId, walletId: _id, amount: boughtAmount, transactionType: 'earn' });
    }

    const buyer = await USER.findById(invest.userId).select(['username']);

    const notificationData = {
      actionType: 'product_bought',
      title: 'New Investment!',
      message: [`An investment of $${boughtAmount} has been made on your product "${product.productName}" by ${buyer?.fullName || buyer?.username}.`, `An investment of $${boughtAmount} has been made on the product "${product.productName}" by ${buyer?.fullName || buyer?.username}.`],
    };

    await createNotification([updatedProduct?.userId], notificationData, ['SUPER_ADMIN'], {
      sellerNotification: true,
      adminNotification: true,
    });

    if (updatedProduct?.maximumBackers <= updatedProduct?.currentBackers && !updatedProduct?.isInfinitebackers && updatedProduct?.valueRaised < updatedProduct?.assetValue) {
      const notificationData = {
        actionType: 'product_backers_limit_reached_but_investment_remains',
        title: 'Product Approved!',
        message: [`Your product "${product.productName}" has reached its maximum number of backers, but there is still remaining investment value available.`],
      };

      await createNotification([updatedProduct?.userId], notificationData, [], {
        sellerNotification: true,
      });
    }

    return res.status(200).json({ success: true, message: 'Shares Bought Successfully!', raisedValue: updatedProduct?.valueRaised });
  },

  getWalletDetails: async (req, res) => {
    try {
      const userId = req.user?._id;
      const userType = req.user?.type;

      if (userType === 'Seller') {
        const pipeline = [
          {
            $match: { userId: userId },
          },
          {
            $lookup: {
              from: 'category',
              localField: 'investmentType',
              foreignField: '_id',
              as: 'investmentTypeData',
            },
          },
          {
            $unwind: '$investmentTypeData',
          },
          {
            $lookup: {
              from: 'investment',
              localField: '_id',
              foreignField: 'product',
              as: 'investments',
            },
          },
          {
            $unwind: {
              path: '$investments',
              preserveNullAndEmptyArrays: false,
            },
          },

          {
            $group: {
              _id: null,
              totalInvestmentAmount: { $sum: '$investments.investmentAmount' },
              investments: {
                $push: {
                  _id: '$_id',
                  productName: '$productName',
                  investmentTypeName: '$investmentTypeData.name',
                  assetValue: '$assetValue',
                  investmentAmount: '$investments.investmentAmount',
                },
              },
            },
          },
          {
            $project: {
              totalInvestmentAmount: 1,
              investments: {
                $map: {
                  input: '$investments',
                  as: 'investment',
                  in: {
                    _id: '$$investment._id',
                    productName: '$$investment.productName',
                    investmentTypeName: '$$investment.investmentTypeName',
                    assetValue: '$$investment.assetValue',
                    investmentAmount: '$$investment.investmentAmount',
                    percentage: {
                      $multiply: [
                        {
                          $divide: ['$$investment.investmentAmount', '$totalInvestmentAmount'],
                        },
                        100,
                      ],
                    },
                  },
                },
              },
            },
          },
        ];

        try {
          const result = await PRODUCT.aggregate(pipeline).exec();

          return res.status(200).json({
            success: true,
            message: 'Retrieved wallet details successfully',

            totalInvestmentAmount: result.length > 0 ? result[0].totalInvestmentAmount : 0,
            data: result.length > 0 ? result[0].investments : [],
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Failed to Retrieve Products and Investment Types!',
            error: error.message,
          });
        }
      } else {
        const pipeline = [
          {
            $match: {
              userId: userId,
            },
          },
          {
            $lookup: {
              from: 'product',
              localField: 'product',
              foreignField: '_id',
              as: 'productDetails',
            },
          },
          {
            $unwind: '$productDetails',
          },
          {
            $lookup: {
              from: 'category',
              localField: 'productDetails.investmentType',
              foreignField: '_id',
              as: 'investmentTypeData',
            },
          },
          {
            $unwind: '$investmentTypeData',
          },
          {
            $group: {
              _id: null,
              totalInvestmentAmount: { $sum: '$investmentAmount' },
              investments: {
                $push: {
                  _id: '$productDetails._id',
                  productName: '$productDetails.productName',
                  investmentTypeName: '$investmentTypeData.name',
                  assetValue: '$productDetails.assetValue',
                  investmentAmount: '$investmentAmount',
                },
              },
            },
          },
          {
            $project: {
              totalInvestmentAmount: 1,
              investments: {
                $map: {
                  input: '$investments',
                  as: 'investment',
                  in: {
                    _id: '$$investment._id',
                    productName: '$$investment.productName',
                    investmentTypeName: '$$investment.investmentTypeName',
                    assetValue: '$$investment.assetValue',
                    investmentAmount: '$$investment.investmentAmount',
                    percentage: {
                      $multiply: [
                        {
                          $divide: ['$$investment.investmentAmount', '$totalInvestmentAmount'],
                        },
                        100,
                      ],
                    },
                  },
                },
              },
            },
          },
        ];

        const result = await INVESTMENT.aggregate(pipeline).exec();

        return res.status(200).json({
          success: true,
          message: 'Retrieved wallet details successfully',
          totalInvestmentAmount: result.length > 0 ? result[0].totalInvestmentAmount : 0,
          data: result.length > 0 ? result[0].investments : [],
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve wallet details!',
        error: error.message,
      });
    }
  },

  approveAddWalletPayment: async (req, res) => {
    const { userId, amount, status } = req.body;

    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not Found!' });
    }

    const admin_permissions = req.admin.permissions;

    if (admin_permissions.includes('admin.approve_wallet')) {
      await REQUEST_PAYMENT.findOneAndUpdate({ userId, amount, status: 'pending' }, { status: status });

      if (status === 'approved') {
        const { _id } = await WALLET.findOneAndUpdate({ userId }, { $inc: { totalAmount: amount } }, { upsert: true, new: true });

        await TRANSACTION.create({ userId: userId, walletId: _id, amount: amount, transactionType: 'top_up' });

        const notificationData = {
          actionType: 'balance_added',
          title: 'Balance Updated!',
          message: [`An amount of $${amount} has been added to your wallet.`],
        };

        await createNotification([userId], notificationData, [], {
          [`${user.type}Notification`]: true,
        });

        return res.status(200).json({ code: 200, success: true, message: 'Balance approved and Updated Successfully!' });
      } else {
        return res.status(200).json({ code: 200, success: false, message: 'Balance approval rejected by you!' });
      }
    } else {
      return res.status(200).json({ code: 200, success: false, message: 'You do not have permissions to do this!' });
    }
  },
};
