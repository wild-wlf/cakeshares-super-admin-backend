const { USER, INVESTMENT, PRODUCT, CATEGORY, ADMIN } = global;
const { filterUserQuery, pagination, productFilter, userFilter, createNotification, sendSocketNotification } = require('../helper');

module.exports = {
  getDashboardCards: async (req, res) => {
    const userCount = await USER.countDocuments();
    const investmentCount = await INVESTMENT.countDocuments();

    return res.status(200).json({ success: true, message: 'Dashboard Cards Analytics Retrieved Successfully!', cardsData: { userCount, investmentCount } });
  },

  getAllInvestmentsSuper: async (req, res) => {
    // eslint-disable-next-line prefer-const
    let { page, itemsPerPage, startDate, endDate, searchText } = {
      ...req.query,
      ...filterUserQuery(req),
    };
    const query = {
      $and: [],
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.$and.push({ created_at: { $gte: start, $lt: end } });
    }

    searchText = searchText && searchText !== 'undefined' && searchText !== 'null' ? searchText : '';
    query.$and.push({
      $or: [
        {
          userId: {
            $in: (await userFilter(searchText)) ?? [],
          },
        },
        {
          product: {
            $in: (await productFilter(searchText)) ?? [],
          },
        },
      ],
    });

    let items, totalItems;
    totalItems = await INVESTMENT.countDocuments(query).exec();
    items = await INVESTMENT.find(query)
      .lean()
      .populate([
        { path: 'userId', model: 'user', select: 'fullName sellerType isVerified _id' },
        {
          path: 'product',
          model: PRODUCT,
          // select: 'productName investmentType',
          populate: {
            path: 'investmentType',
            model: CATEGORY,
            select: 'name',
          },
        },
      ])
      .skip((+page - 1) * +itemsPerPage)
      .limit(+itemsPerPage)
      .exec();

    const allProductsinDb = await PRODUCT.countDocuments();

    return res.status(200).json({
      success: true,
      message: `Investments Retrieved Successfully!`,
      allProductsinDb,
      ...pagination(items, +page, totalItems, +itemsPerPage),
    });
  },
};
