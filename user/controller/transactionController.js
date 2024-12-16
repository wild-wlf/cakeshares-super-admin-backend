const { createNotification, filterQuery, pagination, sendSocketNotification } = require('../helper');
const { USER, WALLET, PRODUCT, INVESTMENT, TRANSACTION, ADMIN } = global;
const { ObjectId } = require('mongodb');
module.exports = {
  getTransactions: async (req, res) => {
    try {
      const userId = req.user?._id;
      let {
        page = 1,
        itemsPerPage = 10,
        type,
        startDate,
        endDate,
        searchText,
        getAll,
      } = {
        ...req.query,
        ...filterQuery(req),
      };

      const isReport = startDate && endDate;

      page = parseInt(page);
      itemsPerPage = parseInt(itemsPerPage);

      const matchQuery = {
        userId: userId,
      };
      if (type === 'earn' || type === 'spend') {
        matchQuery.transactionType = type;
      } else if (type === 'top_up') {
        matchQuery.transactionType = { $in: ['top_up', 'card_topup', 'bank_topup'] };
      } else if (type === 'all') {
        matchQuery.transactionType = { $in: ['spend', 'earn', 'top_up', 'card_topup', 'bank_topup', 'payout'] };
      } else if (type === 'payout') {
        matchQuery.transactionType = { $in: ['payout'] };
      }

      if (startDate && endDate) {
        let start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        let end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.created_at = { $gte: start, $lt: end };
      }

      if (searchText && searchText !== '') {
        if (type === 'product' || type === 'spend') {
          // Adjusting the productMatchQuery to include searchText
          matchQuery.$or = [{ productName: { $regex: new RegExp(searchText, 'i') } }, { 'investmentTypeData.name': { $regex: new RegExp(searchText, 'i') } }];
        } else {
          matchQuery.$or = [
            { transactionType: { $regex: new RegExp(searchText, 'i') } },
            // { productName: { $regex: new RegExp(searchText, 'i') } },
          ];
        }
      }

      if (type === 'product' && isReport) {
        const productMatchQuery = {
          userId: userId,
        };

        const pipeline = [
          {
            $match: productMatchQuery,
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
            $lookup: {
              from: 'investment',
              localField: '_id',
              foreignField: 'product',
              as: 'investments',
            },
          },
          {
            $unwind: '$investments',
          },
          {
            $unwind: '$investmentTypeData',
          },
          {
            $match: matchQuery, // Apply the search text filter here
          },
          {
            $project: {
              _id: 1,
              productName: 1,
              assetValue: 1,
              investmentAmount: '$investments.investmentAmount',
              investmentTypeName: '$investmentTypeData.name',
              created_at: 1,
            },
          },
          {
            $sort: { created_at: -1 },
          },
          {
            $skip: (page - 1) * itemsPerPage,
          },
          {
            $limit: itemsPerPage,
          },
        ];

        try {
          const [items, totalItems] = await Promise.all([
            PRODUCT.aggregate(pipeline).exec(),
            PRODUCT.aggregate([
              { $match: productMatchQuery },
              {
                $lookup: {
                  from: 'investment',
                  localField: '_id',
                  foreignField: 'product',
                  as: 'investments',
                },
              },
              {
                $unwind: '$investments',
              },
              {
                $match: matchQuery, // Apply the search text filter here as well
              },
              {
                $count: 'total',
              },
            ]).exec(),
          ]);

          const total = totalItems.length > 0 ? totalItems[0].total : 0;

          return res.status(200).json({
            success: true,
            message: 'Products Retrieved Successfully!',
            ...pagination(items, +page, total, +itemsPerPage),
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Failed to Retrieve Products!',
            error: error.message,
          });
        }
      }

      //
      if (type === 'spend' && isReport) {
        const investmentMatchQuery = {
          userId: userId,
        };

        const pipeline = [
          {
            $match: investmentMatchQuery,
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
            $lookup: {
              from: 'category',
              localField: 'productDetails.investmentType',
              foreignField: '_id',
              as: 'investmentTypeData',
            },
          },
          {
            $unwind: '$productDetails',
          },

          {
            $unwind: '$investmentTypeData',
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              product: 1,
              investmentAmount: 1,
              investmentTypeName: '$investmentTypeData.name',
              created_at: 1,
              productName: '$productDetails.productName',
              assetValue: '$productDetails.assetValue',
            },
          },
          {
            $match: matchQuery,
          },
          {
            $sort: { created_at: -1 },
          },
          {
            $skip: (page - 1) * itemsPerPage,
          },
          {
            $limit: itemsPerPage,
          },
        ];

        try {
          const [items, totalItems] = await Promise.all([
            INVESTMENT.aggregate(pipeline).exec(),
            INVESTMENT.aggregate([
              { $match: investmentMatchQuery },
              {
                $match: matchQuery,
              },
              {
                $count: 'total',
              },
            ]).exec(),
          ]);

          const total = totalItems.length > 0 ? totalItems[0].total : 0;

          return res.status(200).json({
            success: true,
            message: 'Products Retrieved Successfully!',
            ...pagination(items, +page, total, +itemsPerPage),
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Failed to Retrieve Products!',
            error: error.message,
          });
        }
      }

      // if (startDate) {
      //   matchQuery.created_at = { ...matchQuery.created_at, $gte: new Date(startDate) };
      // }

      // if (endDate) {
      //   matchQuery.created_at = { ...matchQuery.created_at, $lte: new Date(endDate) };
      // }

      const totalTransactions = await TRANSACTION.countDocuments(matchQuery).exec();

      const pipeline = [
        { $match: matchQuery },
        {
          $lookup: {
            from: 'wallet',
            localField: 'walletId',
            foreignField: '_id',
            as: 'wallet',
          },
        },
        { $unwind: '$wallet' },
        {
          $project: {
            _id: 1,
            userId: 1,
            walletId: 1,
            amount: 1,
            transactionType: 1,
            spendType: 1,
            created_at: 1,
            updated_at: 1,
            totalAmount: '$wallet.totalAmount',
          },
        },
        { $sort: { created_at: -1 } },
      ];

      if (!getAll) {
        pipeline.push({ $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage });
      }

      const transactions = await TRANSACTION.aggregate(pipeline);

      res.status(200).json({
        success: true,
        message: 'Transactions Retrieved Successfully!',
        ...pagination(transactions, page, totalTransactions, itemsPerPage, getAll),
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};
