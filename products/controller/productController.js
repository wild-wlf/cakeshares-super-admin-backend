const { PRODUCT, USER, ADMIN, PRODUCT_ADVERTISEMENT, CATEGORY, INVESTMENT, PRODUCT_EDIT_REQUEST } = global;
const { uploadImages, filterUserQuery, pagination, productFilter, adminFilter, userFilter, investmentTypeFilter, parseJSON, filterQuery, filterAdvancedSearchQuery, createNotification, removeFromS3 } = require('../helper');
const mongoose = require('mongoose');
const {
  Types: {
    ObjectId: { createFromHexString },
  },
} = require('mongoose');
const excelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

module.exports = {
  getAllProductsSuper: async (req, res) => {
    let { page, itemsPerPage, startDate, endDate, searchText, section, status, accType, kycLevel } = {
      ...req.query,
      ...filterUserQuery(req),
    };

    const query = {
      $and: [],
    };

    if (status === 'funded') {
      query.$and.push({ $expr: { $eq: ['$valueRaised', '$assetValue'] } });
    } else if (status) {
      query.$and.push({
        verificationStatus: status,
      });
    }

    if (kycLevel) {
      query.$and.push({
        kycLevel,
      });
    }

    if (accType) {
      if (accType === 'Individual' || accType === 'Company') {
        query.$and.push({
          userId: {
            $in: (await userFilter(accType)) ?? [],
          },
        });
      } else {
        const excludeTypes = ['Individual', 'Company'];
        const excludedUserIds = await USER.find({ sellerType: { $in: excludeTypes } })
          .select('_id')
          .lean();
        query.$and.push({
          userId: {
            $nin: excludedUserIds.map(user => user._id),
          },
        });
      }
    }

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
        { productName: { $regex: new RegExp(searchText, 'i') } },
        {
          userId: {
            $in: (await adminFilter(searchText)) ?? [],
          },
        },
        {
          userId: {
            $in: (await userFilter(searchText)) ?? [],
          },
        },
      ],
    });

    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'users',
        },
      },
      {
        $lookup: {
          from: 'category', // Assuming 'categories' is the collection name for categories
          localField: 'investmentType',
          foreignField: '_id',
          as: 'category',
        },
      },
      {
        $lookup: {
          from: 'product_advertisement',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$product', '$$productId'] }, { $gt: ['$endTime', new Date()] }],
                },
              },
            },
            {
              $addFields: {
                daysLeft: {
                  $floor: {
                    $divide: [{ $subtract: ['$endTime', new Date()] }, 1000 * 60 * 60 * 24],
                  },
                },
              },
            },
          ],
          as: 'advertisement',
        },
      },
      {
        $addFields: {
          isAdvertised: {
            $cond: {
              if: { $gt: [{ $size: '$advertisement' }, 0] },
              then: true,
              else: false,
            },
          },
          remainingAdvertisementDays: {
            $cond: {
              if: { $gt: [{ $size: '$advertisement' }, 0] },
              then: { $arrayElemAt: ['$advertisement.daysLeft', 0] },
              else: null,
            },
          },
        },
      },
      {
        $project: {
          productName: 1,
          investmentType: 1,
          address: 1,
          deadline: 1,
          kycLevel: 1,
          description: 1,
          investmentReason: 1,
          media: 1,
          amenities: 1,
          minimumBackers: 1,
          maximumBackers: 1,
          currentBackers: 1,
          assetValue: 1,
          minimumInvestment: 1,
          isInfiniteBackers: 1,
          isAdvertised: 1,
          remainingAdvertisementDays: 1,
          editRequestDeclineReason: 1,
          declineReason: 1,
          valueRaised: 1,
          isVerified: 1,
          isProductRequest: 1,
          verificationStatus: 1,
          updated_at: 1,
          mapCheck: 1,
          returnRatio: 1,
          annualCost: 1,

          investmentType: { $arrayElemAt: ['$category', 0] },
          userId: {
            $arrayElemAt: [
              {
                $map: {
                  input: '$users',
                  in: {
                    fullName: '$$this.fullName',
                    isVerified: '$$this.isVerified',
                    sellerType: '$$this.sellerType',
                    _id: '$$this._id',
                  },
                },
              },
              0,
            ],
          },
          created_at: 1,
        },
      },
      { $sort: { updated_at: -1 } },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage },
    ];

    const [items, totalItems] = await Promise.all([PRODUCT.aggregate(pipeline).exec(), PRODUCT.countDocuments(query).exec()]);

    const allProductsInDb = await PRODUCT.countDocuments();

    return res.status(200).json({
      success: true,
      message: `${section} Retrieved Successfully!`,
      allProductsInDb,
      ...pagination(items, page, totalItems, itemsPerPage),
    });
  },

  createProduct: async (req, res) => {
    // eslint-disable-next-line no-unused-vars
    const { media, ...productData } = req.body;
    const isUser = req.isUser;

    const id = req.owner?._id;

    const existingProduct = await PRODUCT.findOne({
      userId: { $ne: id },
      productName: {
        $regex: `^${req?.body?.productName}$`,
        $options: 'i',
      },
    });

    if (existingProduct) {
      return res.status(400).json({
        message: 'Product already exist',
      });
    }

    if (productData.amenities) {
      productData.amenities = parseJSON(productData.amenities);
    }
    if (productData.addressDetails) productData.addressDetails = parseJSON(productData.addressDetails);

    if (req.files && req.files.length > 0) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.files, `Product/${currentTime}`);
      const finalArray = Object.values(locations).map(item => item[0]);
      productData.media = finalArray;
    }

    await PRODUCT.create({ ...productData, isVerified: !isUser ? true : false, verificationStatus: !isUser ? 'approved' : 'pending' });

    const notificationData = {
      actionType: 'product_created',
      title: 'New Product Created',
      message: [`A new product named "${productData.productName}" has been created by ${req?.owner?.fullName || req.owner?.username}.`],
    };

    await createNotification([], notificationData, ['SUPER_ADMIN'], {
      adminNotification: true,
    });

    return res.status(201).json({ success: true, message: 'Product Created Successfully!' });
  },

  getAllProducts: async (req, res) => {
    const id = req.user?._id;

    let { page, itemsPerPage, type, kyc, startDate, searchText, endDate } = {
      ...req.query,
      ...filterUserQuery(req),
    };

    const query = {
      $and: [{ userId: id }],
    };

    if (type) {
      if (type === 'new') {
        query.$and.push({ isVerified: false, verificationStatus: 'pending' });
      } else if (type === 'funded') {
        query.$and.push({ $expr: { $eq: ['$valueRaised', '$assetValue'] } });
      } else if (type === 'active') {
        query.$and.push({ isVerified: true, $expr: { $ne: ['$valueRaised', '$assetValue'] } });
      } else if (type === 'rejected') {
        query.$and.push({ isVerified: false, verificationStatus: 'rejected' });
      }
    }

    if (kyc && kyc !== 'all') {
      query.$and.push({ kycLevel: +kyc });
    }

    if (searchText && searchText !== '') {
      query.$and.push({
        $or: [
          { productName: { $regex: new RegExp(searchText, 'i') } },
          {
            investmentType: {
              $in: (await investmentTypeFilter(searchText)) ?? [],
            },
          },
        ],
      });
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.$and.push({ created_at: { $gte: start, $lt: end } });
    }

    const totalProducts = await PRODUCT.countDocuments(query).exec();

    const products = await PRODUCT.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'users',
        },
      },
      {
        $lookup: {
          from: 'category',
          localField: 'investmentType',
          foreignField: '_id',
          as: 'category',
        },
      },
      {
        $lookup: {
          from: 'product_advertisement',
          let: { productId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [{ $eq: ['$product', '$$productId'] }, { $gt: ['$endTime', new Date()] }],
                },
              },
            },
            {
              $addFields: {
                daysLeft: {
                  $floor: {
                    $divide: [{ $subtract: ['$endTime', new Date()] }, 1000 * 60 * 60 * 24],
                  },
                },
              },
            },
          ],
          as: 'advertisement',
        },
      },
      {
        $addFields: {
          isAdvertised: {
            $cond: {
              if: { $gt: [{ $size: '$advertisement' }, 0] },
              then: true,
              else: false,
            },
          },
          remainingAdvertisementDays: {
            $cond: {
              if: { $gt: [{ $size: '$advertisement' }, 0] },
              then: { $arrayElemAt: ['$advertisement.daysLeft', 0] },
              else: null,
            },
          },
        },
      },
      {
        $project: {
          userId: 1,
          productName: 1,
          investmentType: 1,
          address: 1,
          deadline: 1,
          kycLevel: 1,
          description: 1,
          investmentReason: 1,
          media: 1,
          amenities: 1,
          minimumBackers: 1,
          maximumBackers: 1,
          currentBackers: 1,
          assetValue: 1,
          minimumInvestment: 1,
          isInfiniteBackers: 1,
          isAdvertised: 1,
          remainingAdvertisementDays: 1,
          valueRaised: 1,
          isVerified: 1,
          verificationStatus: 1,
          isProductRequest: 1,
          declineReason: 1,
          editRequestDeclineReason: 1,
          mapCheck: 1,
          annualCost: 1,
          returnRatio: 1,
          endTime: '$advertisement.endTime',
          updated_at: 1,
          investmentType: { $arrayElemAt: ['$category', 0] },
          users: {
            $arrayElemAt: [
              {
                $map: {
                  input: '$users',
                  in: {
                    fullName: '$$this.fullName',
                    sellerType: '$$this.sellerType',
                    isIndividualSeller: '$$this.isIndividualSeller',
                  },
                },
              },
              0,
            ],
          },
          created_at: 1,
        },
      },
      { $sort: { updated_at: -1 } },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage },
    ]);
    return res.status(200).json({
      success: true,
      message: 'Products Retrieved Successfully!',
      ...pagination(products, page, totalProducts, itemsPerPage),
    });
  },

  getOngoingProducts: async (req, res) => {
    const id = req.user?._id;
    const query = {
      $and: [{ userId: id }],
    };

    const uniqueInvestmentTypes = await PRODUCT.distinct('investmentType', query);

    const Categories = await CATEGORY.find({ _id: { $in: uniqueInvestmentTypes } })
      .select('name icon -_id')
      .lean();

    const totalProductsCount = await PRODUCT.countDocuments(query).exec();
    const totalProducts = totalProductsCount > 0 ? totalProductsCount : 0;

    return res.status(200).json({
      success: true,
      totalOngoingProducts: totalProducts,
      productCategories: Categories,
    });
  },

  updateProduct: async (req, res) => {
    const isUser = req.isUser;
    const { id } = req.params;
    const { media, amenities, ...productData } = req.body;

    const p = await PRODUCT.findById(id);

    if (!p) {
      return res.status(404).json({ success: false, message: 'Product Id is missing or Invalid!' });
    }

    if (p.valueRaised > 0) {
      return res.status(400).json({ success: false, message: "Invested Products Can't be Edited!" });
    }

    const currentDate = new Date();
    const advertisement = await PRODUCT_ADVERTISEMENT.findOne({ product: id, endTime: { $gt: currentDate } });

    const existingProduct = await PRODUCT.findOne({
      _id: { $ne: id },
      productName: {
        $regex: `^${req?.body?.productName}$`,
        $options: 'i',
      },
    });

    if (existingProduct) {
      return res.status(400).json({
        message: 'Product already exist',
      });
    }

    let mediaArray;
    if (media) mediaArray = media ? parseJSON(media) : [];

    if (req.files && req.files.length > 0) {
      const currentTime = Date.now();
      const { locations } = await uploadImages(req.files, `Product/${currentTime}`);
      const pictureArray = Object.values(locations).map(item => item[0]);

      for (const [index, file] of req.files.entries()) {
        const match = file.fieldname.match(/\[(\d+)\]/);
        if (match) {
          const arrayIndex = parseInt(match[1], 10);
          await removeFromS3(mediaArray[arrayIndex]?.split('.com/')[1]);
          mediaArray[arrayIndex] = pictureArray[index];
        }
      }
    }
    if (productData.verificationStatus === 'rejected' && advertisement) {
      return res.status(400).json({ success: false, message: 'Adevtised Product not able to remove!' });
    }
    if (media) productData.media = mediaArray;

    if (amenities && !!amenities.length) {
      productData.amenities = parseJSON(amenities);
    }

    let product = null;

    if (productData.addressDetails) productData.addressDetails = parseJSON(productData.addressDetails);
    if ((!p?.valueRaised > 0 && p?.verificationStatus === 'pending') || !req.isUser) {
      product = await PRODUCT.findByIdAndUpdate(id, { ...productData });
    } else {
      await PRODUCT_EDIT_REQUEST.findOneAndUpdate({ productId: id }, { ...productData, userId: p.userId, isInfiniteBackers: productData?.isInfiniteBackers }, { upsert: true, new: true });
      product = await PRODUCT.findByIdAndUpdate(id, { isProductRequest: true });
      return res.status(200).json({ success: true, message: 'Product Update Request Completed Successfully!' });
    }

    const notificationData = {
      actionType: 'product_approved',
      title: 'Product Approved!',
      message: [`Your product "${p.productName}" has been approved successfully.`],
    };

    await createNotification([product.userId], notificationData, [], {
      sellerNotification: true,
    });

    return res.status(200).json({ success: true, message: 'Product Updated Successfully!' });
  },

  deleteProduct: async (req, res) => {
    const { id } = req.params;
    const isProductExists = await PRODUCT.findOne({ _id: id });

    if (!isProductExists) {
      return res.status(404).json({ success: false, message: 'Product Id is Missing or Invalid!' });
    }

    if (isProductExists.valueRaised > 0) {
      throw new Error('Product is not able to delete please make sure all investors money is safe:403');
    }

    const currentDate = new Date();
    const advertisement = await PRODUCT_ADVERTISEMENT.findOne({ product: id, endTime: { $gt: currentDate } });

    if (advertisement) {
      return res.status(400).json({ success: false, message: 'This is advertised not able to delete!' });
    }

    //await PRODUCT.findByIdAndDelete(id);
    await PRODUCT.findByIdAndDelete(id);

    const notificationData = {
      actionType: 'product_deleted',
      title: 'Product Deleted!',
      message: [`Your product "${isProductExists.productName}" has been successfully deleted.`],
    };

    await createNotification([isProductExists.userId], notificationData, [], {
      sellerNotification: true,
    });

    return res.status(200).json({ success: true, message: 'Product Deleted Successfully!' });
  },

  rejectProduct: async (req, res) => {
    const { id } = req.params;
    const { declineReason } = req.body;
    const isProductExists = await PRODUCT.findOne({ _id: id });

    if (!isProductExists) {
      return res.status(404).json({ success: false, message: 'Product Id is Missing or Invalid!' });
    }

    await PRODUCT.findByIdAndUpdate(id, { $set: { verificationStatus: 'rejected', declineReason: declineReason || '', isVerified: false } });

    const notificationData = {
      actionType: 'product_rejected',
      title: 'Product Rejected!',
      message: [`Your product "${isProductExists.productName}" has been rejected. Reason: ${declineReason}`],
    };

    await createNotification([isProductExists.userId], notificationData, [], {
      sellerNotification: true,
    });

    return res.status(200).json({ success: true, message: 'Product Rejected Successfully!' });
  },

  getSingleProduct: async (req, res) => {
    const { id } = req.params;
    if (!id) {
      return res.status(404).json({ success: false, message: 'Product Id is Missing!' });
    }

    let product = await PRODUCT.findById(id)
      .select('-addressDetails -minimumBackers -currentBackers -isVerified -verificationStatus -isProductRequest -created_at -updated_at -declineReason -mapCheck')
      .populate([
        { path: 'userId', model: USER, select: 'fullName profilePicture sellerType email type username' },
        { path: 'investmentType', model: CATEGORY, select: 'name -_id' },
      ]);

    if (!product.userId) {
      product = await PRODUCT.findById(id)
        .populate({
          path: 'userId',
          model: ADMIN,
          select: 'fullName profilePicture email',
        })
        .lean();
      product.userId.isAdmin = true;
    }

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found!' });
    }

    const data = { product, otherProducts: [] };
    if (product?.userId) {
      const otherProducts = await PRODUCT.find({
        _id: { $ne: product._id },
        isVerified: true,
        deadline: { $gte: new Date() },
        $expr: { $lt: ['$valueRaised', '$assetValue'] },
        userId: product.userId._id,
      })
        .select('_id productName media currentBackers valueRaised assetValue')
        .populate({ path: 'investmentType', model: CATEGORY, select: 'name -_id' });

      data.otherProducts = otherProducts;
    }

    return res.status(200).json({ success: true, message: 'Product Retrieved Successfully!', data });
  },

  getAllProductsForHomePage: async (req, res) => {
    let { page, itemsPerPage, category } = { ...req.query, ...filterQuery(req) };

    let query = {
      $and: [
        { $expr: { $lt: ['$valueRaised', '$assetValue'] } },
        { isVerified: true },
        {
          $or: [{ $expr: { $lt: ['$currentBackers', '$maximumBackers'] } }, { $and: [{ maximumBackers: null }, { isInfiniteBackers: true }] }],
        },
        { verificationStatus: { $nin: ['rejected', 'pending'] } },
        { deadline: { $gte: new Date() } },
      ],
      $or: [],
    };

    if (category && category !== '' && category !== null && category !== undefined) {
      query.$and.push({ investmentType: createFromHexString(category) });
    }

    if (!query.$and.length > 0) {
      delete query.$and;
    }
    if (!query.$or.length > 0) {
      delete query.$or;
    }

    let totalItems = await PRODUCT.countDocuments(query);

    const advertisementLookup = {
      $lookup: {
        from: 'product_advertisement',
        let: { productId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$product', '$$productId'] }, { $gt: ['$endTime', new Date()] }],
              },
            },
          },
          { $sort: { endTime: -1 } },
          { $limit: 1 },
        ],
        as: 'advertisement',
      },
    };

    const projectStage = {
      $project: {
        productName: 1,
        minimumBackers: 1,
        maximumBackers: 1,
        currentBackers: 1,
        media: 1,
        assetValue: 1,
        minimumInvestment: 1,
        valueRaised: 1,
        'investmentType.name': { $arrayElemAt: ['$category.name', 0] },
      },
    };

    const products = await PRODUCT.aggregate([
      { $match: query },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $match: {
          $or: [{ 'userInfo.status': 'Active' }, { 'userInfo.status': { $exists: false } }],
        },
      },
      {
        $lookup: { from: 'category', localField: 'investmentType', foreignField: '_id', as: 'category' },
      },
      {
        $facet: {
          popularProducts: [advertisementLookup, { $match: { 'advertisement.0': { $exists: false } } }, projectStage, { $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage }],
          totalPopularProducts: [advertisementLookup, { $match: { 'advertisement.0': { $exists: false } } }, { $count: 'count' }],
          advertisedProducts: [advertisementLookup, { $match: { 'advertisement.0': { $exists: true } } }, projectStage, { $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage }],
          totalAdvertisedProducts: [advertisementLookup, { $match: { 'advertisement.0': { $exists: true } } }, { $count: 'count' }],
        },
      },
    ]);

    let sidePipeline;
    sidePipeline = await PRODUCT.aggregate([
      {
        $facet: {
          priceStats: [
            {
              $group: {
                _id: null,
                maxPrice: { $max: '$assetValue' },
                minPrice: { $min: '$assetValue' },
              },
            },
            {
              $project: {
                _id: 0,
                maxPrice: 1,
                minPrice: 1,
              },
            },
          ],
          uniqueCountries: [
            {
              $group: {
                _id: null,
                uniqueCountries: { $addToSet: '$addressDetails.country' },
              },
            },
            {
              $project: {
                _id: 0,
                uniqueCountries: 1,
              },
            },
          ],
        },
      },
    ]);

    const totalPopularProducts = products[0].totalPopularProducts[0]?.count || 0;
    const totalAdvertisedProducts = products[0].totalAdvertisedProducts[0]?.count || 0;

    const popularProducts = pagination(products[0].popularProducts, page, totalPopularProducts, itemsPerPage);
    const advertisedProducts = pagination(products[0].advertisedProducts, page, totalAdvertisedProducts, itemsPerPage);

    return res.status(200).json({
      popularProducts,
      advertisedProducts,
      priceRange: sidePipeline[0]?.priceStats?.[0],
      countries: sidePipeline[0]?.uniqueCountries?.[0]?.uniqueCountries,
      code: 200,
      success: true,
    });
  },

  getAllAssets: async (req, res) => {
    const user = req.user;
    let { page, itemsPerPage, searchText, getAll } = filterQuery(req);

    let query = {
      $and: [{ userId: user._id }],
      $or: [],
    };

    query.$and.push({
      $or: [
        {
          product: {
            $in: (await productFilter(searchText)) ?? [],
          },
        },
      ],
    });

    if (!query.$and.length > 0) {
      delete query.$and;
    }
    if (!query.$or.length > 0) {
      delete query.$or;
    }

    let totalItems = await INVESTMENT.aggregate([
      {
        $match: {
          userId: user._id,
        },
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            product: '$product',
          },
        },
      },
      {
        $count: 'totalItems',
      },
    ]).exec();

    totalItems = totalItems.length > 0 ? totalItems[0].totalItems : 0;
    if (getAll === true) {
      page = 1;
      itemsPerPage = totalItems;
    }

    let products = await INVESTMENT.aggregate([
      {
        $match: query,
      },
      {
        $group: {
          _id: {
            userId: '$userId',
            product: '$product',
          },
          totalAmount: {
            $sum: '$investmentAmount',
          },
          totalShares: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'product',
          localField: '_id.product',
          foreignField: '_id',
          as: 'product',
        },
      },
      {
        $unwind: '$product',
      },
      {
        $lookup: {
          from: 'user',
          localField: 'product.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $lookup: {
          from: 'category',
          localField: 'product.investmentType',
          foreignField: '_id',
          as: 'category',
        },
      },
      {
        $addFields: {
          category: {
            name: { $arrayElemAt: ['$category.name', 0] },
            icon: { $arrayElemAt: ['$category.icon', 0] },
          },
          userId: '$_id.userId',
          productId: '$_id.product',
        },
      },
      {
        $project: {
          _id: 0,
          'user.fullName': 1,
          'user.profilePicture': 1,
          'user._id': 1,
          'user.username': 1,
          'user.email': 1,
          'product.productName': 1,
          'product._id': 1,
          'product.userId': 1,
          totalAmount: 1,
          totalShares: 1,
          category: {
            $arrayElemAt: [
              {
                $map: {
                  input: '$category',
                  as: 'cat',
                  in: {
                    name: '$$cat.name',
                    icon: '$$cat.icon',
                  },
                },
              },
              0,
            ],
          },
        },
      },
      { $skip: (page - 1) * itemsPerPage },
      { $limit: itemsPerPage },
    ]).exec();

    let myCategories = [...new Map(products?.map(ele => [ele?.category?.name, { name: ele?.category?.name, icon: ele?.category?.icon || '' }])).values()];

    let data = pagination(products, page, totalItems, itemsPerPage, getAll);

    return res.status(200).json({
      ...data,
      myCategories,
      code: 200,
      success: true,
    });
  },

  searchProducts: async (req, res) => {
    let { page, itemsPerPage, getAll, ...filters } = filterAdvancedSearchQuery(req);

    let query = {
      $and: [
        { $expr: { $lt: ['$valueRaised', '$assetValue'] } },
        { isVerified: true },
        {
          $or: [{ $expr: { $lt: ['$currentBackers', '$maximumBackers'] } }, { $and: [{ maximumBackers: null }, { isInfiniteBackers: true }] }],
        },
        { verificationStatus: { $nin: ['rejected', 'pending'] } },
        { deadline: { $gte: new Date() } },
      ],
      $or: [],
    };

    if (filters.searchText) {
      query.$and.push({
        $or: [
          { productName: { $regex: filters.searchText, $options: 'i' } },
          { address: { $regex: filters.searchText, $options: 'i' } },
          { description: { $regex: filters.searchText, $options: 'i' } },
          { amenities: { $regex: filters.searchText, $options: 'i' } },
          { investmentReason: { $regex: filters.searchText, $options: 'i' } },
        ],
      });
    }

    if (filters.investmentType) {
      query.$and.push({ investmentType: new mongoose.Types.ObjectId(filters.investmentType) });
    }
    if (filters.kycLevel) {
      query.$and.push({ kycLevel: filters.kycLevel });
    }

    if (filters.minInvestmentVolume !== undefined && filters.minInvestmentVolume !== '') {
      query.$and.push({
        assetValue: {
          $gte: filters.minInvestmentVolume,
        },
      });
    } else {
      query.$and.push({
        assetValue: {
          $gte: Number.NEGATIVE_INFINITY,
        },
      });
    }

    if (filters.maxInvestmentVolume !== undefined && filters.maxInvestmentVolume !== '') {
      query.$and.push({
        assetValue: {
          $lte: filters.maxInvestmentVolume,
        },
      });
    } else {
      query.$and.push({
        assetValue: {
          $lte: Number.POSITIVE_INFINITY,
        },
      });
    }

    if (filters.valueRaised) {
      query.$and.push({ valueRaised: { $gte: filters.valueRaised } });
    }
    if (filters.maxAnnualCost) {
      query.$and.push({ annualCost: { $lte: filters.maxAnnualCost } });
    }
    if (filters.minimumBackers) {
      query.$and.push({ minimumBackers: { $gte: filters.minimumBackers } });
    }
    if (filters.country) {
      query.$and.push({ 'addressDetails.country': filters.country });
    }

    if (filters.daysLeft) {
      const endDate = new Date(Date.now() + filters.daysLeft * 24 * 60 * 60 * 1000);
      endDate.setUTCHours(0, 0, 0, 0);
      query.$and.push({ deadline: { $eq: endDate } });
    }

    if (!query.$and.length > 0) {
      delete query.$and;
    }
    if (!query.$or.length > 0) {
      delete query.$or;
    }

    let totalItems = await PRODUCT.countDocuments(query);

    if (getAll === true) {
      page = 1;
      itemsPerPage = totalItems;
    }

    let pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'user',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      {
        $match: {
          $or: [{ 'userInfo.status': 'Active' }, { 'userInfo.status': { $exists: false } }],
        },
      },
      { $lookup: { from: 'category', localField: 'investmentType', foreignField: '_id', as: 'investmentType' } },
      { $lookup: { from: 'user', localField: 'userId', foreignField: '_id', as: 'userInfo' } },
      {
        $addFields: {
          fundingRatio: { $multiply: [{ $divide: ['$valueRaised', '$assetValue'] }, 100] },
        },
      },
      {
        $project: {
          _id: 1,
          productName: 1,
          media: 1,
          valueRaised: 1,
          assetValue: 1,
          deadline: 1,
          maximumBackers: 1,
          annualCost: 1,
          minimumInvestment: 1,
          returnRatio: 1,
          currentBackers: 1,
          investmentType: 1,
          kycLevel: 1,
          fundingRatio: 1,
          userInfo: {
            _id: 1,
            isIndividualSeller: 1,
          },
          investmentType: {
            $arrayElemAt: ['$investmentType.name', 0],
          },
        },
      },
    ];

    if (filters.type !== '' && filters.type !== undefined && filters.type !== 'undefined') {
      pipeline.push({
        $match: filters.type === 'private' ? { 'userInfo.isIndividualSeller': true } : { $or: [{ 'userInfo.isIndividualSeller': { $exists: false } }, { 'userInfo.isIndividualSeller': false }] },
      });
    }

    pipeline.push({ $skip: (page - 1) * itemsPerPage }, { $limit: itemsPerPage });

    let products = await PRODUCT.aggregate(pipeline);

    let sidePipeline;
    if (page === 1) {
      sidePipeline = await PRODUCT.aggregate([
        {
          $facet: {
            priceStats: [
              {
                $group: {
                  _id: null,
                  maxPrice: { $max: '$assetValue' },
                  minPrice: { $min: '$assetValue' },
                },
              },
              {
                $project: {
                  _id: 0,
                  maxPrice: 1,
                  minPrice: 1,
                },
              },
            ],
            uniqueCountries: [
              {
                $group: {
                  _id: null,
                  uniqueCountries: { $addToSet: '$addressDetails.country' },
                },
              },
              {
                $project: {
                  _id: 0,
                  uniqueCountries: 1,
                },
              },
            ],
          },
        },
      ]);
    }

    let data = pagination(products, page, totalItems, itemsPerPage, getAll);

    return res.status(200).json({
      ...data,
      code: 200,
      success: true,
      ...(page === 1
        ? {
            priceStats: sidePipeline[0]?.priceStats?.[0],
            uniqueCountries: sidePipeline[0]?.uniqueCountries?.[0]?.uniqueCountries,
          }
        : {}),
    });
  },

  downloadStatement: async (req, res) => {
    const { endDate, startDate, productId } = req.body;
    const id = req.user?._id;
    let statement;
    // if (!id || !productId || !startDate || !endDate) {
    //   return res.status(400).json({ message: 'Missing required parameters', code: 400, success: false });
    // }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (productId) {
      const query = {
        product: productId,
        created_at: { $gte: start, $lt: end },
      };

      statement = await INVESTMENT.find(query).populate({ path: 'product', model: PRODUCT, select: 'productName assetValue' }).lean();
    } else {
      const pipeline = [
        {
          $match: {
            userId: id,
          },
        },
        {
          $lookup: {
            from: 'investment',
            let: { productId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$product', '$$productId'] }, { $gte: ['$created_at', start] }, { $lt: ['$created_at', end] }],
                  },
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
                $project: {
                  _id: 0,
                  productName: '$productDetails.productName',
                  assetValue: '$productDetails.assetValue',
                  investmentAmount: '$investmentAmount',
                },
              },
            ],
            as: 'investments',
          },
        },
        {
          $unwind: '$investments',
        },
        {
          $replaceRoot: { newRoot: '$investments' },
        },
      ];

      statement = await PRODUCT.aggregate(pipeline);
    }

    if (statement) {
      const tempDir = path.join(__dirname, 'temp');

      // Create 'temp' directory if it doesn't exist
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
      }

      const workbook = new excelJS.Workbook();
      const worksheet = workbook.addWorksheet('Investments');
      worksheet.columns = [
        { header: 'S no.', key: 's_no', width: 10 },
        { header: 'Product Name', key: 'productName', width: 30 },
        { header: 'Investment Amount', key: 'investmentAmount', width: 20 },
        { header: 'Asset Value', key: 'assetValue', width: 20 },
      ];

      let counter = 1;
      statement.forEach(investment => {
        investment.s_no = counter;
        investment.productName = investment?.product?.productName || investment?.productName;
        worksheet.addRow(investment);
        counter++;
      });

      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
      });

      const filePath = path.join(__dirname, 'temp', 'statement.xlsx');
      await workbook.xlsx.writeFile(filePath);

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=statement.xlsx');

      const filestream = fs.createReadStream(filePath);
      filestream.pipe(res);

      filestream.on('end', () => {
        fs.unlinkSync(filePath);
      });
    }
  },
  getProductFromEditRequest: async (req, res) => {
    const { id } = req.params;

    const data = await PRODUCT_EDIT_REQUEST.findOne({ productId: id }).populate({ path: 'investmentType', model: CATEGORY, select: 'name' });

    return res.status(200).json({
      success: true,
      message: `Retrieved Successfully!`,
      data,
    });
  },

  manageProductEdit: async (req, res) => {
    const { id } = req.params;
    const { status, declineReason } = req.body;

    const editedProduct = await PRODUCT_EDIT_REQUEST.findOne({ productId: id });
    const originalProd = await PRODUCT.findById(id);

    if (status === 'Approve') {
      const { _id, productId, ...updateFields } = editedProduct.toObject();
      await PRODUCT.findByIdAndUpdate(id, {
        $set: {
          ...updateFields,
          isProductRequest: false,
          editRequestDeclineReason: '',
          ...(originalProd?.verificationStatus === 'rejected' ? { verificationStatus: 'pending' } : {}),
        },
      });

      await PRODUCT_EDIT_REQUEST.findOneAndDelete({ productId: id });
    } else {
      await PRODUCT.findByIdAndUpdate(id, { $set: { isProductRequest: false, editRequestDeclineReason: declineReason } });
      await PRODUCT_EDIT_REQUEST.findOneAndDelete({ productId: id });
    }

    const notificationData = {
      actionType: `product_${status}d`,
      title: `${status.charAt(0).toUpperCase() + status.slice(1)}d`,
      message: [`Your request to edit the product "${editedProduct.productName}" has been ${status}d. ${status === 'Decline' ? `Reason: ${declineReason}` : ''}`],
    };

    await createNotification([editedProduct.userId], notificationData, [], {
      sellerNotification: true,
    });

    return res.status(200).json({
      success: true,
      message: `Product Edit Request ${status}d Successfully!`,
    });
  },

  bestSellingSellerProducts: async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not provided' });
    }

    const bestSellingProducts = await PRODUCT.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalValueRaised: { $sum: '$valueRaised' },
          products: { $push: { _id: '$_id', productName: '$productName', valueRaised: '$valueRaised' } },
        },
      },
      { $unwind: '$products' },
      {
        $project: {
          productName: '$products.productName',
          valueRaised: '$products.valueRaised',
          sellingScore: {
            $round: [{ $multiply: [{ $divide: ['$products.valueRaised', '$totalValueRaised'] }, 100] }, 2],
          },
        },
      },
      { $sort: { sellingScore: -1 } },
      { $limit: 5 },
    ]);

    return res.status(200).json({
      success: true,
      message: 'Seller best-selling products retrieved successfully',
      data: bestSellingProducts,
    });
  },
};
